import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { buildSystemPrompt } from "../src/context";
import { MemoryStore, parseProposals, recall, scanProject } from "../src/memory";
import { MemoryRulesStore } from "../src/policy";
import type { Event } from "../src/protocol";
import { Server } from "../src/server";
import { scriptedModel, tmpDir, tmpGitRepo, type Turn } from "./helpers";

describe("memory store", () => {
  test("adds dated bullets in section order, skips repeats and keeps the user's own text", () => {
    const dir = tmpDir("vard-mem-");
    const m = new MemoryStore(dir);
    m.write("# Project memory\n\nMy own note at the top.\n\n## Decisions\n- Use Zod for validation (2026-01-02)\n\n## Scratch\nanything goes\n");
    const added = m.add([
      { section: "conventions", text: "Tests run with `bun test`" },
      { section: "decisions", text: "use zod for validation." },
      { section: "issues", text: "Port 1420 can be held by an old dev server" },
    ]);
    expect(added.map((a) => a.section)).toEqual(["conventions", "issues"]);
    const text = m.read();
    expect(text).toContain("My own note at the top.");
    expect(text).toContain("## Scratch\nanything goes");
    expect(text.indexOf("## Conventions")).toBeLessThan(text.indexOf("## Decisions"));
    expect(text).toMatch(/- Tests run with `bun test` \(\d{4}-\d{2}-\d{2}\)/);
    const entries = m.entries();
    expect(entries.find((e) => e.section === "decisions")).toMatchObject({ text: "Use Zod for validation", date: "2026-01-02" });
    expect(entries).toHaveLength(3);
  });

  test("rebuildOverview replaces only the overview", () => {
    const dir = tmpDir("vard-mem-");
    const m = new MemoryStore(dir);
    m.add([{ section: "conventions", text: "Prefer small functions" }]);
    m.rebuildOverview(["Project: demo", "Languages: TypeScript"]);
    m.rebuildOverview(["Project: demo2"]);
    const text = m.read();
    expect(text).toContain("- Project: demo2");
    expect(text).not.toContain("Languages: TypeScript");
    expect(text).toContain("Prefer small functions");
    expect(text.indexOf("## Project overview")).toBeLessThan(text.indexOf("## Conventions"));
    // stored under .vard/, which is git-ignored
    expect(fs.readFileSync(path.join(dir, ".vard", ".gitignore"), "utf8")).toBe("*\n");
  });
});

describe("scanner", () => {
  test("bun + TypeScript project", () => {
    const repo = tmpGitRepo({
      "package.json": JSON.stringify({ name: "shop", scripts: { dev: "vite", build: "vite build", lint: "eslint ." }, dependencies: { react: "19", zod: "4" }, devDependencies: { vite: "8" } }),
      "bun.lock": "",
      "src/app.ts": "export {}",
      "src/app.test.ts": "",
    });
    const facts = scanProject(repo).join("\n");
    expect(facts).toContain("Project: shop");
    expect(facts).toContain("Package manager: bun");
    expect(facts).toContain("`bun run dev`, `bun run build`, `bun run lint`");
    expect(facts).toContain("Tests run with `bun test`");
    expect(facts).toContain("React, Vite, Zod");
    expect(facts).toContain("`src/`");
  });

  test("Rust and Python projects", () => {
    const rust = tmpGitRepo({ "Cargo.toml": '[package]\nname = "ferris"\n', "src/main.rs": "fn main(){}" });
    expect(scanProject(rust).join("\n")).toMatch(/Project: ferris[\s\S]*Rust[\s\S]*cargo test/);
    const py = tmpGitRepo({ "pyproject.toml": '[project]\nname = "snake"\n[tool.pytest.ini_options]\n', "app.py": "" });
    expect(scanProject(py).join("\n")).toMatch(/Project: snake[\s\S]*pytest/);
  });
});

describe("recall", () => {
  test("includes everything when small, ranks by relevance when over budget", () => {
    const m = new MemoryStore(tmpDir("vard-mem-"));
    m.rebuildOverview(["Project: demo"]);
    m.add([
      { section: "conventions", text: "Authentication lives in src/auth with JWT cookies" },
      { section: "conventions", text: "Styling uses Tailwind tokens from styles.css only" },
      { section: "issues", text: "Login redirect loops when the auth cookie is missing" },
    ]);
    expect(recall(m, "anything")).toContain("Tailwind tokens");
    const small = recall(m, "fix the login auth cookie bug", 160);
    expect(small).toContain("Project: demo");
    expect(small).toContain("Login redirect loops");
    expect(small).not.toContain("Tailwind");
    expect(small).toContain("less related notes omitted");
    expect(recall(new MemoryStore(tmpDir("vard-mem-")), "x")).toBe("");
  });

  test("the system prompt carries the memory", async () => {
    const dir = tmpDir("vard-mem-");
    const p = await buildSystemPrompt({ workRoot: dir, todos: [], memory: "## Conventions\n- Use bun" });
    expect(p).toContain("# Project memory");
    expect(p).toContain("- Use bun");
    expect(await buildSystemPrompt({ workRoot: dir, todos: [] })).not.toContain("# Project memory");
  });
});

