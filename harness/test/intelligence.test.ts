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

const names = (r: Awaited<ReturnType<typeof parseSource>>) => r.symbols.map((s) => `${s.kind}:${s.name}${s.parent ? `<${s.parent}` : ""}${s.exported ? "+" : ""}`);

describe("parsing", () => {
  test("TypeScript: classes, methods, exports, top-level only, imports with names, calls and types", async () => {
    const r = await parseSource(
      "typescript",
      `import { verify, type Claims } from "./token";\nimport * as db from "../db";\nexport class AuthService {\n  login(u: User) { return verify(u); }\n}\nexport const handler = () => new AuthService();\nfunction local() { const inner = 1; }\nexport interface User { id: string }\ntype T = User;\nexport { x } from "./x";`,
    );
    expect(names(r)).toEqual(["class:AuthService+", "method:login<AuthService", "function:handler+", "function:local", "interface:User+", "type:T"]);
    expect(r.imports.map((i) => `${i.source}:${i.names}`)).toEqual(["./token:verify,Claims", "../db:*", "./x:"]);
    expect(r.refs.filter((x) => x.kind === "call").map((x) => x.name)).toEqual(["verify", "AuthService"]);
    expect(r.refs.some((x) => x.kind === "type" && x.name === "User")).toBe(true);
  });

  test("TSX components and JSX usage", async () => {
    const r = await parseSource("tsx", `export function Login() { return <Form><Button onClick={go} /></Form>; }`);
    expect(names(r)).toEqual(["function:Login+"]);
    expect(r.refs.map((x) => x.name)).toEqual(expect.arrayContaining(["Form", "Button"]));
  });

  test("JavaScript", async () => {
    const r = await parseSource("javascript", `const express = require("express");\nclass Api { get() {} }\nmodule.exports = function start() { listen(); };\nimport a from "./a.js";`);
    expect(names(r)).toEqual(expect.arrayContaining(["class:Api", "method:get<Api"]));
    expect(r.imports.map((i) => i.source)).toEqual(["./a.js"]);
  });

  test("Python, Rust, Go, Java and C/C++", async () => {
    expect(names(await parseSource("python", `from .db import connect\nclass Repo:\n    def get(self):\n        return connect()\ndef _private():\n    def inner(): pass\nVERSION = 1`))).toEqual([
      "class:Repo+",
      "method:get<Repo+",
      "function:_private",
      "variable:VERSION+",
    ]);
    const rs = await parseSource("rust", `mod auth;\nuse crate::auth::verify;\npub struct Token { v: String }\nimpl Token { pub fn check(&self) -> bool { verify(&self.v) } }\nfn helper() {}`);
    expect(names(rs)).toEqual(["module:auth", "struct:Token+", "method:check<Token+", "function:helper"]);
    expect(rs.imports.map((i) => i.source)).toEqual(["crate::auth::verify", "mod:auth"]);
    expect(names(await parseSource("go", `package main\ntype Server struct{}\ntype Store interface{}\nfunc (s *Server) Start() {}\nfunc main() {}`))).toEqual([
      "struct:Server+",
      "interface:Store+",
      "method:Start<Server+",
      "function:main",
    ]);
    expect(names(await parseSource("java", `public class Svc { public void run() {} private int x() { return 1; } }`))).toEqual(["class:Svc+", "method:run<Svc+", "method:x<Svc"]);
    expect(names(await parseSource("c", `#include "auth.h"\nstatic int helper(void) { return 0; }\nint verify_token(const char *t) { return helper(); }\nstruct session { int id; };`))).toEqual([
      "function:helper",
      "function:verify_token+",
      "struct:session+",
    ]);
    expect(names(await parseSource("cpp", `namespace app { class Repo { public: void find(); }; }\nvoid app::Repo::find() {}`))).toEqual(
      expect.arrayContaining(["module:app+", "class:Repo<app+", "method:find+"]),
    );
  });

  test("JSON (with comments) and Markdown structure", async () => {
    const pkg = await parseSource("json", `{"name":"x","dependencies":{"react":"19"}}`, "package.json");
    expect(pkg.imports.map((i) => i.source)).toEqual(["pkg:react"]);
    const ts = await parseSource("json", `{ // comment\n "compilerOptions": { "strict": true, }, }`, "tsconfig.json");
    expect(ts.error).toBeUndefined();
    expect(names(await parseSource("markdown", "# Title\n## Setup\n```\n# not a heading\n```\n## Usage"))).toEqual(["heading:Title+", "heading:Setup<Title+", "heading:Usage<Title+"]);
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
    for (const p of ["src/a.test.ts", "src/__tests__/a.ts", "pkg/a_test.go", "tests/test_api.py", "x.spec.tsx"]) expect(isTestFile(p)).toBe(true);
    for (const p of ["src/testing.ts", "src/latest.ts", "contest/a.ts"]) expect(isTestFile(p)).toBe(false);
  });
});

