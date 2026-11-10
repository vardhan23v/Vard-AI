import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { AgentLoop } from "../src/loop";
import { MemoryRulesStore, Policy } from "../src/policy";
import type { Event } from "../src/protocol";
import { Server } from "../src/server";
import { readTrace } from "../src/trace";
import { scriptedModel, sh, tmpDir, tmpGitRepo, type Turn } from "./helpers";

const provider = { provider: "anthropic" as const, model: "mock", apiKey: "test-key" };

/** A Server wired to a scripted model that answers approvals with `answer`. */
function harness(turns: Turn[], answer: (e: Extract<Event, { type: "approval_request" }>) => object) {
  const events: Event[] = [];
  const traceDir = tmpDir("vard-traces-");
  let server!: Server;
  let resolveDone!: (e: Event) => void;
  const done = new Promise<Event>((r) => (resolveDone = r));
  server = new Server({
    traceDir,
    modelFactory: () => scriptedModel(turns),
    rulesStoreFor: () => new MemoryRulesStore(),
    write: (e) => {
      events.push(e);
      if (e.type === "approval_request")
        queueMicrotask(() =>
          server.handle({
            id: `ans-${e.approvalId}`,
            type: "task.approve",
            taskId: e.taskId!,
            approvalId: e.approvalId,
            ...(answer(e) as any),
          }),
        );
      if (e.type === "done" && e.taskId) resolveDone(e);
    },
  });
  return { server, events, done, traceDir };
}

describe("agent loop (mock model, temp git repo)", () => {
  test("plans, gets approval, edits a file in its worktree, runs a command, and finishes", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const turns: Turn[] = [
      // planning (read-only)
      { calls: [{ name: "read_file", input: { path: "hello.txt" } }] },
      { text: "1. Change 'world' to 'vard' in hello.txt\n2. Check with cat" },
      // acting
      {
        text: "Editing now.",
        calls: [
          {
            name: "todo_write",
            input: { todos: [{ id: "1", content: "edit hello.txt", status: "in_progress" }] },
          },
          { name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } },
        ],
      },
      { calls: [{ name: "run_command", input: { command: "cat hello.txt" } }] },
      { calls: [{ name: "read_file", input: { path: "../../../../etc/passwd" } }] },
      { text: "Done: hello.txt now says hello vard." },
    ];
    const h = harness(turns, () => ({ decision: "allow_once" }));
    await h.server.handle({
      id: "req-1",
      type: "task.start",
      taskId: "t1",
      projectRoot: repo,
      prompt: "Say hello to vard instead of world",
      provider,
      planFirst: true,
      useWorktree: true,
    });
    const done = (await h.done) as Extract<Event, { type: "done" }>;

    expect(done.status).toBe("done");
    expect(done.summary).toBe("Done: hello.txt now says hello vard.");
    expect(done.steps).toBe(6);
    expect(done.diffStat).toContain("hello.txt");

    // the worktree has the change, the user's checkout does not
    const wt = path.join(repo, ".vard", "worktrees", "t1");
    expect(fs.readFileSync(path.join(wt, "hello.txt"), "utf8")).toBe("hello vard\n");
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello world\n");
    expect(sh(wt, ["git", "branch", "--show-current"]).trim()).toBe("vard/t1");

    const types = h.events.map((e) => e.type);
    expect(types).toContain("plan");
    expect(types).toContain("token");
    expect(types).toContain("usage");
    expect(types).toContain("todos");
    // plan approval + run_command approval
    const approvals = h.events.filter((e) => e.type === "approval_request") as any[];
    expect(approvals.map((a) => a.kind)).toEqual(["plan", "tool"]);
    expect(approvals[1].tool).toBe("run_command");
    // state machine visited the expected states in order
    const states = h.events.filter((e) => e.type === "state").map((e: any) => e.state);
    expect(states.slice(0, 5)).toEqual(["planning", "observing", "planning", "awaiting_plan_approval", "acting"]);
    expect(states.at(-1)).toBe("done");

    const results = h.events.filter((e) => e.type === "tool_result") as any[];
    expect(results.find((r) => r.tool === "edit_file").ok).toBe(true);
    expect(results.find((r) => r.tool === "run_command").output).toContain("hello vard");
    const escaped = results.filter((r) => r.tool === "read_file").at(-1);
    expect(escaped.ok).toBe(false);
    expect(escaped.output).toContain("blocked by policy");
    // every event is stamped with the request and task id
    expect(h.events.filter((e) => e.taskId === "t1").every((e) => e.id === "req-1" || e.id.startsWith("ans-"))).toBe(
      true,
    );

    // trace has the whole run, with the API key redacted
    const trace = readTrace(path.join(h.traceDir, "t1.jsonl"));
    expect(trace[0].type).toBe("request");
    expect(JSON.stringify(trace)).not.toContain("test-key");
    expect(trace.some((r) => r.type === "approval_request")).toBe(true);
    expect(trace.at(-1).type).toBe("done");

    // diff, then merge into the main checkout
    await h.server.handle({ id: "d1", type: "task.diff", taskId: "t1" });
    const diff = h.events.find((e) => e.type === "diff") as any;
    expect(diff.diff).toContain("+hello vard");
    await h.server.handle({ id: "m1", type: "task.merge", taskId: "t1" });
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello vard\n");
    expect(fs.existsSync(wt)).toBe(false);
    expect(sh(repo, ["git", "branch", "--list", "vard/t1"]).trim()).toBe("");
  });

  test("denied tool calls are reported back to the model, not executed", async () => {
    const repo = tmpGitRepo();
    const h = harness(
      [
        { calls: [{ name: "run_command", input: { command: "touch made.txt" } }] },
        { text: "Could not run it." },
      ],
      (e) => ({ decision: "deny", reason: "not now" }),
    );
    await h.server.handle({
      id: "r",
      type: "task.start",
      taskId: "t2",
      projectRoot: repo,
      prompt: "x",
      provider,
      planFirst: false,
      useWorktree: true,
    });
    const done = (await h.done) as any;
    expect(done.status).toBe("done");
    const r = h.events.find((e) => e.type === "tool_result") as any;
    expect(r.ok).toBe(false);
    expect(r.output).toContain("denied");
    expect(fs.existsSync(path.join(repo, ".vard/worktrees/t2/made.txt"))).toBe(false);
  });

  test("rejecting the plan with feedback re-plans", async () => {
    const repo = tmpGitRepo();
    let n = 0;
    const h = harness(
      [{ text: "Plan A" }, { text: "Plan B" }, { text: "finished" }],
      () => (n++ === 0 ? { decision: "deny", reason: "use plan B" } : { decision: "allow_once" }),
    );
    await h.server.handle({ id: "r", type: "task.start", taskId: "t3", projectRoot: repo, prompt: "x", provider, planFirst: true, useWorktree: false });
    const done = (await h.done) as any;
    expect(done.status).toBe("done");
    expect(h.events.filter((e) => e.type === "plan").map((e: any) => e.plan)).toEqual(["Plan A", "Plan B"]);
  });
});

