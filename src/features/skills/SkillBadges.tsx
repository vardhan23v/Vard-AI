import { AlertTriangle, EyeOff, ShieldAlert } from "lucide-react";
import type { SkillSummary } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

export const SOURCE_LABEL: Record<SkillSummary["source"], string> = {
  builtin: "Built-in",
  global: "Global",
  project: "Project",
};

const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-normal";

/** What state a skill is in: invalid, shadowed, needs trust, off or on. */
export function SkillState({ skill }: { skill: SkillSummary }) {
  if (!skill.valid)
    return (
      <span className={cn(pill, "border-destructive/50 text-destructive")}>
        <AlertTriangle className="size-3" /> Invalid
      </span>
    );
  if (skill.shadowedBy)
    return (
      <span
        className={cn(pill, "border-border text-muted-foreground")}
        title={`A skill with this name from ${skill.shadowedBy} takes precedence`}
      >
        <EyeOff className="size-3" /> Shadowed
      </span>
    );
  if (!skill.trusted)
    return (
      <span className={cn(pill, "border-primary/60 text-primary")}>
        <ShieldAlert className="size-3" /> Needs trust
      </span>
    );
  if (!skill.enabled)
    return <span className={cn(pill, "border-border text-muted-foreground")}>Off</span>;
  return (
    <span className={cn(pill, "border-diff-add/50 text-diff-add")}>
      <span className="size-1.5 rounded-full bg-diff-add" aria-hidden /> On
    </span>
  );
}

export function SourceBadge({ source }: { source: SkillSummary["source"] }) {
  return (
    <span className={cn(pill, "border-border text-muted-foreground")}>{SOURCE_LABEL[source]}</span>
  );
}
