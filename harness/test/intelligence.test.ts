import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { saveIndexConfig } from "../src/intelligence/config";
import { CodeIndex } from "../src/intelligence/indexer";
import { parseSource } from "../src/intelligence/parser";
import { createResolver, isTestFile } from "../src/intelligence/resolve";
import { scanProject } from "../src/intelligence/scanner";
import { IndexConfig } from "../src/intelligence/schema";
import { dbPath } from "../src/intelligence/store";
import { sh, tmpGitRepo } from "./helpers";

const names = (r: Awaited<ReturnType<typeof parseSource>>) =>
  r.symbols.map(
    (s) => `${s.kind}:${s.name}${s.parent ? `<${s.parent}` : ""}${s.exported ? "+" : ""}`,
  );

describe("parsing", () => {
  test("TypeScript: classes, methods, exports, top-level only, imports with names, calls and types", async () => {
    const r = await parseSource(
      "typescript",
      `import { verify, type Claims } from "./token";\nimport * as db from "../db";\nexport class AuthService {\n  login(u: User) { return verify(u); }\n}\nexport const handler = () => new AuthService();\nfunction local() { const inner = 1; }\nexport interface User { id: string }\ntype T = User;\nexport { x } from "./x";`,
    );
    expect(names(r)).toEqual([
      "class:AuthService+",
      "method:login<AuthService",
      "function:handler+",
      "function:local",
      "interface:User+",
      "type:T",
    ]);
    expect(r.imports.map((i) => `${i.source}:${i.names}`)).toEqual([
      "./token:verify,Claims",
      "../db:*",
      "./x:",
    ]);
    expect(r.refs.filter((x) => x.kind === "call").map((x) => x.name)).toEqual([
      "verify",
      "AuthService",
    ]);
    expect(r.refs.some((x) => x.kind === "type" && x.name === "User")).toBe(true);
  });

  test("TSX components and JSX usage", async () => {
    const r = await parseSource(
      "tsx",
      `export function Login() { return <Form><Button onClick={go} /></Form>; }`,
    );
    expect(names(r)).toEqual(["function:Login+"]);
    expect(r.refs.map((x) => x.name)).toEqual(expect.arrayContaining(["Form", "Button"]));
  });

  test("JavaScript", async () => {
    const r = await parseSource(
      "javascript",
      `const express = require("express");\nclass Api { get() {} }\nmodule.exports = function start() { listen(); };\nimport a from "./a.js";`,
    );
    expect(names(r)).toEqual(expect.arrayContaining(["class:Api", "method:get<Api"]));
    expect(r.imports.map((i) => i.source)).toEqual(["./a.js"]);
  });

  test("Python, Rust, Go, Java and C/C++", async () => {
    expect(
      names(
        await parseSource(
          "python",
          `from .db import connect\nclass Repo:\n    def get(self):\n        return connect()\ndef _private():\n    def inner(): pass\nVERSION = 1`,
        ),
      ),
    ).toEqual(["class:Repo+", "method:get<Repo+", "function:_private", "variable:VERSION+"]);
    const rs = await parseSource(
      "rust",
      `mod auth;\nuse crate::auth::verify;\npub struct Token { v: String }\nimpl Token { pub fn check(&self) -> bool { verify(&self.v) } }\nfn helper() {}`,
    );
    expect(names(rs)).toEqual([
      "module:auth",
      "struct:Token+",
      "method:check<Token+",
      "function:helper",
    ]);
    expect(rs.imports.map((i) => i.source)).toEqual(["crate::auth::verify", "mod:auth"]);
    expect(
      names(
        await parseSource(
          "go",
          `package main\ntype Server struct{}\ntype Store interface{}\nfunc (s *Server) Start() {}\nfunc main() {}`,
        ),
      ),
    ).toEqual(["struct:Server+", "interface:Store+", "method:Start<Server+", "function:main"]);
    expect(
      names(
        await parseSource(
          "java",
          `public class Svc { public void run() {} private int x() { return 1; } }`,
        ),
      ),
    ).toEqual(["class:Svc+", "method:run<Svc+", "method:x<Svc"]);
    expect(
      names(
        await parseSource(
          "c",
          `#include "auth.h"\nstatic int helper(void) { return 0; }\nint verify_token(const char *t) { return helper(); }\nstruct session { int id; };`,
        ),
      ),
    ).toEqual(["function:helper", "function:verify_token+", "struct:session+"]);
    expect(
      names(
        await parseSource(
          "cpp",
          `namespace app { class Repo { public: void find(); }; }\nvoid app::Repo::find() {}`,
        ),
      ),
    ).toEqual(expect.arrayContaining(["module:app+", "class:Repo<app+", "method:find+"]));
  });

  test("JSON (with comments) and Markdown structure", async () => {
    const pkg = await parseSource(
      "json",
      `{"name":"x","dependencies":{"react":"19"}}`,
      "package.json",
    );
    expect(pkg.imports.map((i) => i.source)).toEqual(["pkg:react"]);
    const ts = await parseSource(
      "json",
      `{ // comment\n "compilerOptions": { "strict": true, }, }`,
      "tsconfig.json",
    );
    expect(ts.error).toBeUndefined();
    expect(
      names(
        await parseSource("markdown", "# Title\n## Setup\n```\n# not a heading\n```\n## Usage"),
      ),
    ).toEqual(["heading:Title+", "heading:Setup<Title+", "heading:Usage<Title+"]);
  });

  test("a parse failure is reported for that file only", async () => {
    const r = await parseSource("json", "{ nope", "x.json");
    expect(r.error).toContain("invalid JSON");
    const broken = await parseSource("typescript", "export function ((( {");
    expect(broken.error).toBeUndefined(); // tree-sitter recovers; partial results are fine
  });
});

