/** Compact results that flow from one agent to the agents that depend on it, and the run summary. */
import { truncateMiddle } from "../util";
import type { OrchestrationState, SubtaskState } from "./schema";

export const MAX_RESULT_SUMMARY = 1_500;

export function compactSummary(text: string): string {
  return truncateMiddle(text.trim(), MAX_RESULT_SUMMARY);
}

/** What a dependent agent is told about the work it builds on (a reference, not a transcript). */
export function dependencyContext(deps: SubtaskState[]): string {
  if (!deps.length) return "";
  return deps
    .map((d) => {
      const files = d.result?.files.length
        ? `\n  Files changed: ${d.result.files.slice(0, 30).join(", ")}${d.result.files.length > 30 ? ", …" : ""}`
        : "";
      return `- [${d.id}] ${d.title} (${d.role}): ${d.result?.summary.replace(/\n+/g, " ") || "no summary"}${files}`;
    })
    .join("\n");
}

export function runSummary(s: OrchestrationState): string {
  const lines = [
    `Team run: ${s.subtasks.filter((x) => x.status === "completed").length}/${s.subtasks.length} subtasks completed.`,
  ];
  for (const t of s.subtasks)
    lines.push(
      `- ${t.status === "completed" ? "✓" : t.status === "skipped" ? "–" : "✗"} ${t.title} (${t.role}, ${t.status})${t.result?.summary ? `: ${t.result.summary.split("\n")[0].slice(0, 200)}` : t.error ? `: ${t.error.slice(0, 200)}` : ""}`,
    );
  const review = s.reviews.at(-1);
  if (review)
    lines.push(
      `Review: ${review.verdict.replace("_", " ")}${review.findings.length ? ` (${review.findings.length} finding${review.findings.length > 1 ? "s" : ""})` : ""}. ${review.summary.slice(0, 400)}`,
    );
  return lines.join("\n");
}
