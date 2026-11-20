/** Skills for one task or one team agent: resolve, render, build tools, record usage. */
import { renderSkillsBlock, skillTools } from "./activation";
import type { SkillRegistry } from "./registry";
import { type ProjectSignals, resolveSkills, type ResolvedSkill } from "./resolver";
import type { ActivatedSkill } from "./schema";
import { estimateTokens } from "../util";
import type { ToolDef } from "../tools/types";

export interface TaskSkills {
  resolved: ResolvedSkill[];
  activated: ActivatedSkill[];
  block: string;
  tools: ToolDef[];
  tokens: number;
}

export function skillsForTask(o: {
  registry: SkillRegistry;
  prompt: string;
  explicit?: string[];
  auto?: boolean;
  role?: string;
  hints?: string[];
  signals?: ProjectSignals;
  taskId: string;
  agentId?: string;
  maxChars?: number;
  topK?: number;
}): TaskSkills {
  const resolved = resolveSkills(
    o.registry
      .usable()
      .concat(
        o.registry
          .all()
          .filter((r) => !r.usable && o.explicit?.some((e) => e === r.name || e === r.id)),
      ),
    {
      prompt: o.prompt,
      explicit: o.explicit,
      auto: o.auto,
      role: o.role,
      hints: o.hints,
      signals: o.signals,
      maxChars: o.maxChars,
      topK: o.topK,
    },
  );
  const base = {
    taskId: o.taskId,
    agentId: o.agentId,
    role: o.role,
    projectRoot: o.registry.projectRoot,
  };
  o.registry.recordUse(
    resolved.map((r) => ({
      ...base,
      skillId: r.record.id,
      at: Date.now(),
      how: r.activation.explicit ? ("explicit" as const) : ("auto" as const),
    })),
  );
  const block = renderSkillsBlock(resolved);
  const tools = skillTools({
    skills: resolved,
    onUse: (u) => o.registry.recordUse([{ ...base, ...u, at: Date.now() }]),
  });
  return {
    resolved,
    activated: resolved.map((r) => r.activation),
    block,
    tools,
    tokens: block ? estimateTokens(block) : 0,
  };
}