describe("scanning", () => {
  test("honours .gitignore, skips build output, dependencies, lockfiles, big and sensitive files", async () => {
    const repo = tmpGitRepo({
      ".gitignore": "ignored/\n",
      "src/a.ts": "export const a = 1;\n",
      "ignored/b.ts": "x",
      "node_modules/x/index.js": "x",
      "dist/out.js": "x",
      "bun.lock": "{}",
      ".env": "KEY=1",
      "keys/server.pem": "x",
      "src/big.ts": "x".repeat(20_000),
      "assets/logo.png": "x",
      "docs/README.md": "# Docs",
    });
    const cfg = IndexConfig.parse({ maxFileBytes: 10_000, exclude: ["docs/"] });
    const r = await scanProject(repo, cfg);
    expect(r.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(r.skipped).toBe(1);
  });

  test("test-file detection", () => {
    for (const p of [
      "src/a.test.ts",
      "src/__tests__/a.ts",
      "pkg/a_test.go",
      "tests/test_api.py",
      "x.spec.tsx",
    ])
      expect(isTestFile(p)).toBe(true);
    for (const p of ["src/testing.ts", "src/latest.ts", "contest/a.ts"])
      expect(isTestFile(p)).toBe(false);
  });
});

describe("import resolution", () => {
  test("relative, index, .js→.ts, tsconfig paths, Python, Rust, Go, Java, C", () => {
    const repo = tmpGitRepo({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } },
      }),
      "go.mod": "module example.com/app\n",
    });
    const files = new Set([
      "tsconfig.json",
      "src/a.ts",
      "src/lib/index.ts",
      "src/util.ts",
      "app/db.py",
      "app/__init__.py",
      "app/api/routes.py",
      "crate/src/main.rs",
      "crate/src/auth.rs",
      "crate/src/net/mod.rs",
      "go.mod",
      "store/store.go",
      "java/com/acme/Repo.java",
      "c/auth.h",
      "c/main.c",
    ]);
    const r = createResolver(repo, files);
    expect(r.resolve("src/a.ts", "typescript", "./lib").targets).toEqual(["src/lib/index.ts"]);
    expect(r.resolve("src/a.ts", "typescript", "./util.js").targets).toEqual(["src/util.ts"]);
    expect(r.resolve("src/a.ts", "typescript", "@/util").targets).toEqual(["src/util.ts"]);
    expect(r.resolve("src/a.ts", "typescript", "react")).toEqual({ targets: [], pkg: "react" });
    expect(r.resolve("src/a.ts", "typescript", "@scope/pkg/sub").pkg).toBe("@scope/pkg");
    expect(r.resolve("app/api/routes.py", "python", "..db").targets).toEqual(["app/db.py"]);
    expect(r.resolve("app/api/routes.py", "python", "app").targets).toEqual(["app/__init__.py"]);
    expect(r.resolve("crate/src/main.rs", "rust", "mod:auth").targets).toEqual([
      "crate/src/auth.rs",
    ]);
    expect(r.resolve("crate/src/main.rs", "rust", "crate::net::Client").targets).toEqual([
      "crate/src/net/mod.rs",
    ]);
    expect(r.resolve("main.go", "go", "example.com/app/store").targets).toEqual(["store/store.go"]);
    expect(r.resolve("x.java", "java", "com.acme.Repo").targets).toEqual([
      "java/com/acme/Repo.java",
    ]);
    expect(r.resolve("c/main.c", "c", "auth.h").targets).toEqual(["c/auth.h"]);
  });
});

