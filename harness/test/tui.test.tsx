import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { makeCtx } from "../src/cli/context";
import { MemoryStore } from "../src/memory";
import { KeyStore } from "../src/cli/keys";
import { NonInteractivePrompter } from "../src/cli/prompt";
import { App, type KeySource } from "../src/tui/app";
import * as E from "../src/tui/editor";
import { splitKeys } from "../src/tui/keys";
import { parseBlocks } from "../src/tui/markdown";
import { scriptedModel, tmpDir, tmpGitRepo, type Turn, withReflection } from "./helpers";

const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function until(get: () => string, needle: string | RegExp, ms = 5000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const text = get();
    if (typeof needle === "string" ? text.includes(needle) : needle.test(text)) return text;
    await tick(20);
  }
  throw new Error(`timed out waiting for ${needle}\n--- screen ---\n${get().slice(-3000)}`);
}

function mount(opts: { turns?: Turn[]; cwd?: string; reflect?: string } = {}) {
  const home = tmpDir("vard-tui-home-");
  const env = { VARD_HOME: home, GROQ_API_KEY: "gsk_test" };
  const ctx = makeCtx({
    out: { write() {} },
    err: { write() {} },
    color: false,
    spinner: false,
    prompter: new NonInteractivePrompter(false),
    cwd: opts.cwd ?? home,
    env,
    keys: new KeyStore(env, () => ({ code: 44, stdout: "", stderr: "" }), "darwin"),
    modelFactory: () => withReflection(scriptedModel(opts.turns ?? []), opts.reflect ?? "[]"),
  });
  let push: (c: string) => void = () => {};
  const keys: KeySource = (fn) => {
    push = fn;
    return () => {};
  };
  let exitCode: number | null = null;
  const r = render(<App ctx={ctx} keys={keys} onExit={(c) => (exitCode = c)} />);
  const screen = () => strip(r.frames.join("\n"));
  const type = async (s: string) => {
    push(s);
    await tick();
  };
  return { r, ctx, home, screen, type, exitCode: () => exitCode };
}

describe("key splitting", () => {
  test("a chunk with text and Enter becomes two presses", () => {
    expect(splitKeys("hi\r")).toEqual([
      { input: "hi", key: {} },
      { input: "\r", key: { return: true } },
    ]);
  });

  test("control keys, arrows and a pasted multi-line block", () => {
    const keys = splitKeys("\t\x7f\x1b[A\x03");
    expect(keys.map((k) => Object.keys(k.key)[0] ?? k.input)).toEqual(["tab", "backspace", "upArrow", "ctrl"]);
    expect(keys[3].input).toBe("c");
    expect(splitKeys("line one\rline two")).toEqual([{ input: "line one\nline two", key: {} }]);
    expect(splitKeys("\x1b")).toEqual([{ input: "", key: { escape: true } }]);
  });
});

describe("editor", () => {
  test("insert, move and delete across lines", () => {
    let ed = E.insert(E.empty, "ab\ncd");
    ed = E.vertical(ed, -1)!;
    expect(ed.cursor).toBe(2);
    ed = E.backspace(ed);
    expect(ed.value).toBe("a\ncd");
    expect(E.vertical(ed, -1)).toBeNull();
    expect(E.deleteWordBack(E.set("hello big world")).value).toBe("hello big ");
  });

  test("history keeps the line being typed", () => {
    const h = new E.History();
    h.push("first");
    h.push("second");
    expect(h.prev("draft")).toBe("second");
    expect(h.prev("")).toBe("first");
    expect(h.next()).toBe("second");
    expect(h.next()).toBe("draft");
  });
});

describe("markdown", () => {
  test("parses fences, headings and lists", () => {
    const kinds = parseBlocks("# Title\n\n- one\n1. two\n```ts\nconst a = 1;\n```\nplain").map((b) => b.kind);
    expect(kinds).toEqual(["heading", "blank", "bullet", "bullet", "code", "text"]);
  });
});

