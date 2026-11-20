import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  Orchestrator,
  ROLE_IDS,
  RoleRegistry,
  TeamOptions,
  type RoleConfig,
  type RoleId,
} from "../src/agents";
import { HELP, parseCliArgs } from "../src/cli/main";
import { CodeIntel, codeTools, relevantCode, type EmbeddingProvider } from "../src/intelligence";
import { MemoryRulesStore, Policy } from "../src/policy";
import type { EventBody } from "../src/protocol";
import { createWorktree, discardWorktree } from "../src/worktree";
import { routedModel, tmpDir, tmpGitRepo, toolCtx, type RouteInfo, type Turn } from "./helpers";

const json = (v: unknown) => "```json\n" + JSON.stringify(v, null, 2) + "\n```";

const CODE = {
  "README.md": "app\n",
  "src/health.ts": `export function healthCheck() {\n  return { status: "BODY_MARKER_42" };\n}\n`,
  "src/server.ts": `import { healthCheck } from "./health";\nexport function startServer() {\n  return healthCheck();\n}\n`,
  "src/ui/badge.ts": `export function renderBadge(label: string) {\n  return "<span>" + label + "</span>";\n}\n`,
};

describe("team workers get code context", () => {
  test("a worker's system prompt has the codebase overview and a relevant-code list (references, no contents)", async () => {
    const repo = tmpGitRepo(CODE);
    const intel = new CodeIntel();
    await intel.build(repo);
    const integration = await createWorktree(repo, "gaps1");
    const PLAN = {
      summary: "One subtask.",
      tasks: [
        {
          id: "api",
          title: "Extend the health check",
          role: "backend",
          description: "Add uptime to healthCheck in the health endpoint",
          files: ["src/health.ts"],
        },
      ],
    };
    const systems: Record<string, string> = {};
    const route = (r: RouteInfo): Turn => {
      if (r.task.startsWith("Plan this request")) return { text: json(PLAN) };
      if (/subtask "api"/.test(r.task)) return { text: "Looked at the code; nothing to change." };
      return { text: "(unrouted)" };
    };
    const model = routedModel(route, {
      onCall: (r) => {
        const key = r.task.startsWith("Plan this request")
          ? "planner"
          : /subtask "api"/.test(r.task)
            ? "api"
            : "other";
        systems[key] ??= r.system;
      },
    });
    const home = tmpDir("vard-home-");
    const registry = new RoleRegistry({ home, projectRoot: repo });
    const roles = Object.fromEntries(ROLE_IDS.map((id) => [id, registry.role(id)])) as Record<
      RoleId,
      RoleConfig
    >;
    const events: EventBody[] = [];
    const orch = new Orchestrator({
      taskId: "gaps1",
      goal: "Add uptime to the health check",
      projectRoot: repo,
      integration,
      roles,
      options: TeamOptions.parse({ review: false, onFailure: "continue" }),
      emit: (e) => events.push(e),
      requestApproval: async () => ({ decision: "allow_once" }),
      modelFor: () => ({ model, label: "anthropic/mock" }),
      policyFor: (workRoot) =>
        new Policy({ projectRoot: repo, workRoot, store: new MemoryRulesStore() }),
      memory: null,
      signal: new AbortController().signal,
      reflectModel: model,
      learn: null,
      codeIntel: intel,
    });
    const r = await orch.run();
    expect(r.status).toBe("done");
    const sys = systems.api;
    expect(sys).toBeDefined();
    expect(sys).toContain("# Codebase overview");
    expect(sys).toContain("Languages:");
    expect(sys).toContain("# Relevant code for this subtask");
    const section = sys.split("# Relevant code for this subtask")[1];
    expect(section).toContain("src/health.ts:1");
    expect(section).toContain("healthCheck");
    expect(section).toContain("(planned)");
    // References only: never the file's contents.
    expect(section).not.toContain("BODY_MARKER_42");
    // The planner gets the overview too (like a solo task).
    expect(systems.planner).toContain("# Codebase overview");
    await discardWorktree(integration);
    intel.closeAll();
  }, 30_000);

  test("without a code index, workers run as before (no code sections)", async () => {
    const repo = tmpGitRepo(CODE);
    const integration = await createWorktree(repo, "gaps2");
    const PLAN = {
      summary: "x",
      tasks: [
        {
          id: "api",
          title: "Extend the health check",
          role: "backend",
          description: "d",
          files: [],
        },
      ],
    };
    let sys = "";
    const model = routedModel(
      (r) => (r.task.startsWith("Plan this request") ? { text: json(PLAN) } : { text: "done" }),
      {
        onCall: (r) => {
          if (/subtask "api"/.test(r.task)) sys = r.system;
        },
      },
    );
    const home = tmpDir("vard-home-");
    const registry = new RoleRegistry({ home, projectRoot: repo });
    const roles = Object.fromEntries(ROLE_IDS.map((id) => [id, registry.role(id)])) as Record<
      RoleId,
      RoleConfig
    >;
    const r = await new Orchestrator({
      taskId: "gaps2",
      goal: "g",
      projectRoot: repo,
      integration,
      roles,
      options: TeamOptions.parse({ review: false, onFailure: "continue" }),
      emit: () => {},
      requestApproval: async () => ({ decision: "allow_once" }),
      modelFor: () => ({ model, label: "anthropic/mock" }),
      policyFor: (workRoot) =>
        new Policy({ projectRoot: repo, workRoot, store: new MemoryRulesStore() }),
      memory: null,
      signal: new AbortController().signal,
      reflectModel: model,
      learn: null,
    }).run();
    expect(r.status).toBe("done");
    expect(sys).not.toContain("# Codebase overview");
    expect(sys).not.toContain("# Relevant code for this subtask");
    await discardWorktree(integration);
  }, 30_000);

  test("relevantCode is capped by entries and characters", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++)
      files[`src/health${i}.ts`] = `export function healthProbe${i}() { return ${i}; }\n`;
    const repo = tmpGitRepo(files);
    const intel = new CodeIntel();
    await intel.build(repo);
    const ix = intel.get(repo);
    const list = await relevantCode(ix, "health probe", { maxEntries: 8, maxChars: 1_200 });
    const lines = list.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(list.length).toBeLessThanOrEqual(1_200);
    const tiny = await relevantCode(ix, "health probe", { maxChars: 80 });
    expect(tiny.length).toBeLessThanOrEqual(80);
    intel.closeAll();
  });
});