describe("incremental index", () => {
  test("adds, updates, removes and leaves unchanged files alone; resolves imports", async () => {
    const repo = tmpGitRepo({
      "src/token.ts": "export function verify(t: string) { return t.length > 0; }\n",
      "src/auth.ts":
        'import { verify } from "./token";\nexport function login(t: string) { return verify(t); }\n',
    });
    const ix = new CodeIndex(repo);
    const first = await ix.build();
    expect(first).toMatchObject({ added: 2, updated: 0, removed: 0 });
    const db = ix.db().db;
    const edge = db
      .query(
        "SELECT f.path AS src, t.path AS dst FROM imports i JOIN files f ON f.id = i.file_id JOIN files t ON t.id = i.target_id",
      )
      .all();
    expect(edge).toEqual([{ src: "src/auth.ts", dst: "src/token.ts" }]);

    expect(await ix.build()).toMatchObject({ added: 0, updated: 0, unchanged: 2 });

    fs.writeFileSync(
      path.join(repo, "src/auth.ts"),
      'import { verify } from "./token";\nexport function login(t: string) { return verify(t); }\nexport function logout() {}\n',
    );
    fs.writeFileSync(path.join(repo, "src/new.ts"), "export class Session {}\n");
    expect(await ix.build()).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(
      db
        .query("SELECT name FROM symbols ORDER BY name")
        .all()
        .map((r: any) => r.name),
    ).toEqual(["Session", "login", "logout", "verify"]);

    fs.rmSync(path.join(repo, "src/token.ts"));
    expect(await ix.build()).toMatchObject({ removed: 1 });
    expect(db.query("SELECT COUNT(*) AS n FROM symbols WHERE name = 'verify'").get()).toEqual({
      n: 0,
    });
    expect(db.query("SELECT target_id FROM imports").get()).toEqual({ target_id: null });
    const st = ix.status();
    expect(st).toMatchObject({ state: "ready", files: 2, failed: 0 });
    ix.close();
  });

  test("a file that fails to parse is recorded; the rest still index", async () => {
    const repo = tmpGitRepo({ "bad.json": "{ nope", "src/ok.ts": "export const ok = 1;\n" });
    const ix = new CodeIndex(repo);
    const r = await ix.build();
    expect(r.failed).toBe(1);
    expect(ix.status()).toMatchObject({ files: 2, failed: 1, symbols: 1 });
    ix.close();
  });

  test("a corrupt index is rebuilt", async () => {
    const repo = tmpGitRepo({ "a.ts": "export const a = 1;\n" });
    const ix = new CodeIndex(repo);
    await ix.build();
    ix.close();
    fs.writeFileSync(dbPath(repo), "this is not a database");
    for (const f of [`${dbPath(repo)}-wal`, `${dbPath(repo)}-shm`]) fs.rmSync(f, { force: true });
    const again = new CodeIndex(repo);
    expect(again.db().recovered).toBe(true);
    expect(await again.build()).toMatchObject({ added: 1 });
    again.close();
  });

  test("cancellation stops a build", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 200; i++)
      files[`src/f${i}.ts`] = `export function f${i}() { return ${i}; }\n`;
    const repo = tmpGitRepo(files);
    const ix = new CodeIndex(repo);
    const ctrl = new AbortController();
    const p = ix.build({ signal: ctrl.signal, onProgress: (d) => d >= 50 && ctrl.abort() });
    await expect(p).rejects.toThrow("cancelled");
    ix.close();
  });

  test("respects configured excludes and file limits", async () => {
    const repo = tmpGitRepo({
      "src/a.ts": "export const a = 1;\n",
      "gen/b.ts": "export const b = 1;\n",
    });
    saveIndexConfig(repo, { exclude: ["gen/"] });
    const ix = new CodeIndex(repo);
    await ix.build();
    expect(ix.status().files).toBe(1);
    expect(fs.existsSync(path.join(repo, ".vard", ".gitignore"))).toBe(true);
    expect(sh(repo, ["git", "status", "--porcelain"]).trim()).toBe("");
    ix.close();
  });

  test("performance: 2,000 files index within the budget, and a no-change rebuild is fast", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 2_000; i++)
      files[`pkg${i % 20}/m${i}.ts`] =
        `import { m${(i + 1) % 2000} } from "../pkg${(i + 1) % 20}/m${(i + 1) % 2000}";\nexport class C${i} { run() { return m${(i + 1) % 2000}(); } }\nexport function m${i}() { return ${i}; }\n`;
    const repo = tmpGitRepo(files);
    const ix = new CodeIndex(repo);
    const t0 = Date.now();
    await ix.build();
    const first = Date.now() - t0;
    const t1 = Date.now();
    await ix.build();
    const second = Date.now() - t1;
    expect(ix.status().files).toBe(2_000);
    expect(first).toBeLessThan(30_000);
    expect(second).toBeLessThan(3_000);
    ix.close();
  }, 60_000);
});

