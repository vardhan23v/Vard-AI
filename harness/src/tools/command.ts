import { z } from "zod";
import { run, truncateMiddle } from "../util";
import type { ToolDef } from "./types";

export const runCommand: ToolDef<{ command: string; timeoutSec?: number }> = {
  name: "run_command",
  description:
    "Run a shell command (sh -c) in the project directory. The working directory is fixed to the project; " +
    "use relative paths. Returns exit code, stdout and stderr (long output is truncated in the middle).",
  inputSchema: z.object({
    command: z.string().min(1).describe("Shell command"),
    timeoutSec: z.number().int().positive().max(1800).default(120).describe("Kill after this many seconds"),
  }),
  risk: "exec",
  maxOutput: 16_000,
  truncate(s) {
    return truncateMiddle(s, this.maxOutput);
  },
  async execute({ command, timeoutSec = 120 }, ctx) {
    const r = await run(["/bin/sh", "-c", command], {
      cwd: ctx.workRoot,
      timeoutMs: timeoutSec * 1000,
      signal: ctx.signal,
      env: { ...process.env, CI: "1", GIT_TERMINAL_PROMPT: "0", PAGER: "cat", GIT_PAGER: "cat" },
    });
    const parts = [r.timedOut ? `timed out after ${timeoutSec}s (killed)` : `exit code ${r.code}`];
    if (r.stdout.trim()) parts.push(`--- stdout ---\n${truncateMiddle(r.stdout, 12_000)}`);
    if (r.stderr.trim()) parts.push(`--- stderr ---\n${truncateMiddle(r.stderr, 6_000)}`);
    return parts.join("\n");
  },
};
