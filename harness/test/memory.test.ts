import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { buildSystemPrompt } from "../src/context";
import {
  analyze,
  analyzeProject,
  applyAuto,
  contradicts,
  findSecret,
  isDuplicate,
  isSensitivePath,
  MemoryError,
  MemoryStore,
  parseProposals,
  recall,
} from "../src/memory";
import { MemoryRulesStore } from "../src/policy";
import type { Event } from "../src/protocol";
import { Server } from "../src/server";
import { scriptedModel, tmpDir, tmpGitRepo, type Turn, withReflection } from "./helpers";

const store = () => new MemoryStore(tmpDir("vard-mem-"));

// Fake credentials, assembled at runtime so secret scanners don't flag the source.
const FAKE = {
  openrouter: ["sk", "or", "v1", "0123456789abcdef0123456789abcdef"].join("-"),
  openai: ["sk", "proj", "abcdefghijklmnopqrstuvwxyz012345"].join("-"),
  github: "gh" + "p_" + "abcdefghijklmnopqrstuvwxyz0123456789",
  aws: "AK" + "IA" + "ABCDEFGHIJKLMNOP",
  live: ["sk", "live", "should", "never", "appear", "0123456789"].join("-"),
};

describe("store", () => {
  test("create, retrieve, edit, verify, delete and clear", () => {
    const m = store();
    const a = m.add({ category: "conventions", text: "Tests sit next to the code as *.test.ts", status: "inferred", source: "task" }).entry!;
    expect(a.id).toMatch(/^m_[0-9a-f]{10}$/);
    expect(m.get(a.id)).toMatchObject({ category: "conventions", status: "inferred", source: "task" });

    const edited = m.update(a.id, { text: "Tests sit next to the code as *.test.ts files" });
    expect(edited.status).toBe("verified");
    expect(edited.updatedAt >= edited.createdAt).toBe(true);

    const b = m.add({ category: "issues", text: "The dev server port 1420 is sometimes held by a stale process", status: "inferred", source: "task" }).entry!;
    m.verify(b.id);
    expect(m.get(b.id)!.status).toBe("verified");
    expect(m.list({ query: "port 1420" }).map((e) => e.id)).toEqual([b.id]);
    expect(m.list({ category: "conventions" })).toHaveLength(1);

    expect(m.remove(a.id)).toBe(true);
    expect(m.remove("m_nope")).toBe(false);
    m.setSettings({ autoUpdate: "auto" });
    m.clear();
    expect(m.active()).toHaveLength(0);
    expect(m.settings().autoUpdate).toBe("auto"); // settings survive a clear
    expect(fs.readFileSync(path.join(m.projectRoot, ".vard", ".gitignore"), "utf8")).toBe("*\n");
  });

  test("projects are isolated", () => {
    const a = store();
    const b = store();
    a.add({ category: "decisions", text: "We use Zod for every API boundary" });
    expect(b.active()).toHaveLength(0);
    expect(new MemoryStore(a.projectRoot).active()).toHaveLength(1);
  });

  test("duplicates are detected; different specifics are not duplicates", () => {
    const m = store();
    m.add({ category: "commands", text: "Run tests with `bun test`" });
    expect(m.add({ category: "commands", text: "run tests with `bun test`." }).duplicateOf).toBeDefined();
    expect(isDuplicate("Run tests with `bun test`", "Run tests with `npm test`")).toBe(false);
    expect(contradicts("Run tests with `bun test`", "Run tests with `npm test`")).toBe(true);
    expect(contradicts("Run tests with `bun test`", "Styling uses Tailwind tokens")).toBe(false);
  });

  test("replacing an entry keeps the old one as history and out of recall", () => {
    const m = store();
    const old = m.add({ category: "commands", text: "Run tests with `npm test`" }).entry!;
    const neu = m.add({ category: "commands", text: "Run tests with `bun test`", replaces: old.id }).entry!;
    expect(m.get(old.id)!.supersededBy).toBe(neu.id);
    expect(m.active().map((e) => e.id)).toEqual([neu.id]);
    expect(m.list({ history: true })).toHaveLength(2);
    expect(recall(m, "run the tests").text).not.toContain("npm test");
    // deleting the replacement brings the old entry back
    m.remove(neu.id);
    expect(m.active().map((e) => e.id)).toEqual([old.id]);
  });

  test("secrets are never stored, from users or the agent", () => {
    const m = store();
    expect(() => m.add({ category: "details", text: `The OpenRouter key is ${FAKE.openrouter}` })).toThrow(MemoryError);
    expect(() => m.add({ category: "details", text: "password = hunter2hunter2" })).toThrow(/credential/);
    const ok = m.add({ category: "details", text: "Keys live in the macOS Keychain, never in files" }).entry!;
    expect(() => m.update(ok.id, { text: `token: ${FAKE.github}` })).toThrow(/GitHub token/);
    expect(JSON.stringify(m.load())).not.toContain("hunter2");
    expect(findSecret("commit 3f2a9c1b7e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b")).toBeNull(); // a git hash is fine
    expect(findSecret("-----BEGIN OPENSSH PRIVATE KEY-----")).toBe("a private key");
    expect(isSensitivePath(".env.local")).toBe(true);
    expect(isSensitivePath("certs/server.pem")).toBe(true);
    expect(isSensitivePath("src/env.ts")).toBe(false);
  });

  test("migrates the earlier Markdown memory and survives a corrupt file", () => {
    const dir = tmpDir("vard-mem-");
    fs.mkdirSync(path.join(dir, ".vard"));
    fs.writeFileSync(
      path.join(dir, ".vard", "memory.md"),
      "# Project memory\n\n## Project overview\n- Project: demo\n\n## Conventions\n- Use bun for everything (2026-11-01)\n\n## Known issues and fixes\n- Port 1420 can be busy\n",
    );
    const m = new MemoryStore(dir);
    const entries = m.active();
    expect(entries.map((e) => e.category).sort()).toEqual(["conventions", "issues", "overview"]);
    expect(entries.find((e) => e.category === "conventions")).toMatchObject({ text: "Use bun for everything", status: "verified" });
    expect(fs.existsSync(path.join(dir, ".vard", "memory.md.bak"))).toBe(true);

    fs.writeFileSync(m.path, "{ not json");
    expect(m.active()).toHaveLength(0);
    expect(fs.readdirSync(path.join(dir, ".vard")).some((f) => f.startsWith("memory.json.corrupt-"))).toBe(true);
  });
});