// ---------- Milestone 2: search, graph, impact, tools ----------

import {
  analyzeImpact,
  CodeGraph,
  CodeIntel,
  codeTools,
  searchCode,
  updateEmbeddings,
  type EmbeddingProvider,
} from "../src/intelligence";
import { MemoryRulesStore } from "../src/policy";
import type { Event } from "../src/protocol";
import { Server } from "../src/server";
import { runCli } from "../src/cli/main";
import { KeyStore } from "../src/cli/keys";
import { ScriptedPrompter } from "../src/cli/prompt";
import { scriptedModel, tmpDir, toolCtx } from "./helpers";

const APP = {
  "package.json": JSON.stringify({
    name: "app",
    scripts: { test: "bun test", typecheck: "tsc --noEmit" },
    dependencies: { jose: "5" },
  }),
  "bun.lock": "{}",
  "src/auth/token.ts":
    'import { jwtVerify } from "jose";\nexport async function verifyToken(token: string) {\n  return jwtVerify(token, new Uint8Array());\n}\nexport const TOKEN_TTL = 3600;\n',
  "src/auth/login.ts":
    'import { verifyToken } from "./token";\nexport async function loginHandler(req: Request) {\n  const t = req.headers.get("authorization") ?? "";\n  return verifyToken(t);\n}\n',
  "src/middleware.ts":
    'import { verifyToken } from "./auth/token";\nexport async function requireSession(req: Request) {\n  await verifyToken("x");\n}\n',
  "src/routes.ts":
    'import { loginHandler } from "./auth/login";\nimport { requireSession } from "./middleware";\nexport const routes = { "/login": loginHandler, "/me": requireSession };\n',
  "src/ui/LoginForm.tsx":
    'import { routes } from "../routes";\nexport function LoginForm() { return <form action="/login"><button>Sign in</button></form>; }\n',
  "src/billing/invoice.ts":
    "export function totalInvoice(items: number[]) { return items.reduce((a, b) => a + b, 0); }\n",
  "src/auth/token.test.ts":
    'import { verifyToken } from "./token";\ntest("verifies", () => verifyToken("x"));\n',
  "README.md": "# App\n## Auth\nUses JWT.\n",
};

async function indexed(files: Record<string, string> = APP) {
  const repo = tmpGitRepo(files);
  const ix = new CodeIndex(repo);
  await ix.build();
  return { repo, ix, g: new CodeGraph(ix) };
}

