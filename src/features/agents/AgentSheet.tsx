/** One agent: identity, assignment, model, skills, permissions, timeline, messages and result. */
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Markdown } from "@/features/chat/Markdown";
import { Timeline } from "@/features/agent/TaskView";
import type { AgentRun, TeamState } from "@/features/agent/store";
import { Pill } from "./Pill";
import { AGENT_LABEL, agentTone, elapsed, fmtTokens, ROLE_LABEL } from "./team-utils";

export function AgentSheet({
  taskId,
  team,
  agent: a,
  onClose,
}: {
  taskId: string;
  team: TeamState;
  agent: AgentRun | null;
  onClose: () => void;
}) {
  if (!a) return null;
  const sub = team.subtasks.find((s) => s.id === a.subtaskId);
  const timeline = team.timelines[a.agentId] ?? [];
  const messages = team.messages.filter((m) => m.from === a.agentId || m.to === a.agentId);
  const mcp = Object.entries(a.mcpCalls);
  const vardTools = a.tools.filter((t) => !t.startsWith("mcp__"));
  const mcpTools = a.tools.filter((t) => t.startsWith("mcp__"));
  const live = a.status === "running" || a.status === "created";

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="pr-6">
            {ROLE_LABEL[a.role]} agent{" "}
            <code className="text-sm font-normal text-muted-foreground">{a.agentId}</code>
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={agentTone(a.status)} spin={live}>
                {AGENT_LABEL[a.status]}
              </Pill>
              <span className="text-xs">{a.model}</span>
              <span className="text-xs">
                {a.steps}/{a.maxSteps} steps · {fmtTokens(a.usage.totalTokens)} tokens ·{" "}
                {elapsed(a.startedAt, a.endedAt)}
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6 text-sm">
          {sub && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Assigned task
              </h3>
              <p className="font-medium">{sub.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{sub.description}</p>
            </section>
          )}
          {a.error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
              {a.error}
            </p>
          )}
          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Skills
            </h3>
            {a.skills.length ? (
              <ul className="space-y-1">
                {a.skills.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {s.source} · {s.reasons.join("; ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No skills matched this assignment.</p>
            )}
          </section>
          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Tool permissions
            </h3>
            <p className="mb-1 text-xs text-muted-foreground">
              What this role may call. Every call still goes through Vard's policy and your
              approvals.
            </p>
            <div className="flex flex-wrap gap-1">
              {vardTools.map((t) => (
                <code key={t} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t}
                </code>
              ))}
              {mcpTools.length > 0 && (
                <span className="text-xs text-muted-foreground">+ {mcpTools.length} MCP tools</span>
              )}
            </div>
            {mcp.length > 0 && (
              <p className="mt-2 text-xs">
                MCP calls: {mcp.map(([k, n]) => `${k} ×${n}`).join(", ")}
              </p>
            )}
          </section>
          {a.workspace && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Workspace
              </h3>
              <p className="font-mono text-xs break-all">
                {a.workspace.branch ? `${a.workspace.branch} · ` : "read-only · "}
                {a.workspace.path}
              </p>
            </section>
          )}
          {a.summary && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Result
              </h3>
              <Markdown text={a.summary} className="text-sm" />
            </section>
          )}
          {messages.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Messages
              </h3>
              <ul className="space-y-1 text-xs">
                {messages.map((m) => (
                  <li key={m.seq}>
                    <time className="text-muted-foreground">
                      {new Date(m.at).toLocaleTimeString()}
                    </time>{" "}
                    {m.kind.replace(/_/g, " ")}: {m.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Execution log
            </h3>
            {timeline.length ? (
              <Timeline taskId={taskId} items={timeline} />
            ) : (
              <p className="text-muted-foreground">Nothing yet.</p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