describe("loop limits", () => {
  const base = () => {
    const root = tmpDir();
    fs.writeFileSync(path.join(root, "a.txt"), "a\n");
    const events: any[] = [];
    return {
      root,
      events,
      opts: {
        taskId: "lim",
        prompt: "loop forever",
        projectRoot: root,
        workRoot: root,
        policy: new Policy({ projectRoot: root, workRoot: root, store: new MemoryRulesStore() }),
        emit: (e: any) => events.push(e),
        requestApproval: async () => ({ decision: "allow_once" as const }),
        planFirst: false,
      },
    };
  };
  const forever: Turn[] = Array.from({ length: 50 }, () => ({ calls: [{ name: "list_dir", input: {} }] }));

  test("blocks at maxSteps", async () => {
    const b = base();
    const r = await new AgentLoop({ ...b.opts, model: scriptedModel(forever), maxSteps: 3 }).run();
    expect(r.status).toBe("blocked");
    expect(r.reason).toContain("step limit");
    expect(r.steps).toBe(3);
  });

  test("blocks when the token budget is exhausted", async () => {
    const b = base();
    const r = await new AgentLoop({ ...b.opts, model: scriptedModel(forever), tokenBudget: 250 }).run();
    expect(r.status).toBe("blocked");
    expect(r.reason).toContain("token budget");
    expect(r.usage.totalTokens).toBeGreaterThanOrEqual(250);
  });

  test("cancel while waiting for an approval", async () => {
    const b = base();
    const abort = new AbortController();
    const loop = new AgentLoop({
      ...b.opts,
      model: scriptedModel([{ calls: [{ name: "run_command", input: { command: "make" } }] }]),
      requestApproval: () => {
        setTimeout(() => abort.abort(), 10);
        return new Promise(() => {}); // never answered
      },
      signal: abort.signal,
    });
    const r = await loop.run();
    expect(r.status).toBe("cancelled");
    expect(b.events.at(-1)).toEqual({ type: "state", state: "cancelled" });
  });

  test("verify failures go back to the model until they pass", async () => {
    const b = base();
    const r = await new AgentLoop({
      ...b.opts,
      model: scriptedModel([
        { text: "done (not really)" },
        { calls: [{ name: "write_file", input: { path: "ok", content: "" } }] },
        { text: "fixed" },
      ]),
      verifyCommand: "test -f ok",
    }).run();
    expect(r.status).toBe("done");
    expect(r.summary).toBe("fixed");
    expect(b.events.filter((e) => e.type === "verify").map((e) => e.status)).toEqual([
      "running",
      "failed",
      "running",
      "passed",
    ]);
  });
});