describe("analysis", () => {
  test("bun + TypeScript: overview, commands, architecture", () => {
    const repo = tmpGitRepo({
      "package.json": JSON.stringify({ name: "shop", main: "dist/index.js", scripts: { dev: "vite", build: "vite build", test: "vitest" }, dependencies: { react: "19" }, devDependencies: { vite: "8", vitest: "3" } }),
      "bun.lock": "",
      "README.md": "# Shop\n\n![badge](x)\n\nA tiny shop that sells **socks** online.\n",
      "AGENTS.md": "rules",
      "src/main.tsx": "",
      "src/cart.test.ts": "",
      "tsconfig.json": "{}",
      ".github/workflows/ci.yml": "on: push",
    });
    const facts = analyzeProject(repo);
    const by = (c: string) => facts.filter((f) => f.category === c).map((f) => f.text).join("\n");
    expect(by("overview")).toContain("Project: shop");
    expect(by("overview")).toContain('README: "Shop" — A tiny shop that sells socks online.');
    expect(by("overview")).toContain("React, Vite, Vitest");
    expect(by("commands")).toContain("`bun run dev`, `bun run build`, `bun run test`");
    expect(by("commands")).toContain("Run tests with `bun run test` (Vitest)");
    expect(by("architecture")).toContain("`src/main.tsx`");
    expect(by("architecture")).toContain("main: `dist/index.js`");
    expect(by("architecture")).toMatch(/Config: .*TypeScript config.*CI: GitHub Actions \(ci\.yml\)/);
    expect(by("conventions")).toContain("`AGENTS.md`");
  });

  test("Rust, Python and a monorepo sub-project", () => {
    const rust = tmpGitRepo({ "Cargo.toml": '[package]\nname = "ferris"\n', "src/main.rs": "fn main(){}" });
    expect(analyzeProject(rust).map((f) => f.text).join("\n")).toMatch(/Project: ferris[\s\S]*cargo test[\s\S]*src\/main\.rs/);
    const py = tmpGitRepo({ "pyproject.toml": '[project]\nname = "snake"\n[tool.pytest.ini_options]\n', "app.py": "" });
    expect(analyzeProject(py).map((f) => f.text).join("\n")).toMatch(/Project: snake[\s\S]*pytest/);
    const mono = tmpGitRepo({ "package.json": '{"name":"root"}', "web/package.json": '{"name":"web","scripts":{"test":"jest"}}', "web/a.test.ts": "" });
    const text = analyzeProject(mono).map((f) => f.text).join("\n");
    expect(text).toContain("Run tests in `web/` with `npm run test`");
    expect(text).not.toContain("Run tests with");
  });

  test("never reads or mentions sensitive or excluded files", () => {
    const repo = tmpGitRepo({
      "package.json": '{"name":"app"}',
      ".env": `OPENAI_API_KEY=${FAKE.live}`,
      "certs/server.pem": "-----BEGIN PRIVATE KEY-----",
      "private/plan.ts": "",
      "src/index.ts": "",
    });
    const facts = analyzeProject(repo, ["private/**"]).map((f) => f.text).join("\n");
    expect(facts).not.toContain(".env");
    expect(facts).not.toContain("should-never-appear");
    expect(facts).not.toContain("certs");
    expect(facts).not.toContain("private/");
    expect(facts).toContain("`src/index.ts`");
  });

  test("re-analysis replaces scan facts and keeps the user's notes", () => {
    const repo = tmpGitRepo({ "package.json": '{"name":"one"}' });
    const m = new MemoryStore(repo);
    analyze(m);
    m.add({ category: "preferences", text: "Prefer small, focused pull requests" });
    fs.writeFileSync(path.join(repo, "package.json"), '{"name":"two"}');
    analyze(m);
    const text = m.active().map((e) => e.text).join("\n");
    expect(text).toContain("Project: two");
    expect(text).not.toContain("Project: one");
    expect(text).toContain("Prefer small, focused pull requests");
    expect(m.load().analyzedAt).toBeDefined();
  });
});

