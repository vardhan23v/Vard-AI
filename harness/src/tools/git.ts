import { z } from "zod";
import { git, truncateMiddle } from "../util";
import { type ToolDef, ToolError, resolveIn } from "./types";

export const gitStatus: ToolDef<Record<string, never>> = {
  name: "git_status",
  description: "Show `git status` (short format with branch) for the project.",
  inputSchema: z.object({}),
  risk: "read",
  maxOutput: 10_000,
  truncate(s) {
    return truncateMiddle(s, this.maxOutput);
  },
  async execute(_input, ctx) {
    const r = await git(ctx.workRoot, ["status", "--short", "--branch"]);
    if (r.code !== 0) throw new ToolError(r.stderr.trim() || "git status failed");
    return r.stdout.trim() || "clean";
  },
};

export const gitDiff: ToolDef<{ path?: string; staged?: boolean }> = {
  name: "git_diff",
  description: "Show the uncommitted diff (optionally staged only, or for one path).",
  inputSchema: z.object({
    path: z.string().optional().describe("Limit the diff to this path"),
    staged: z.boolean().optional().describe("Show only staged changes"),
  }),
  risk: "read",
  pathFields: ["path"],
  maxOutput: 40_000,
  truncate(s) {
    return truncateMiddle(s, this.maxOutput);
  },
  async execute({ path: p, staged }, ctx) {
    const args = ["diff", "--no-color", "--no-ext-diff"];
    if (staged) args.push("--cached");
    if (p) args.push("--", resolveIn(ctx, p));
    const r = await git(ctx.workRoot, args);
    if (r.code !== 0) throw new ToolError(r.stderr.trim() || "git diff failed");
    return r.stdout || "no changes";
  },
};