describe("import resolution", () => {
  test("relative, index, .js→.ts, tsconfig paths, Python, Rust, Go, Java, C", () => {
    const repo = tmpGitRepo({
      "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
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
    expect(r.resolve("crate/src/main.rs", "rust", "mod:auth").targets).toEqual(["crate/src/auth.rs"]);
    expect(r.resolve("crate/src/main.rs", "rust", "crate::net::Client").targets).toEqual(["crate/src/net/mod.rs"]);
    expect(r.resolve("main.go", "go", "example.com/app/store").targets).toEqual(["store/store.go"]);
    expect(r.resolve("x.java", "java", "com.acme.Repo").targets).toEqual(["java/com/acme/Repo.java"]);
    expect(r.resolve("c/main.c", "c", "auth.h").targets).toEqual(["c/auth.h"]);
  });
});

describe("incremental index", () => {
  test("adds, updates, removes and leaves unchanged files alone; resolves imports", async () => {
    const repo = tmpGitRepo({
      "src/token.ts": "export function verify(t: string) { return t.length > 0; }\n",
      "src/auth.ts": 'import { verify } from "./token";\nexport function login(t: string) { return verify(t); }\n',
    });
    const ix = new CodeIndex(repo);
    const first = await ix.build();
    expect(first).toMatchObject({ added: 2, updated: 0, removed: 0 });
    const db = ix.db().db;
    const edge = db.query("SELECT f.path AS src, t.path AS dst FROM imports i JOIN files f ON f.id = i.file_id JOIN files t ON t.id = i.target_id").all();
    expect(edge).toEqual([{ src: "src/auth.ts", dst: "src/token.ts" }]);

    expect(await ix.build()).toMatchObject({ added: 0, updated: 0, unchanged: 2 });

    fs.writeFileSync(path.join(repo, "src/auth.ts"), 'import { verify } from "./token";\nexport function login(t: string) { return verify(t); }\nexport function logout() {}\n');
    fs.writeFileSync(path.join(repo, "src/new.ts"), "export class Session {}\n");
    expect(await ix.build()).toMatchObject({ added: 1, updated: 1, unchanged: 1 });
    expect(db.query("SELECT name FROM symbols ORDER BY name").all().map((r: any) => r.name)).toEqual(["Session", "login", "logout", "verify"]);

    fs.rmSync(path.join(repo, "src/token.ts"));
    expect(await ix.build()).toMatchObject({ removed: 1 });
    expect(db.query("SELECT COUNT(*) AS n FROM symbols WHERE name = 'verify'").get()).toEqual({ n: 0 });
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
    for (let i = 0; i < 200; i++) files[`src/f${i}.ts`] = `export function f${i}() { return ${i}; }\n`;
    const repo = tmpGitRepo(files);
    const ix = new CodeIndex(repo);
    const ctrl = new AbortController();
    const p = ix.build({ signal: ctrl.signal, onProgress: (d) => d >= 50 && ctrl.abort() });
    await expect(p).rejects.toThrow("cancelled");
    ix.close();
  });

  test("respects configured excludes and file limits", async () => {
    const repo = tmpGitRepo({ "src/a.ts": "export const a = 1;\n", "gen/b.ts": "export const b = 1;\n" });
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
      files[`pkg${i % 20}/m${i}.ts`] = `import { m${(i + 1) % 2000} } from "../pkg${(i + 1) % 20}/m${(i + 1) % 2000}";\nexport class C${i} { run() { return m${(i + 1) % 2000}(); } }\nexport function m${i}() { return ${i}; }\n`;
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