describe("recall", () => {
  test("relevant notes win within the budget; inferred notes are labelled", () => {
    const m = store();
    m.replaceScan([{ category: "overview", text: "Project: demo" }]);
    m.add({ category: "architecture", text: "Authentication lives in src/auth with JWT cookies" });
    m.add({ category: "conventions", text: "Styling uses Tailwind tokens from styles.css only" });
    m.add({ category: "fixes", text: "Login redirect looped when the auth cookie was missing", status: "inferred", source: "task" });
    m.add({ category: "details", text: "The invoice PDF renderer streams pages one by one" });

    const all = recall(m, "anything", 10_000);
    expect(all.ids).toHaveLength(5);
    expect(all.text).toContain("(inferred, unconfirmed)");

    const tight = recall(m, "fix the login auth cookie bug in src/auth", 300);
    expect(tight.text).toContain("Project: demo");
    expect(tight.text).toContain("Login redirect looped");
    expect(tight.text).toContain("Authentication lives in src/auth");
    expect(tight.text).not.toContain("invoice");
    expect(tight.text).not.toContain("Tailwind");
    expect(tight.chars).toBeLessThanOrEqual(300);
    expect(tight.text).toContain("left out to save space");
    expect(recall(store(), "x").text).toBe("");
  });

  test("the system prompt carries the memory with its trust note", async () => {
    const dir = tmpDir("vard-mem-");
    const p = await buildSystemPrompt({ workRoot: dir, todos: [], memory: "## Commands\n- Use bun" });
    expect(p).toContain("# Project memory");
    expect(p).toContain("inferred, unconfirmed");
    expect(await buildSystemPrompt({ workRoot: dir, todos: [] })).not.toContain("# Project memory");
  });
});