describe("embeddings stay fresh", () => {
  const mockProvider = (sent: string[]): EmbeddingProvider => ({
    id: "mock/v1",
    async embed(texts) {
      sent.push(...texts);
      return texts.map((t) => [t.length % 7, 1, 0.5]);
    },
  });

  test("code_reindex (intel.ensure) re-embeds changed chunks in the background when embeddings are on", async () => {
    const repo = tmpGitRepo(CODE);
    const sent: string[] = [];
    const intel = new CodeIntel({ embeddingsFor: () => mockProvider(sent) });
    const reindex = codeTools(intel).find((t) => t.name === "code_reindex")!;
    await reindex.execute({} as never, toolCtx(repo));
    await intel.refreshEmbeddings(repo);
    expect(sent.some((t) => t.includes("healthCheck"))).toBe(true);
    const count = () =>
      (intel.get(repo).db().db.query("SELECT COUNT(*) AS n FROM embeddings").get() as { n: number })
        .n;
    const before = count();
    expect(before).toBeGreaterThan(0);

    // A new file: only its chunk is embedded on the next reindex.
    sent.length = 0;
    fs.writeFileSync(
      path.join(repo, "src/uptime.ts"),
      "export function uptimeSeconds() { return 1; }\n",
    );
    await reindex.execute({} as never, toolCtx(repo));
    await intel.refreshEmbeddings(repo);
    expect(sent.some((t) => t.includes("uptimeSeconds"))).toBe(true);
    expect(sent.some((t) => t.includes("renderBadge"))).toBe(false);
    expect(count()).toBeGreaterThan(before);
    intel.closeAll();
  });

  test("no embeddings configured: nothing is embedded", async () => {
    const repo = tmpGitRepo(CODE);
    const intel = new CodeIntel();
    await intel.ensure(repo);
    await intel.refreshEmbeddings(repo);
    expect(
      (intel.get(repo).db().db.query("SELECT COUNT(*) AS n FROM embeddings").get() as { n: number })
        .n,
    ).toBe(0);
    intel.closeAll();
  });

  test("embedding failures are logged, never thrown", async () => {
    const repo = tmpGitRepo(CODE);
    const intel = new CodeIntel({
      embeddingsFor: () => ({
        id: "mock/bad",
        async embed() {
          throw new Error("provider down");
        },
      }),
    });
    const orig = console.error;
    const logged: string[] = [];
    console.error = (...a: unknown[]) => void logged.push(a.join(" "));
    try {
      expect(await intel.ensure(repo)).toBe("ready");
      await intel.refreshEmbeddings(repo);
    } finally {
      console.error = orig;
    }
    expect(logged.join()).toContain("provider down");
    expect(intel.get(repo).lastError).toContain("embeddings");
    intel.closeAll();
  });
});

describe("vard run --retest-rounds", () => {
  test("parses 0-3, rejects others, and is in the help", () => {
    expect(parseCliArgs(["run", "--team", "--retest-rounds", "3", "x"]).flags.retestRounds).toBe(3);
    expect(parseCliArgs(["run", "--team", "--retest-rounds", "0", "x"]).flags.retestRounds).toBe(0);
    expect(parseCliArgs(["run", "x"]).flags.retestRounds).toBeUndefined();
    expect(() => parseCliArgs(["run", "--retest-rounds", "4", "x"])).toThrow("0 to 3");
    expect(() => parseCliArgs(["run", "--retest-rounds", "-1", "x"])).toThrow();
    expect(() => parseCliArgs(["run", "--retest-rounds", "1.5", "x"])).toThrow("0 to 3");
    expect(HELP).toContain("--retest-rounds");
    expect(HELP).toMatch(/vard mcp \[[^\]]*enable\|disable[^\]]*untrust[^\]]*revoke/);
    expect(HELP).toMatch(/vard memory \[[^\]]*export[^\]]*rebuild[^\]]*path/);
  });
});