describe("search", () => {
  test("'where is user authentication handled?' finds the auth module, login handler, middleware and tests", async () => {
    const { ix } = await indexed();
    const hits = await searchCode(ix, "Where is user authentication handled?", { limit: 10 });
    const paths = hits.map((h) => h.path);
    expect(paths.slice(0, 3)).toEqual(
      expect.arrayContaining(["src/auth/token.ts", "src/auth/login.ts"]),
    );
    expect(paths).toContain("src/middleware.ts");
    expect(paths).not.toContain("src/billing/invoice.ts");
    expect(hits[0].reasons.length).toBeGreaterThan(0);
    expect(hits.find((h) => h.symbol === "loginHandler")?.snippet).toContain("loginHandler");
    ix.close();
  });

  test("symbol and keyword queries; tests rank lower unless asked for", async () => {
    const { ix } = await indexed();
    expect((await searchCode(ix, "verifyToken"))[0]).toMatchObject({
      path: "src/auth/token.ts",
      symbol: "verifyToken",
    });
    const withTests = await searchCode(ix, "verifyToken tests");
    expect(withTests.slice(0, 3).map((h) => h.path)).toContain("src/auth/token.test.ts");
    expect((await searchCode(ix, "invoice total"))[0].path).toBe("src/billing/invoice.ts");
    expect(await searchCode(ix, "the of and")).toEqual([]);
    ix.close();
  });

  test("optional vector search is used when configured, and secret-looking chunks are never embedded", async () => {
    const files = {
      ...APP,
      "src/config.ts": `export const apiKey = "${["sk-", "proj-", "A1b2C3d4E5f6G7h8I9j0K1l2"].join("")}";\n`,
    };
    const { ix } = await indexed(files);
    const sent: string[] = [];
    const mock: EmbeddingProvider = {
      id: "mock/v1",
      async embed(texts) {
        sent.push(...texts);
        // A toy embedding: does the text mention money?
        return texts.map((t) => [
          /(invoice|total|items|money)/i.test(t) ? 1 : 0,
          /(token|auth|login)/i.test(t) ? 1 : 0,
          0.1,
        ]);
      },
    };
    const r = await updateEmbeddings(ix, mock);
    expect(r.embedded).toBeGreaterThan(5);
    expect(r.skipped).toBeGreaterThan(0);
    expect(sent.some((t) => t.includes("sk-proj"))).toBe(false);
    const hits = await searchCode(ix, "money calculations", { embeddings: mock });
    expect(hits[0].path).toBe("src/billing/invoice.ts");
    expect(hits[0].reasons.join()).toContain("similar meaning");
    // Re-running embeds nothing new; changing the model replaces vectors.
    expect((await updateEmbeddings(ix, mock)).embedded).toBe(0);
    ix.close();
  });
});

describe("graph", () => {
  test("definitions, references with enclosing function, callers, dependencies, dependents, outline, tests", async () => {
    const { ix, g } = await indexed();
    expect(g.definitions("verifyToken")[0]).toMatchObject({
      path: "src/auth/token.ts",
      line: 2,
      exported: true,
    });
    const refs = g.references("verifyToken");
    expect(refs.map((r) => `${r.path}:${r.in}`)).toEqual(
      expect.arrayContaining([
        "src/auth/login.ts:loginHandler",
        "src/middleware.ts:requireSession",
        "src/auth/token.test.ts:undefined",
      ]),
    );
    expect(refs[0].ambiguous).toBe(false);
    expect(g.callers("verifyToken").length).toBe(3);
    expect(g.dependencies("src/auth/token.ts")).toEqual({ files: [], packages: ["jose"] });
    expect(g.dependents("src/auth/token.ts")).toEqual([
      "src/auth/login.ts",
      "src/auth/token.test.ts",
      "src/middleware.ts",
    ]);
    expect(g.dependentsDeep(["src/auth/token.ts"], 3).map((d) => d.path)).toEqual(
      expect.arrayContaining(["src/routes.ts", "src/ui/LoginForm.tsx"]),
    );
    expect(g.outline("src/auth/token.ts").map((s) => s.name)).toEqual(["verifyToken", "TOKEN_TTL"]);
    expect(g.testsFor("src/auth/token.ts")).toEqual(["src/auth/token.test.ts"]);
    const graph = g.graph({ focus: "src/auth/token.ts", depth: 1 });
    expect(graph.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(["src/auth/token.ts", "src/auth/login.ts", "src/middleware.ts"]),
    );
    expect(graph.edges).toContainEqual({
      from: "src/auth/login.ts",
      to: "src/auth/token.ts",
      kind: "imports",
    });
    expect(graph.edges).toContainEqual({
      from: "src/auth/token.test.ts",
      to: "src/auth/token.ts",
      kind: "tests",
    });
    const folders = g.graph();
    expect(folders.nodes.some((n) => n.kind === "package")).toBe(true);
    ix.close();
  });

  test("graph size is capped", async () => {
    const files: Record<string, string> = { "hub.ts": "export const hub = 1;\n" };
    for (let i = 0; i < 300; i++)
      files[`m${i}.ts`] = 'import { hub } from "./hub";\nexport const x = hub;\n';
    const { ix, g } = await indexed(files);
    const graph = g.graph({ focus: "hub.ts", limit: 50 });
    expect(graph.nodes.length).toBe(50);
    expect(graph.truncated).toBe(true);
    ix.close();
  });
});

