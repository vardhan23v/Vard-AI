import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
import { buildSystemPrompt, compactMessages, estimateMessagesTokens, repoMap } from "../src/context";
import { tmpDir, tmpGitRepo } from "./helpers";

function transcript(n: number, size: number): ModelMessage[] {
  const msgs: ModelMessage[] = [{ role: "user", content: "task" }];
  for (let i = 0; i < n; i++) {
    msgs.push({
      role: "assistant",
      content: [{ type: "tool-call", toolCallId: `c${i}`, toolName: "read_file", input: { path: `f${i}` } }],
    });
    msgs.push({
      role: "tool",
      content: [
        { type: "tool-result", toolCallId: `c${i}`, toolName: "read_file", output: { type: "text", value: "x".repeat(size) } },
      ],
    });
  }
  return msgs;
}

describe("compaction", () => {
  test("no-op when under budget", () => {
    const msgs = transcript(3, 100);
    const r = compactMessages(msgs, { budgetTokens: 100_000 });
    expect(r.compacted).toBe(0);
    expect(r.messages).toBe(msgs);
  });

  test("compacts old tool results, keeps recent turns verbatim, does not mutate input", () => {
    const msgs = transcript(10, 20_000);
    const before = estimateMessagesTokens(msgs);
    const r = compactMessages(msgs, { budgetTokens: 20_000, keepRecent: 4 });
    expect(r.compacted).toBeGreaterThan(0);
    expect(r.tokens).toBeLessThan(before);
    expect(r.tokens).toBeLessThanOrEqual(20_000);
    // first tool result compacted
    const first = (r.messages[2] as any).content[0].output.value as string;
    expect(first).toStartWith("[compacted read_file result");
    // last 4 messages untouched
    expect(r.messages.slice(-4)).toEqual(msgs.slice(-4));
    // input not mutated
    expect((msgs[2] as any).content[0].output.value).toHaveLength(20_000);
    // tool call/result pairing preserved
    expect(r.messages).toHaveLength(msgs.length);
  });

  test("stops compacting as soon as it fits", () => {
    const msgs = transcript(10, 4_000);
    const r = compactMessages(msgs, { budgetTokens: estimateMessagesTokens(msgs) - 500, keepRecent: 2 });
    expect(r.compacted).toBe(1);
  });
});

describe("system prompt", () => {
  test("includes rules, project docs, repo map and todos", async () => {
    const repo = tmpGitRepo({ "AGENTS.md": "Always use tabs.\n", "src/index.ts": "export {}\n" });
    const prompt = await buildSystemPrompt({
      workRoot: repo,
      todos: [{ id: "1", content: "write tests", status: "pending" }],
      phase: "plan",
    });
    expect(prompt).toContain("You are Vard");
    expect(prompt).toContain("PLANNING PHASE");
    expect(prompt).toContain("Always use tabs.");
    expect(prompt).toContain("src/index.ts");
    expect(prompt).toContain("[ ] 1. write tests");
  });

  test("repo map summarizes large trees by directory", async () => {
    const dir = tmpDir();
    for (let i = 0; i < 300; i++) {
      const d = path.join(dir, `pkg${i % 3}`, "src");
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, `f${i}.ts`), "");
    }
    const map = await repoMap(dir, 50);
    expect(map).toContain("300 files");
    expect(map).toContain("pkg0/src/ (100 files)");
  });
});
