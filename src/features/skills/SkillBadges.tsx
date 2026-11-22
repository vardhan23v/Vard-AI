import { AlertTriangle, EyeOff, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/Pill";
import { SOURCE_LABEL } from "./skill-labels";
import type { SkillSummary } from "@/lib/agent-client";

/** What state a skill is in: invalid, shadowed, needs trust, off or on. */
export function SkillState({ skill }: { skill: SkillSummary }) {
  if (!skill.valid)
    return (
      <Pill tone="bad">
        <AlertTriangle className="size-3" /> Invalid
      </Pill>
    );
  if (skill.shadowedBy)
    return (
      <Pill tone="muted" title={`A skill with this name from ${skill.shadowedBy} takes precedence`}>
        <EyeOff className="size-3" /> Shadowed
      </Pill>
    );
  if (!skill.trusted)
    return (
      <Pill tone="attention">
        <ShieldAlert className="size-3" /> Needs trust
      </Pill>
    );
  if (!skill.enabled) return <Pill tone="muted">Off</Pill>;
  return (
    <Pill tone="ok" dot>
      On
    </Pill>
  );
}

export function SourceBadge({ source }: { source: SkillSummary["source"] }) {
  return <Pill tone="muted">{SOURCE_LABEL[source]}</Pill>;
}
