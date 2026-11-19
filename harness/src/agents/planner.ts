/**
 * The planner agent: inspects the project with read-only tools and returns a task graph as JSON.
 * Invalid output gets up to two repair attempts (a short follow-up run with the errors).
 */
import { OrchestrationError } from "./errors";
import { dedupeGraph, validateGraph } from "./dependencies";
import { type TaskGraph as TaskGraphT, TaskGraph, WORKER_ROLES, type RoleConfig } from "./schema";
import { type AgentEnv, runAgent } from "./worker";
import type { AgentRun } from "./schema";
import type { Usage } from "../protocol";

export function plannerPrompt(goal: string, roles: RoleConfig[], maxSubtasks: number, feedback?: string): string {
  const roleList = roles
    .filter((r) => (WORKER_ROLES as readonly string[]).includes(r.id))
    .map((r) => `- ${r.id}: ${r.description}`)
    .join("\n");
  return `Plan this request for a team of specialist agents:

"""
${goal}
"""

Available roles:
${roleList}

Inspect the project first (read-only tools), then answer with ONLY a JSON object in a \`\`\`json block:
{
  "summary": "one or two sentences on the approach",
  "tasks": [
    {
      "id": "short-kebab-id",
      "title": "what this subtask delivers",
      "role": "frontend | backend | database | testing | browser | analyst",
      "description": "precise instructions: what to build or change, where, and any contract other subtasks rely on (API shapes, names)",
      "dependsOn": ["ids of subtasks that must finish first"],
      "files": ["paths or globs this subtask expects to change"],
      "acceptance": "how to tell it is done"
    }
  ]
}

Rules:
- At most ${maxSubtasks} subtasks; prefer fewer, well-scoped ones. A small request can be a single subtask.
- Only add a dependency when a subtask needs another's output (for example the frontend needs the API contract). Independent subtasks run in parallel.
- Each subtask runs in its own copy of the repository and is merged afterwards, so list the files each one touches; subtasks touching the same files run one after another.
- Put tests in a "testing" subtask that depends on the code it tests, unless the code subtask should write its own.
- Before planning a change to existing code, call code_impact_analysis on the main files or symbols it touches (and code_search to find them). Use what it reports (dependents, tests, verification commands) for the "files" lists, the dependencies and the acceptance criteria.
- When the request changes something users see in a browser (pages, layout, styling, forms, responsive behaviour), add a "browser" subtask that depends on the UI subtasks: it starts the dev server and checks the result at the relevant viewports. It doesn't edit files.
- Use an "analyst" subtask only when the codebase must be mapped before anyone can work (very large or unfamiliar code); it doesn't edit files.
- Don't plan reviews: the combined change is reviewed automatically.${feedback ? `\n\nThe user asked for changes to the previous plan:\n${feedback}` : ""}`;
}

/** Pulls the JSON object out of a model reply (fenced or bare). */
export function extractJson(text: string): unknown {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/i.exec(text);
  const src = fence ? fence[1] : text;
  const start = src.indexOf("{");
  const end = src.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(src.slice(start, end + 1));
}

export function parseGraph(text: string, maxSubtasks: number): { graph?: TaskGraphT; errors: string[]; merged: { dropped: string; into: string }[] } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { errors: [`the reply is not valid JSON (${(e as Error).message})`], merged: [] };
  }
  const r = TaskGraph.safeParse(raw);
  if (!r.success) return { errors: r.error.issues.map((i) => `${i.path.join(".") || "plan"}: ${i.message}`), merged: [] };
  const { graph, merged } = dedupeGraph(r.data);
  const errors = validateGraph(graph, { maxSubtasks });
  return errors.length ? { errors, merged } : { graph, errors, merged };
}

export async function planGraph(
  env: AgentEnv,
  o: { goal: string; roles: RoleConfig[]; planner: RoleConfig; maxSubtasks: number; feedback?: string; signal: AbortSignal; round: number },
): Promise<{ graph: TaskGraphT; merged: { dropped: string; into: string }[]; usage: Usage; agents: AgentRun[] }> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const agents: AgentRun[] = [];
  const add = (u: Usage) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.totalTokens += u.totalTokens;
  };
  let prompt = plannerPrompt(o.goal, o.roles, o.maxSubtasks, o.feedback);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { result, agent } = await runAgent(env, {
      agentId: `planner-${o.round}${attempt > 1 ? `-${attempt}` : ""}`,
      role: o.planner,
      prompt,
      skillQuery: o.goal,
      workRoot: env.projectRoot,
      attempt,
      signal: o.signal,
      maxSteps: attempt === 1 ? o.planner.maxSteps : 3,
    });
    agents.push(agent);
    add(result.usage);
    if (result.status === "cancelled") throw new OrchestrationError("cancelled", "cancelled");
    if (result.status === "blocked") throw new OrchestrationError("plan_invalid", `the planner stopped: ${result.reason}`);
    const parsed = parseGraph(result.summary, o.maxSubtasks);
    if (parsed.graph) return { graph: parsed.graph, merged: parsed.merged, usage, agents };
    prompt = `${plannerPrompt(o.goal, o.roles, o.maxSubtasks, o.feedback)}\n\nYour previous answer could not be used:\n${parsed.errors.map((e) => `- ${e}`).join("\n")}\n\nPrevious answer:\n${result.summary.slice(0, 6_000)}\n\nReply with the corrected JSON only.`;
  }
  throw new OrchestrationError("plan_invalid", "the planner did not produce a valid plan after 3 attempts");
}

/** The plan as Markdown, for the approval card and terminals. */
export function renderGraph(g: TaskGraphT): string {
  const lines = g.summary ? [g.summary, ""] : [];
  g.tasks.forEach((t, i) => {
    lines.push(`${i + 1}. **${t.title}** (${t.role}, \`${t.id}\`)${t.dependsOn.length ? ` after ${t.dependsOn.map((d) => `\`${d}\``).join(", ")}` : ""}`);
    lines.push(`   ${t.description.replace(/\n+/g, " ")}`);
    if (t.files.length) lines.push(`   Files: ${t.files.join(", ")}`);
  });
  return lines.join("\n");
}
