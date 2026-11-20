/**
 * The reviewer agent: reads the combined diff of the run (and the code around it) with read-only
 * tools and returns structured findings. It never edits files.
 */
import { z } from "zod";
import { type ToolDef, ToolError, resolveIn } from "../tools/types";
import { git, truncateMiddle } from "../util";
import { extractJson } from "./planner";
import { ReviewFinding, type ReviewResult, type RoleConfig, type SubtaskState } from "./schema";
import { type AgentEnv, runAgent } from "./worker";
import type { LoopResult } from "../loop";
import type { AgentRun } from "./schema";

/** `git diff <base>..HEAD` in the integration worktree (what the team changed so far). */
export function reviewDiffTool(base: string): ToolDef<{ path?: string }> {
  return {
    name: "review_diff",
    description:
      "Show the combined diff of everything the team changed in this run (optionally for one path).",
    inputSchema: z.object({ path: z.string().optional().describe("Limit the diff to this path") }),
    risk: "read",
    pathFields: ["path"],
    maxOutput: 40_000,
    truncate(s) {
      return truncateMiddle(s, this.maxOutput);
    },
    async execute({ path: p }, ctx) {
      const args = ["diff", "--no-color", "--no-ext-diff", base, "HEAD"];
      if (p) args.push("--", resolveIn(ctx, p));
      const r = await git(ctx.workRoot, args);
      if (r.code !== 0) throw new ToolError(r.stderr.trim() || "git diff failed");
      return r.stdout || "no changes";
    },
  };
}

const ReviewReply = z.object({
  verdict: z.enum(["approve", "changes_requested"]),
  summary: z.string().max(4000).default(""),
  findings: z.array(ReviewFinding).max(50).default([]),
});

export function reviewPrompt(o: {
  goal: string;
  subtasks: SubtaskState[];
  stat: string;
  verify?: ReviewResult["verify"];
  round: number;
}): string {
  const work = o.subtasks
    .filter((s) => s.status === "completed")
    .map(
      (s) =>
        `- [${s.id}] ${s.title} (${s.role}): ${s.result?.summary.replace(/\n+/g, " ").slice(0, 400) ?? ""}\n  Files: ${s.result?.files.join(", ") || "none"}`,
    )
    .join("\n");
  return `Review the combined change a team of agents made for this request:

"""
${o.goal}
"""

Subtasks:
${work || "(none)"}

Diff stat:
${o.stat || "(no changes)"}
${o.verify ? `\nVerification \`${o.verify.command}\` ${o.verify.ok ? "passed" : "FAILED"}:\n${o.verify.output.slice(-3_000)}\n` : ""}
Use review_diff to read the change and read_file/search for the code around it. ${o.round > 1 ? "This is the second review, after fixes: check the earlier findings were addressed." : ""}

Answer with ONLY a JSON object in a \`\`\`json block:
{
  "verdict": "approve" or "changes_requested",
  "summary": "two or three sentences",
  "findings": [
    { "severity": "critical|high|medium|low", "file": "path", "line": 12, "message": "what goes wrong and how to fix it", "subtask": "id of the subtask that owns it" }
  ]
}
Report only concrete problems (bugs, security issues, missing pieces the request needs, broken tests). Request changes only for critical, high or medium findings.`;
}

export function parseReview(text: string): z.infer<typeof ReviewReply> | null {
  try {
    const r = ReviewReply.safeParse(extractJson(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export async function runReview(
  env: AgentEnv,
  o: {
    reviewer: RoleConfig;
    goal: string;
    subtasks: SubtaskState[];
    stat: string;
    base: string;
    workRoot: string;
    verify?: ReviewResult["verify"];
    round: number;
    signal: AbortSignal;
  },
): Promise<{ review: ReviewResult; result: LoopResult; agent: AgentRun }> {
  const agentId = `reviewer-${o.round}`;
  const { result, agent } = await runAgent(env, {
    agentId,
    role: o.reviewer,
    prompt: reviewPrompt(o),
    skillQuery: `review ${o.goal}`,
    workRoot: o.workRoot,
    attempt: 1,
    signal: o.signal,
    extraTools: [reviewDiffTool(o.base)],
    skills: o.reviewer.skills.filter((s) => env.skills?.find(s)?.usable),
  });
  const parsed = result.status === "done" ? parseReview(result.summary) : null;
  const review: ReviewResult = parsed
    ? {
        round: o.round,
        verdict: parsed.verdict,
        summary: parsed.summary,
        findings: parsed.findings,
        verify: o.verify,
        agentId,
        at: Date.now(),
      }
    : {
        round: o.round,
        verdict: "unavailable",
        summary:
          result.status === "done"
            ? `The reviewer's answer couldn't be read: ${result.summary.slice(0, 500)}`
            : `The review stopped: ${result.reason ?? result.status}`,
        findings: [],
        verify: o.verify,
        agentId,
        at: Date.now(),
      };
  return { review, result, agent };
}