describe("reflection", () => {
  test("parses proposals, drops secrets and known facts, links contradictions", () => {
    const m = store();
    const old = m.add({ category: "commands", text: "Run tests with `npm test`" }).entry!;
    m.add({ category: "conventions", text: "Components live in src/components" });
    const reply = `Here you go:
      [{"category":"commands","text":"Run tests with \`bun test\`"},
       {"category":"conventions","text":"components live in src/components"},
       {"category":"details","text":"The API key is ${FAKE.openai}"},
       {"category":"overview","text":"not allowed in the overview"},
       {"category":"fixes","text":"Fixed a race in the cart by awaiting saveCart()", "replaces": "m_unknown"}]`;
    const props = parseProposals(reply, m.active(), "t1-m");
    expect(props.map((p) => p.text)).toEqual(["Run tests with `bun test`", "Fixed a race in the cart by awaiting saveCart()"]);
    expect(props[0]).toMatchObject({ id: "t1-m0", replaces: old.id, replacesText: "Run tests with `npm test`" });
    expect(props[1].replaces).toBeUndefined();
    expect(parseProposals("no json", [], "x")).toEqual([]);
    const narration = parseProposals(
      `[{"category":"decisions","text":"Added export function divide(a, b) in src/math.ts"},
        {"category":"details","text":"src/math.test.ts now imports divide and tests it"},
        {"category":"fixes","text":"Fixed flaky cart test by awaiting saveCart() before asserting"},
        {"category":"conventions","text":"Error tests use expect(() => fn()).toThrow('exact message')"}]`,
      [],
      "x",
    );
    expect(narration.map((p) => p.category)).toEqual(["fixes", "conventions"]);
  });

  test("auto mode saves as inferred but never replaces a verified fact", () => {
    const m = store();
    const verified = m.add({ category: "commands", text: "Run tests with `npm test`" }).entry!;
    const out = applyAuto(
      m,
      [
        { id: "p0", category: "commands", text: "Run tests with `bun test`", replaces: verified.id },
        { id: "p1", category: "conventions", text: "Prefer named exports over default exports" },
      ],
      "task-1",
    );
    expect(out[0].autoSaved).toBeUndefined(); // still needs approval
    expect(out[1].autoSaved).toBe(true);
    const saved = m.get(out[1].id)!;
    expect(saved).toMatchObject({ status: "inferred", source: "task", taskId: "task-1" });
    expect(m.get(verified.id)!.supersededBy).toBeUndefined();
  });
});