describe("TUI", () => {
  test("shows the banner and status bar, and streams a chat reply", async () => {
    const m = mount({ turns: [{ text: "The answer is **42**." }] });
    await until(m.screen, "Message vard");
    expect(m.screen()).toContain("Vard AI");
    expect(m.screen()).toContain("GPT-OSS 120B (groq)");
    await m.type("what is 6*7?\r");
    await until(m.screen, "The answer is 42.");
    await until(m.screen, /tok │ idle/);
    const saved = fs.readdirSync(path.join(m.home, "sessions"));
    expect(saved.length).toBe(1);
    m.r.unmount();
  });

  test("slash commands autocomplete and run", async () => {
    const m = mount();
    await until(m.screen, "Message vard");
    await m.type("/he");
    await until(m.screen, "Commands and keys");
    await m.type("\t");
    await m.type("\r");
    await until(m.screen, "Resume an earlier conversation");
    await m.type("/plan off\r");
    await until(m.screen, "plan off");
    m.r.unmount();
  });

  test("model picker filters and switches the model", async () => {
    const m = mount();
    await until(m.screen, "Message vard");
    await m.type("/model\r");
    await until(m.screen, "Choose a model");
    await m.type("oss-20");
    await until(m.screen, "filter: oss-20");
    await m.type("\r");
    await until(m.screen, "GPT-OSS 20B (groq)");
    expect(m.ctx.config.load().model).toBe("openai/gpt-oss-20b");
    m.r.unmount();
  });

  test("runs an agent task with plan and command approvals, then merges", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const turns: Turn[] = [
      { calls: [{ name: "read_file", input: { path: "hello.txt" } }] },
      { text: "1. Change world to vard" },
      { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
      { calls: [{ name: "run_command", input: { command: "cat hello.txt" } }] },
      { text: "Changed hello.txt." },
    ];
    const m = mount({ turns, cwd: repo });
    await until(m.screen, "Message vard");
    await m.type("/task say hello to vard\r");
    await until(m.screen, "Approve this plan?");
    await m.type("y");
    await until(m.screen, "Allow run_command?");
    await m.type("a");
    await until(m.screen, /Merge vard\/tui-/);
    await m.type("m");
    await until(m.screen, "Merged vard/");
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello vard\n");
    m.r.unmount();
  });

  test("after a task, the memory checklist saves the checked notes; /memory shows them", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const m = mount({ cwd: repo, reflect: '[{"category":"architecture","text":"Greetings live in hello.txt"},{"category":"issues","text":"Do not touch the old greeting file"}]', turns: [
      { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
      { text: "Done." },
    ] });
    await until(m.screen, "Message vard");
    await m.type("/plan off\r");
    await m.type("/task fix the greeting\r");
    await until(m.screen, /Merge vard\/tui-/);
    await m.type("k");
    await until(m.screen, "Remember for next time?");
    await m.type("\x1b[B"); // down to the second note
    await m.type(" "); // uncheck it
    await m.type("\r");
    await until(m.screen, "Remembered 1 note");
    const mem = new MemoryStore(repo).active().map((e) => e.text).join("\n");
    expect(mem).toContain("Greetings live in hello.txt");
    expect(mem).not.toContain("old greeting");
    await m.type("/memory\r");
    await until(m.screen, /Project memory · \d+ notes/);
    await until(m.screen, /memory \d+/);
    m.r.unmount();
  });

  test("Ctrl+C twice quits", async () => {
    const m = mount();
    await until(m.screen, "Message vard");
    await m.type("\x03");
    await until(m.screen, "Press Ctrl+C again to quit");
    await m.type("\x03");
    expect(m.exitCode()).toBe(130);
  });
});

describe("team panel", () => {
  test("shows one line per agent with its status and activity", async () => {
    const { TeamPanel, COMMANDS } = await import("../src/tui/components");
    const agents = [
      { agentId: "backend-api", role: "backend", status: "running", activity: "write_file api.txt", steps: 2, maxSteps: 40, usage: { totalTokens: 10 } },
      { agentId: "frontend-ui", role: "frontend", status: "waiting_approval", steps: 1, maxSteps: 40, usage: { totalTokens: 5 } },
      { agentId: "planner-1", role: "planner", status: "completed", steps: 3, maxSteps: 14, usage: { totalTokens: 9 } },
    ];
    const r = render(<TeamPanel agents={agents} />);
    const frame = r.lastFrame() ?? "";
    expect(frame).toContain("backend-api");
    expect(frame).toContain("write_file api.txt");
    expect(frame).toContain("waiting approval");
    expect(frame).toContain("✓ planner-1");
    r.unmount();
    expect(COMMANDS.map((c) => c.name)).toEqual(expect.arrayContaining(["/team", "/retry", "/pause", "/resume", "/continue", "/skills"]));
  });
});
