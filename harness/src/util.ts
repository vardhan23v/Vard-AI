import fs from "node:fs";
import path from "node:path";

/** Keep the head and tail of a long string, dropping the middle. */
export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  const keep = Math.max(0, max - 80);
  const head = Math.ceil(keep * 0.6);
  const tail = keep - head;
  return `${s.slice(0, head)}\n…[truncated ${s.length - keep} chars]…\n${tail > 0 ? s.slice(-tail) : ""}`;
}

/** Keep the head of a long string. */
export function truncateHead(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/**
 * Like realpath, but works for paths that do not exist yet: resolves symlinks in the
 * longest existing ancestor and re-appends the missing tail.
 */
export function realpathLoose(p: string): string {
  let cur = path.resolve(p);
  const missing: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...missing.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      missing.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function run(
  cmd: string[],
  opts: { cwd: string; timeoutMs?: number; signal?: AbortSignal; env?: Record<string, string | undefined> },
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    env: opts.env ?? process.env,
  });
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, opts.timeoutMs)
    : undefined;
  const onAbort = () => proc.kill("SIGKILL");
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr, timedOut };
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export async function git(cwd: string, args: string[], timeoutMs = 60_000) {
  return run(["git", ...args], { cwd, timeoutMs });
}

export async function gitOk(cwd: string, args: string[]): Promise<string> {
  const r = await git(cwd, args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/** A short, useful message for provider/API errors (status code + provider detail), never headers. */
export function describeError(e: unknown): string {
  const err = e as any;
  if (!err) return "unknown error";
  const inner = err.lastError ?? err; // RetryError wraps the last APICallError
  let msg = String(err.message ?? err);
  const status = inner?.statusCode;
  let detail: string | undefined;
  try {
    const body = typeof inner?.responseBody === "string" ? JSON.parse(inner.responseBody) : undefined;
    detail = body?.error?.metadata?.raw ?? body?.error?.message;
  } catch {}
  if (status) msg += ` (HTTP ${status})`;
  if (detail && !msg.includes(detail)) msg += `: ${String(detail).slice(0, 500)}`;
  return msg;
}
