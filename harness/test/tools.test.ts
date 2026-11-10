import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { runCommand } from "../src/tools/command";
import { editFile, listDir, readFile, writeFile } from "../src/tools/fs";
import { gitDiff, gitStatus } from "../src/tools/git";
import { _jsSearch, search } from "../src/tools/search";
import { todoWrite } from "../src/tools/todo";
import { ToolError } from "../src/tools/types";
import { tmpDir, tmpGitRepo, toolCtx } from "./helpers";

describe("edit_file", () => {
  const setup = (content: string) => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "a.ts"), content);
    return { dir, ctx: toolCtx(dir), file: path.join(dir, "a.ts") };
  };

  test("replaces a unique occurrence", async () => {
    const { ctx, file } = setup("const a = 1;\nconst b = 2;\n");
    const out = await editFile.execute({ path: "a.ts", old_string: "const b = 2;", new_string: "const b = 3;" }, ctx);
    expect(out).toContain("line 2");
    expect(fs.readFileSync(file, "utf8")).toBe("const a = 1;\nconst b = 3;\n");
  });

  test("errors when old_string is missing", async () => {
    const { ctx } = setup("x\n");
    await expect(editFile.execute({ path: "a.ts", old_string: "nope", new_string: "y" }, ctx)).rejects.toThrow(
      /not found/,
    );
  });

  test("errors when old_string is not unique, and leaves the file untouched", async () => {
    const { ctx, file } = setup("foo\nbar\nfoo\n");
    await expect(editFile.execute({ path: "a.ts", old_string: "foo", new_string: "baz" }, ctx)).rejects.toThrow(
      /occurs 2 times/,
    );
    expect(fs.readFileSync(file, "utf8")).toBe("foo\nbar\nfoo\n");
  });

  test("counts overlapping occurrences", async () => {
    const { ctx } = setup("aaa");
    await expect(editFile.execute({ path: "a.ts", old_string: "aa", new_string: "b" }, ctx)).rejects.toThrow(
      /occurs 2 times/,
    );
  });

  test("refuses paths outside the project", async () => {
    const { ctx } = setup("x");
    await expect(editFile.execute({ path: "../outside.ts", old_string: "x", new_string: "y" }, ctx)).rejects.toThrow(
      ToolError,
    );
  });
});

describe("filesystem tools", () => {
  test("read_file numbers lines and pages", async () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "f.txt"), "one\ntwo\nthree\n");
    const out = await readFile.execute({ path: "f.txt", offset: 2, limit: 1 }, toolCtx(dir));
    expect(out).toContain("2\ttwo");
    expect(out).not.toContain("one");
    expect(out).toContain("use offset");
  });

  test("read_file refuses a symlink that points outside the project", async () => {
    const outside = tmpDir();
    fs.writeFileSync(path.join(outside, "secret"), "s3cret");
    const dir = tmpDir();
    fs.symlinkSync(path.join(outside, "secret"), path.join(dir, "link"));
    await expect(readFile.execute({ path: "link" }, toolCtx(dir))).rejects.toThrow(/escapes/);
  });

  test("write_file creates parent dirs; list_dir shows them", async () => {
    const dir = tmpDir();
    const ctx = toolCtx(dir);
    expect(await writeFile.execute({ path: "src/x/y.ts", content: "export {}\n" }, ctx)).toContain("created");
    const listing = await listDir.execute({ path: ".", depth: 3 }, ctx);
    expect(listing).toContain("src/");
    expect(listing).toContain("y.ts");
  });

  test("truncators cap output", () => {
    const big = "x".repeat(200_000);
    expect(readFile.truncate(big).length).toBeLessThan(readFile.maxOutput + 100);
    expect(runCommand.truncate(big).length).toBeLessThan(runCommand.maxOutput + 100);
  });
});

describe("search", () => {
  test("finds matches (ripgrep or fallback)", async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src/a.ts"), "function hello() {}\nconst x = 1;\n");
    fs.writeFileSync(path.join(dir, "b.md"), "hello docs\n");
    const out = await search.execute({ pattern: "hel+o", path: "." }, toolCtx(dir));
    expect(out).toContain("src/a.ts:1:");
    expect(out).toContain("b.md:1:");
  });

  test("JS fallback honours globs and skips node_modules", async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, "node_modules"));
    fs.writeFileSync(path.join(dir, "node_modules/x.ts"), "needle\n");
    fs.writeFileSync(path.join(dir, "a.ts"), "needle\n");
    fs.writeFileSync(path.join(dir, "a.md"), "needle\n");
    const out = await _jsSearch(dir, { pattern: "needle", glob: "*.ts" });
    expect(out).toEqual(["a.ts:1:needle"]);
  });
});

describe("run_command / git / todo", () => {
  test("runs in the work root and reports exit codes", async () => {
    const dir = tmpDir();
    const out = await runCommand.execute({ command: "pwd; exit 3" }, toolCtx(dir));
    expect(out).toStartWith("exit code 3");
    expect(out).toContain(dir);
  });

  test("times out", async () => {
    const out = await runCommand.execute({ command: "sleep 5", timeoutSec: 1 }, toolCtx(tmpDir()));
    expect(out).toContain("timed out");
  });

  test("git_status and git_diff", async () => {
    const repo = tmpGitRepo();
    fs.writeFileSync(path.join(repo, "hello.txt"), "changed\n");
    expect(await gitStatus.execute({}, toolCtx(repo))).toContain("M hello.txt");
    expect(await gitDiff.execute({}, toolCtx(repo))).toContain("+changed");
  });

  test("todo_write replaces the list", async () => {
    const ctx = toolCtx(tmpDir());
    const out = await todoWrite.execute(
      { todos: [{ id: "1", content: "do it", status: "in_progress" }] },
      ctx,
    );
    expect(ctx.todos).toHaveLength(1);
    expect(out).toContain("[~] 1. do it");
  });
});