describe("impact analysis", () => {
  test("a widely used function: dependents, references, tests, verification and evidence-based risk", async () => {
    const { ix } = await indexed();
    const r = analyzeImpact(ix, "verifyToken");
    expect(r.resolved.files).toEqual(["src/auth/token.ts"]);
    expect(r.direct.map((d) => d.path)).toEqual([
      "src/auth/login.ts",
      "src/auth/token.test.ts",
      "src/middleware.ts",
    ]);
    expect(r.indirect.map((d) => d.path)).toEqual(expect.arrayContaining(["src/routes.ts"]));
    expect(r.tests).toEqual(["src/auth/token.test.ts"]);
    expect(r.verify).toEqual(["bun run typecheck", "bun run test"]);
    expect(r.config).toContain("package.json");
    expect(r.risk).toBe("medium");
    expect(r.evidence.join(" ")).toContain("3 direct dependent files");
    ix.close();
  });

  test("an isolated file is low risk; an unknown target says so", async () => {
    const { ix } = await indexed();
    const r = analyzeImpact(ix, "src/billing/invoice.ts");
    expect(r.direct).toEqual([]);
    expect(r.evidence).toContain("no related tests found");
    expect(r.risk).toBe("low");
    expect(analyzeImpact(ix, "doesNotExist").evidence[0]).toContain("nothing in the index");
    ix.close();
  });
});

