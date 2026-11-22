import type { SkillSummary } from "@/lib/agent-client";

export const SOURCE_LABEL: Record<SkillSummary["source"], string> = {
  builtin: "Built-in",
  global: "Global",
  project: "Project",
};