describe("reflection proposals", () => {
  test("parses a JSON array and rejects anything malformed", () => {
    expect(parseProposals('Sure! [{"section":"conventions","text":"Tests run with bun test"}]')).toEqual([
      { section: "conventions", text: "Tests run with bun test" },
    ]);
    expect(parseProposals("[]")).toEqual([]);
    expect(parseProposals("no json here")).toEqual([]);
    expect(parseProposals('[{"section":"overview","text":"not allowed in overview"}]')).toEqual([]);
    expect(parseProposals('[{"section":"conventions","text":"tiny"}]')).toEqual([]);
  });
});

describe("server", () => {
  const provider = { provider: "anthropic" as const, model: "mock", apiKey: "k" };

  function run(turns: Turn[], repo: string, extra: Record<string, unknown> = {}, reflectReply = "[]") {
    const events: Event[] = [];
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    let server!: Server;
    const prompts: string[] = [];
    server = new Server({
      traceDir: tmpDir("vard-traces-"),
      rulesStoreFor: () => new MemoryRulesStore(),
      modelFactory: () => {
        const m = scriptedModel(turns);
        const s = m.doStream.bind(m);
        m.doStream = async (o: any) => {
          prompts.push(JSON.stringify(o.prompt));
          return s(o);
        };
        (m as any).doGenerate = async (o: any) => {
          prompts.push(JSON.stringify(o.prompt));
          return {
            content: [{ type: "text", text: reflectReply }],
            finishReason: { unified: "stop", raw: undefined },
            usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
            warnings: [],
          };
        };
        return m;
      },
      write: (e) => {
        events.push(e);
        if (e.type === "done" && e.taskId) resolve();
      },
    });
    void server.handle({ id: "r1", type: "task.start", taskId: "t1", projectRoot: repo, prompt: "say hello to vard", provider, planFirst: false, useWorktree: true, ...extra });
    return { server, events, done, prompts };
  }

  test("a finished task proposes memories before `done`; memory is in the main checkout and the prompt", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n", "package.json": '{"name":"greeter"}' });
    new MemoryStore(repo).add([{ section: "conventions", text: "Greetings are lowercase" }]);
    const turns: Turn[] = [
      { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
      { text: "Done." },
    ];
    const h = run(turns, repo, {}, '[{"section":"conventions","text":"Greeting text lives in hello.txt"}]');
    await h.done;
    const kinds = h.events.map((e) => e.type);
    const prop = h.events.find((e) => e.type === "memory_proposal") as any;
    expect(prop.items).toEqual([{ section: "conventions", text: "Greeting text lives in hello.txt", id: "t1-m0" }]);
    expect(kinds.indexOf("memory_proposal")).toBeLessThan(kinds.lastIndexOf("done"));
    // memory is read from the main checkout (scanned overview + existing entry) and shown to the model
    expect(h.prompts[0]).toContain("Greetings are lowercase");
    expect(h.prompts[0]).toContain("Project: greeter");
    expect(fs.existsSync(path.join(repo, ".vard", "worktrees", "t1", ".vard", "memory.md"))).toBe(false);
    // nothing new was saved without approval
    expect(new MemoryStore(repo).read()).not.toContain("hello.txt");

    // approving saves it
    const got: Event[] = [];
    const s2 = new Server({ write: (e) => got.push(e) });
    await s2.handle({ id: "m1", type: "memory.add", projectRoot: repo, items: [{ section: "conventions", text: "Greeting text lives in hello.txt" }] });
    expect(got[0]).toMatchObject({ type: "memory", entries: expect.any(Number) });
    expect(new MemoryStore(repo).read()).toContain("Greeting text lives in hello.txt");
  });

  test("useMemory: false leaves memory alone and learns nothing", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const h = run([{ text: "Nothing to do." }], repo, { useMemory: false });
    await h.done;
    expect(h.events.some((e) => e.type === "memory_proposal")).toBe(false);
    expect(fs.existsSync(path.join(repo, ".vard", "memory.md"))).toBe(false);
    expect(h.prompts[0]).not.toContain("# Project memory");
  });

  test("memory.get / set / rebuild", async () => {
    const repo = tmpGitRepo({ "package.json": '{"name":"demo"}' });
    const got: any[] = [];
    const s = new Server({ write: (e) => got.push(e) });
    await s.handle({ id: "a", type: "memory.get", projectRoot: repo });
    expect(got.at(-1)).toMatchObject({ type: "memory", text: "", entries: 0 });
    await s.handle({ id: "b", type: "memory.rebuild", projectRoot: repo });
    expect(got.at(-1).text).toContain("Project: demo");
    await s.handle({ id: "c", type: "memory.set", projectRoot: repo, text: "## Conventions\n- Mine\n" });
    expect(got.at(-1)).toMatchObject({ text: "## Conventions\n- Mine\n", entries: 1 });
  });
});
