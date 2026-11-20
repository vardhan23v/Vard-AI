import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import type { ToolContext } from "../src/tools/types";

const usage = (i = 100, o = 20) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});

export type Turn = { text?: string; calls?: Array<{ name: string; input: unknown }> };

let callSeq = 0;
function turnParts(t: Turn): any[] {
  const parts: any[] = [];
  if (t.text) {
    parts.push({ type: "text-start", id: "t" });
    // stream in two chunks to exercise token events
    const mid = Math.ceil(t.text.length / 2);
    parts.push({ type: "text-delta", id: "t", delta: t.text.slice(0, mid) });
    if (t.text.slice(mid)) parts.push({ type: "text-delta", id: "t", delta: t.text.slice(mid) });
    parts.push({ type: "text-end", id: "t" });
  }
  for (const c of t.calls ?? [])
    parts.push({
      type: "tool-call",
      toolCallId: `call_${++callSeq}`,
      toolName: c.name,
      input: JSON.stringify(c.input),
    });
  parts.push({
    type: "finish",
    usage: usage(),
    finishReason: { unified: t.calls?.length ? "tool-calls" : "stop", raw: undefined },
  });
  return parts;
}

/** A deterministic model that plays back one scripted turn per model call. */
export function scriptedModel(turns: Turn[]) {
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const t = turns[i++] ?? { text: "(script exhausted)" };
      return { stream: convertArrayToReadableStream(turnParts(t)) };
    },
  });
}

export function tmpDir(prefix = "vard-test-"): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function sh(cwd: string, cmd: string[]): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString();
}

/** A temp git repo with one committed file. */
export function tmpGitRepo(
  files: Record<string, string> = { "hello.txt": "hello world\n" },
): string {
  const dir = tmpDir("vard-repo-");
  sh(dir, ["git", "init", "-q", "-b", "main"]);
  sh(dir, ["git", "config", "user.email", "t@example.com"]);
  sh(dir, ["git", "config", "user.name", "Test"]);
  sh(dir, ["git", "config", "commit.gpgsign", "false"]);
  for (const [f, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  sh(dir, ["git", "add", "-A"]);
  sh(dir, ["git", "commit", "-q", "-m", "init"]);
  return dir;
}

export function toolCtx(root: string): ToolContext {
  const ctx: ToolContext = {
    workRoot: root,
    projectRoot: root,
    todos: [],
    setTodos: (t) => {
      ctx.todos = t;
    },
  };
  return ctx;
}

/** Gives a scripted model a fixed reply for non-streaming calls (the post-task reflection). */
export function withReflection<T extends object>(model: T, reply: string): T {
  (model as any).doGenerate = async () => ({
    content: [{ type: "text", text: reply }],
    finishReason: { unified: "stop", raw: undefined },
    usage: usage(10, 5),
    warnings: [],
  });
  return model;
}

export type RouteInfo = {
  system: string;
  /** The agent's assignment (its first user message). */
  task: string;
  /** Model calls this agent has made before this one. */
  step: number;
  /** Text of the latest tool results, if the last message holds them. */
  lastResults: string[];
};

/**
 * A model that answers by looking at the conversation, so concurrent agents (each its own
 * AgentLoop sharing one model) get deterministic, per-agent scripts. `delayMs` slows each call.
 */
export function routedModel(
  route: (r: RouteInfo) => Turn,
  opts: { delayMs?: number; onCall?: (r: RouteInfo) => void } = {},
) {
  const text = (c: unknown): string =>
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c.map((p: any) => p.text ?? (p.output ? String(p.output.value ?? "") : "")).join("")
        : "";
  return new MockLanguageModelV4({
    doStream: async (o: any) => {
      const prompt: any[] = o.prompt;
      const system = prompt
        .filter((m) => m.role === "system")
        .map((m) => text(m.content))
        .join("\n");
      const task = text(prompt.find((m) => m.role === "user")?.content);
      const step = prompt.filter((m) => m.role === "assistant").length;
      const last = prompt[prompt.length - 1];
      const lastResults =
        last?.role === "tool" ? last.content.map((p: any) => String(p.output?.value ?? "")) : [];
      const info = { system, task, step, lastResults };
      opts.onCall?.(info);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      return { stream: convertArrayToReadableStream(turnParts(route(info))) };
    },
  });
}