describe("code tools and protocol", () => {
  test("tools are read-only, confined to the project and cite file:line", async () => {
    const { repo } = await indexed();
    const intel = new CodeIntel();
    await intel.build(repo);
    const tools = codeTools(intel);
    expect(tools.every((t) => t.risk === "read")).toBe(true);
    const t = (n: string) => tools.find((x) => x.name === n)!;
    const ctx = toolCtx(repo);
    expect(
      await t("code_search").execute({ query: "token verification", limit: 5 }, ctx),
    ).toContain("src/auth/token.ts:");
    expect(await t("code_get_definition").execute({ name: "loginHandler" }, ctx)).toContain(
      "src/auth/login.ts:2",
    );
    expect(
      await t("code_impact_analysis").execute({ target: "verifyToken", depth: 3 }, ctx),
    ).toContain("risk MEDIUM");
    await expect(
      t("code_get_dependencies").execute({ path: "../../etc/passwd" }, ctx),
    ).rejects.toThrow("relative to the project");
    await expect(t("code_get_file_outline").execute({ path: "/etc/passwd" }, ctx)).rejects.toThrow(
      "relative to the project",
    );
    intel.closeAll();
  });

  test("a task builds the index, gets the overview and can call the code tools", async () => {
    const repo = tmpGitRepo(APP);
    const events: Event[] = [];
    let system = "";
    let done!: () => void;
    const finished = new Promise<void>((r) => (done = r));
    const model = scriptedModel([
      { calls: [{ name: "code_impact_analysis", input: { target: "verifyToken" } }] },
      { text: "Checked." },
    ]);
    const orig = model.doStream.bind(model);
    (model as any).doStream = async (o: any) => {
      system ||= JSON.stringify(o.prompt[0]);
      return orig(o);
    };
    const s = new Server({
      traceDir: tmpDir(),
      modelFactory: () => model,
      rulesStoreFor: () => new MemoryRulesStore(),
      write: (e) => (events.push(e), e.type === "done" && e.taskId && done()),
    });
    await s.handle({
      id: "t",
      type: "task.start",
      taskId: "ci1",
      projectRoot: repo,
      prompt: "change token handling",
      provider: { provider: "anthropic", model: "m", apiKey: "k" },
      planFirst: false,
      useWorktree: false,
      useMemory: false,
    });
    await finished;
    expect(system).toContain("# Codebase overview");
    expect(system).toContain("typescript");
    const ctxEv = events.find((e) => e.type === "code_context") as any;
    expect(ctxEv.overview).toContain("Languages:");
    const res = events.find((e) => e.type === "tool_result") as any;
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Direct dependents (3)");
    await s.shutdown();
  });

  test("code.index / code.query / code.config requests", async () => {
    const repo = tmpGitRepo(APP);
    const events: Event[] = [];
    const s = new Server({ write: (e) => events.push(e) });
    await s.handle({ id: "b", type: "code.index", projectRoot: repo, action: "build" });
    for (let i = 0; i < 200 && !(s.intel.get(repo).exists() && !s.intel.get(repo).isBuilding); i++)
      await new Promise((r) => setTimeout(r, 20));
    const q = async (query: any) => {
      await s.handle({ id: `q${events.length}`, type: "code.query", projectRoot: repo, query });
      return events.at(-1) as any;
    };
    expect((await q({ kind: "search", query: "login" })).hits[0].path).toMatch(/login/i);
    expect((await q({ kind: "impact", target: "src/auth/token.ts" })).impact.direct.length).toBe(3);
    expect((await q({ kind: "graph" })).graph.nodes.length).toBeGreaterThan(0);
    expect(
      (await q({ kind: "snippet", path: "src/routes.ts", line: 2, context: 1 })).snippet.lines
        .length,
    ).toBe(3);
    await s.handleLine(
      JSON.stringify({
        id: "x",
        type: "code.query",
        projectRoot: repo,
        query: { kind: "snippet", path: "../../../etc/hosts", line: 1 },
      }),
    );
    expect((events.at(-1) as any).type).toBe("error");
    await s.handle({
      id: "c",
      type: "code.config",
      projectRoot: repo,
      config: { exclude: ["src/billing/"] },
    });
    expect((events.at(-1) as any).config.exclude).toEqual(["src/billing/"]);
    await s.handle({ id: "d", type: "code.index", projectRoot: repo, action: "clean" });
    expect((events.at(-1) as any).status.state).toBe("missing");
    await s.shutdown();
  });

  test("vard code index / search / impact / status", async () => {
    const repo = tmpGitRepo(APP);
    const out = {
      text: "",
      write(s: string) {
        this.text += s;
      },
    };
    const err = {
      text: "",
      write(s: string) {
        this.text += s;
      },
    };
    const home = tmpDir();
    const env = { VARD_HOME: home, GROQ_API_KEY: "gsk_test" };
    const opts = {
      stdout: out,
      stderr: err,
      stdinIsTTY: false,
      readStdin: async () => "",
      env,
      cwd: repo,
      prompter: new ScriptedPrompter([]),
      keys: new KeyStore(env, () => ({ code: 44, stdout: "", stderr: "" }), "darwin"),
    };
    expect(await runCli(["code", "index"], opts)).toBe(0);
    expect(out.text).toContain("files");
    expect(await runCli(["code", "search", "where", "is", "authentication"], opts)).toBe(0);
    expect(out.text).toContain("src/auth/");
    expect(await runCli(["code", "impact", "verifyToken"], opts)).toBe(0);
    expect(out.text).toContain("risk MEDIUM");
    expect(await runCli(["code", "status"], opts)).toBe(0);
    expect(out.text).toContain("ready");
    expect(err.text).toBe("");
  });
});

describe("review fixes (code index)", () => {
  test("a snippet through a symlink to a credentials file is refused", async () => {
    const repo = tmpGitRepo({ ".env": "TOKEN=abc\n", "src/a.ts": "export const a = 1;\n" });
    fs.symlinkSync(path.join(repo, ".env"), path.join(repo, "notes.txt"));
    const events: Event[] = [];
    const s = new Server({ write: (e) => events.push(e) });
    await s.intel.build(repo);
    await s.handleLine(
      JSON.stringify({
        id: "q",
        type: "code.query",
        projectRoot: repo,
        query: { kind: "snippet", path: "notes.txt", line: 1 },
      }),
    );
    expect((events.at(-1) as any).message).toContain("credentials");
    await s.shutdown();
  });

  test("a file that turns binary loses its old symbols", async () => {
    const repo = tmpGitRepo({ "src/a.ts": "export function oldName() {}\n" });
    const ix = new CodeIndex(repo);
    await ix.build();
    fs.writeFileSync(path.join(repo, "src/a.ts"), Buffer.from([0, 1, 2, 3, 0, 0]));
    await ix.build();
    expect(
      ix.db().db.query("SELECT COUNT(*) AS n FROM symbols WHERE name = 'oldName'").get(),
    ).toEqual({ n: 0 });
    ix.close();
  });
});