describe("agent integration", () => {
  const provider = { provider: "anthropic" as const, model: "mock", apiKey: "k" };

  function run(repo: string, turns: Turn[], reflect: string, extra: Record<string, unknown> = {}) {
    const events: Event[] = [];
    const prompts: string[] = [];
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const server = new Server({
      traceDir: tmpDir("vard-traces-"),
      rulesStoreFor: () => new MemoryRulesStore(),
      modelFactory: () => {
        const m = withReflection(scriptedModel(turns), reflect);
        const s = m.doStream.bind(m);
        m.doStream = async (o: any) => {
          prompts.push(JSON.stringify(o.prompt));
          return s(o);
        };
        return m;
      },
      write: (e) => {
        events.push(e);
        if (e.type === "done" && e.taskId) resolve();
      },
    });
    void server.handle({ id: "r1", type: "task.start", taskId: "t1", projectRoot: repo, prompt: "say hello to vard", provider, planFirst: false, useWorktree: true, ...extra });
    return { events, prompts, done, server };
  }

  const edit: Turn[] = [
    { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
    { text: "Done." },
  ];

  test("a new task analyzes the project, recalls memory, and proposes notes before done", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n", "package.json": '{"name":"greeter"}' });
    new MemoryStore(repo).add({ category: "conventions", text: "Greetings are always lowercase" });
    const h = run(repo, edit, '[{"category":"architecture","text":"Greeting text lives in hello.txt"}]');
    await h.done;
    const recallEv = h.events.find((e) => e.type === "memory_recall") as any;
    expect(recallEv.count).toBeGreaterThanOrEqual(2);
    expect(h.prompts[0]).toContain("Greetings are always lowercase");
    expect(h.prompts[0]).toContain("Project: greeter");
    const prop = h.events.find((e) => e.type === "memory_proposal") as any;
    expect(prop.items).toEqual([{ id: "t1-m0", category: "architecture", text: "Greeting text lives in hello.txt" }]);
    const kinds = h.events.map((e) => e.type);
    expect(kinds.indexOf("memory_proposal")).toBeLessThan(kinds.lastIndexOf("done"));
    // nothing saved without approval, and memory stays in the main checkout
    expect(new MemoryStore(repo).active().some((e) => e.text.includes("hello.txt"))).toBe(false);
    expect(fs.existsSync(path.join(repo, ".vard", "worktrees", "t1", ".vard", "memory.json"))).toBe(false);

    // approving saves it as verified
    const got: any[] = [];
    const s2 = new Server({ write: (e) => got.push(e) });
    await s2.handle({ id: "a", type: "memory.update", projectRoot: repo, change: { op: "accept", items: [{ category: "architecture", text: "Greeting text lives in hello.txt", taskId: "t1" }] } });
    expect(got[0]).toMatchObject({ type: "memory", saved: 1 });
    expect(new MemoryStore(repo).active().find((e) => e.text.includes("hello.txt"))).toMatchObject({ status: "verified", source: "task", taskId: "t1" });
  });

  test("autoUpdate: auto saves inferred notes; off skips learning; useMemory: false skips everything", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    new MemoryStore(repo).setSettings({ autoUpdate: "auto" });
    const h = run(repo, edit, '[{"category":"architecture","text":"Greeting text lives in hello.txt"}]');
    await h.done;
    const prop = h.events.find((e) => e.type === "memory_proposal") as any;
    expect(prop.items[0].autoSaved).toBe(true);
    expect(new MemoryStore(repo).get(prop.items[0].id)!.status).toBe("inferred");

    const repo2 = tmpGitRepo({ "hello.txt": "hello world\n" });
    new MemoryStore(repo2).setSettings({ autoUpdate: "off" });
    const h2 = run(repo2, edit, '[{"category":"architecture","text":"Greeting text lives in hello.txt"}]');
    await h2.done;
    expect(h2.events.some((e) => e.type === "memory_proposal")).toBe(false);
    expect(h2.events.some((e) => e.type === "memory_recall")).toBe(true);

    const repo3 = tmpGitRepo({ "hello.txt": "hello world\n" });
    const h3 = run(repo3, [{ text: "Nothing to do." }], "[]", { useMemory: false });
    await h3.done;
    expect(h3.events.some((e) => e.type === "memory_recall" || e.type === "memory_proposal")).toBe(false);
    expect(fs.existsSync(path.join(repo3, ".vard", "memory.json"))).toBe(false);
    expect(h3.prompts[0]).not.toContain("# Project memory");
  });

  test("memory.get and memory.update ops, including a refused secret", async () => {
    const repo = tmpGitRepo({ "package.json": '{"name":"demo"}' });
    const got: any[] = [];
    const s = new Server({ write: (e) => got.push(e) });
    const up = (change: any) => s.handle({ id: "x", type: "memory.update", projectRoot: repo, change });
    await s.handle({ id: "g", type: "memory.get", projectRoot: repo });
    expect(got.at(-1)).toMatchObject({ type: "memory", entries: [] });
    await up({ op: "analyze" });
    expect(got.at(-1).entries.some((e: any) => e.text === "Project: demo")).toBe(true);
    await up({ op: "add", category: "preferences", text: "Keep functions under 40 lines" });
    const id = got.at(-1).entries.find((e: any) => e.category === "preferences").id;
    await up({ op: "edit", entryId: id, text: "Keep functions under 30 lines" });
    expect(got.at(-1).entries.find((e: any) => e.id === id).text).toBe("Keep functions under 30 lines");
    await up({ op: "settings", settings: { maxContextChars: 3000, exclude: ["docs/**"] } });
    expect(got.at(-1).settings).toMatchObject({ maxContextChars: 3000, exclude: ["docs/**"], autoUpdate: "ask" });
    await expect(up({ op: "add", category: "details", text: `aws key ${FAKE.aws}` })).rejects.toThrow(/AWS access key/);
    await up({ op: "delete", entryId: id });
    expect(got.at(-1).entries.some((e: any) => e.id === id)).toBe(false);
    await up({ op: "clear" });
    expect(got.at(-1).entries).toEqual([]);
  });
});
