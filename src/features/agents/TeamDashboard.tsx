/**
 * Live dashboard of a team run, built only from the agent's events: phase and controls, the plan
 * as a dependency graph, one card per agent, the review, and the activity log.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  GitMerge,
  ListTree,
  MessagesSquare,
  Pause,
  Play,
  ScanSearch,
  SkipForward,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import type { AgentTask } from "@/features/agent/projects";
import { Card } from "@/features/agent/TaskView";
import { RetryNotice } from "@/features/agent/RetryNotice";
import {
  taskActions,
  type AgentRun,
  type LiveTask,
  type RetryWait,
  type SubtaskState,
  type TeamState,
} from "@/features/agent/store";
import { Flash } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AgentSheet } from "./AgentSheet";
import { Pill } from "./Pill";
import { SubtaskSheet } from "./SubtaskSheet";
import { TeamPlanApproval } from "./TeamPlanApproval";
import {
  AGENT_LABEL,
  agentTone,
  elapsed,
  fmtTokens,
  layers,
  PHASE_LABEL,
  ROLE_LABEL,
  SUBTASK_LABEL,
  subtaskTone,
} from "./team-utils";

const LIVE_PHASES = [
  "planning",
  "awaiting_approval",
  "running",
  "paused",
  "attention",
  "reviewing",
];

function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}

export function TeamDashboard({ task, live }: { task: AgentTask; live: LiveTask }) {
  const team = live.team!;
  const [subtaskId, setSubtaskId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const running = LIVE_PHASES.includes(team.phase);
  useTick(running);

  const control = async (action: Parameters<typeof taskActions.control>[1]) => {
    try {
      await taskActions.control(task.id, action);
    } catch (e) {
      toast.error("Couldn't update the run", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const done = team.subtasks.filter((s) => s.status === "completed").length;
  const active = team.agents.filter((a) =>
    ["running", "created", "waiting_approval", "paused"].includes(a.status),
  ).length;
  const review = team.reviews.at(-1);
  const planApproval = live.pending?.kind === "plan" && live.pending.graph;

  return (
    <div className="space-y-5">
      <section aria-label="Team run" className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Users className="size-4 text-agent-foreground" aria-hidden />
            <span className="font-medium">Team run</span>
            <Pill
              tone={
                team.phase === "done"
                  ? "ok"
                  : team.phase === "failed"
                    ? "bad"
                    : team.phase === "attention" || team.phase === "awaiting_approval"
                      ? "attention"
                      : running
                        ? "live"
                        : "muted"
              }
              spin={
                running &&
                team.phase !== "paused" &&
                team.phase !== "attention" &&
                team.phase !== "awaiting_approval"
              }
            >
              {PHASE_LABEL[team.phase]}
            </Pill>
            {team.reason && <span className="text-xs text-muted-foreground">{team.reason}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {team.phase === "paused" ? (
              <button
                onClick={() => void control("resume")}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Play className="size-4" /> Resume
              </button>
            ) : (
              ["running", "reviewing", "planning"].includes(team.phase) && (
                <button
                  onClick={() => void control("pause")}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
                >
                  <Pause className="size-4" /> Pause
                </button>
              )
            )}
            {team.phase === "attention" && (
              <button
                onClick={() => void control("continue")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
              >
                <SkipForward className="size-4" /> Continue without them
              </button>
            )}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat
            label="Subtasks done"
            value={team.subtasks.length ? `${done} / ${team.subtasks.length}` : "–"}
            flash
          />
          <Stat
            label="Agents working"
            value={`${active} / ${team.options.maxAgents || "–"}`}
            flash
          />
          <Stat
            label="Tokens (reported)"
            value={fmtTokens(team.usage.totalTokens)}
            flash
            hint={
              team.options.tokenBudget ? `budget ${fmtTokens(team.options.tokenBudget)}` : undefined
            }
          />
          <Stat label="Elapsed" value={elapsed(team.startedAt, team.endedAt)} />
        </dl>
        {team.subtasks.length > 0 && (
          <Progress
            value={(done / team.subtasks.length) * 100}
            className="mt-3 h-1.5"
            aria-label="Subtasks done"
          />
        )}
        {team.phase === "attention" && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            Some subtasks failed or need your input. Open one to answer or retry it, or continue
            with what succeeded.
          </p>
        )}
      </section>

      {planApproval && (
        <TeamPlanApproval key={live.pending!.approvalId} taskId={task.id} live={live} />
      )}

      {team.subtasks.length > 0 && (
        <Card title="Plan" icon={<ListTree className="size-4" />}>
          {team.graph?.summary && (
            <p className="mb-3 text-sm text-muted-foreground">{team.graph.summary}</p>
          )}
          <PlanGraph subtasks={team.subtasks} agents={team.agents} onOpen={setSubtaskId} />
        </Card>
      )}

      {team.agents.length > 0 && (
        <Card title="Agents" icon={<Bot className="size-4" />}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[...team.agents]
              .sort((a, b) => a.startedAt - b.startedAt)
              .map((a) => (
                <li key={a.agentId}>
                  <AgentCard
                    agent={a}
                    retry={team.retries?.[a.agentId]}
                    subtask={team.subtasks.find((s) => s.id === a.subtaskId)}
                    onOpen={() => setAgentId(a.agentId)}
                  />
                </li>
              ))}
          </ul>
        </Card>
      )}

      {review && <ReviewCard team={team} onAgent={setAgentId} />}

      {(team.messages.length > 0 || team.integrations.length > 0) && <ActivityLog team={team} />}

      <SubtaskSheet
        taskId={task.id}
        team={team}
        subtask={team.subtasks.find((s) => s.id === subtaskId) ?? null}
        onClose={() => setSubtaskId(null)}
        onAgent={(id) => {
          setSubtaskId(null);
          setAgentId(id);
        }}
      />
      <AgentSheet
        taskId={task.id}
        team={team}
        agent={team.agents.find((a) => a.agentId === agentId) ?? null}
        onClose={() => setAgentId(null)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  flash,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Highlight the value when it changes (counters, not the ticking clock). */
  flash?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        {flash ? <Flash value={value}>{value}</Flash> : value}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

function PlanGraph({
  subtasks,
  agents,
  onOpen,
}: {
  subtasks: SubtaskState[];
  agents: AgentRun[];
  onOpen: (id: string) => void;
}) {
  const cols = useMemo(() => layers(subtasks), [subtasks]);
  return (
    <ol className="flex gap-3 overflow-x-auto pb-1" aria-label="Subtasks by dependency order">
      {cols.map((col, i) => (
        <li
          key={i}
          className="flex min-w-52 flex-1 animate-enter flex-col gap-2"
          style={{ animationDelay: `calc(var(--motion-step) * ${Math.min(i, 9)})` }}
        >
          <p className="text-xs text-muted-foreground">{i === 0 ? "Start" : `Then (${i + 1})`}</p>
          {col.map((s) => {
            const agent = agents.filter((a) => a.subtaskId === s.id).at(-1);
            return (
              <button
                key={s.id}
                onClick={() => onOpen(s.id)}
                className={cn(
                  "rounded-lg border bg-background/40 p-2.5 text-left transition-colors hover:bg-accent",
                  s.status === "running" || s.status === "integrating"
                    ? "border-agent/60"
                    : s.status === "needs_attention"
                      ? "border-primary/60"
                      : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm leading-snug font-medium">{s.title}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Pill tone="muted">{ROLE_LABEL[s.role]}</Pill>
                  <Pill
                    tone={subtaskTone(s.status)}
                    spin={s.status === "running" || s.status === "integrating"}
                  >
                    {SUBTASK_LABEL[s.status]}
                  </Pill>
                </div>
                {[...s.dependsOn, ...s.implicitDeps].length > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    after {[...s.dependsOn, ...s.implicitDeps].join(", ")}
                  </p>
                )}
                {s.check && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span key={s.check.verdict} className="inline-flex animate-scale-in">
                      <Pill
                        tone={
                          s.check.verdict === "pass"
                            ? "ok"
                            : s.check.verdict === "fail"
                              ? "bad"
                              : "muted"
                        }
                      >
                        {s.check.verdict === "pass"
                          ? "check passed"
                          : s.check.verdict === "fail"
                            ? `${s.check.findings.length} finding(s)`
                            : "no verdict"}
                      </Pill>
                    </span>
                    {s.retestRound ? (
                      <span
                        key={s.retestRound}
                        className="inline-block animate-scale-in text-muted-foreground"
                      >
                        re-test {s.retestRound}
                      </span>
                    ) : null}
                  </p>
                )}
                {agent?.skills.length ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    skills: {agent.skills.map((k) => k.name).join(", ")}
                  </p>
                ) : null}
              </button>
            );
          })}
        </li>
      ))}
    </ol>
  );
}

function AgentCard({
  agent: a,
  retry,
  subtask,
  onOpen,
}: {
  agent: AgentRun;
  retry?: RetryWait;
  subtask?: SubtaskState;
  onOpen: () => void;
}) {
  const live = a.status === "running" || a.status === "created";
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          {live && <span className="live-dot text-agent-foreground" aria-hidden />}
          <span className="truncate">{ROLE_LABEL[a.role]} agent</span>
        </span>
        <Pill tone={agentTone(a.status)} spin={live}>
          {AGENT_LABEL[a.status]}
        </Pill>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {subtask?.title ??
          (a.role === "planner"
            ? "Planning the work"
            : a.role === "reviewer"
              ? "Reviewing the combined change"
              : a.agentId)}
      </p>
      {a.activity && live && <p className="mt-1.5 truncate font-mono text-xs">{a.activity}</p>}
      {live && <RetryNotice wait={retry} className="mt-1.5" />}
      {a.error && <p className="mt-1.5 line-clamp-2 text-xs text-destructive">{a.error}</p>}
      <Progress
        value={Math.min(100, (a.steps / a.maxSteps) * 100)}
        className="mt-2 h-1"
        aria-label={`${a.steps} of ${a.maxSteps} steps`}
      />
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{a.model}</span>
        <Flash value={a.steps}>
          {a.steps}/{a.maxSteps} steps
        </Flash>
        <Flash value={a.usage.totalTokens}>{fmtTokens(a.usage.totalTokens)} tokens</Flash>
        <span>{a.toolCalls} tool calls</span>
        {a.skills.length > 0 && <span>{a.skills.length} skills</span>}
      </p>
    </button>
  );
}

const SEVERITY: Record<string, string> = {
  critical: "text-destructive",
  high: "text-destructive",
  medium: "text-primary",
  low: "text-muted-foreground",
};

function ReviewCard({ team, onAgent }: { team: TeamState; onAgent: (id: string) => void }) {
  return (
    <Card title="Review" icon={<ScanSearch className="size-4" />}>
      <ol className="space-y-4">
        {team.reviews.map((r) => (
          <li key={r.round}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Round {r.round}</span>
              <Pill
                tone={
                  r.verdict === "approve"
                    ? "ok"
                    : r.verdict === "changes_requested"
                      ? "attention"
                      : "muted"
                }
              >
                {r.verdict === "approve"
                  ? "Approved"
                  : r.verdict === "changes_requested"
                    ? "Changes requested"
                    : "Unavailable"}
              </Pill>
              {r.verify && (
                <Pill tone={r.verify.ok ? "ok" : "bad"}>
                  {r.verify.command} {r.verify.ok ? "passed" : "failed"}
                </Pill>
              )}
              {r.agentId && (
                <button
                  onClick={() => onAgent(r.agentId!)}
                  className="text-xs text-agent-foreground underline-offset-2 hover:underline"
                >
                  open reviewer
                </button>
              )}
            </div>
            {r.summary && <p className="mt-1 text-sm text-muted-foreground">{r.summary}</p>}
            {r.findings.length > 0 && (
              <ul className="stagger mt-2 space-y-1.5 text-sm">
                {r.findings.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className={cn(
                        "w-16 shrink-0 text-xs font-medium uppercase",
                        SEVERITY[f.severity],
                      )}
                    >
                      {f.severity}
                    </span>
                    <span>
                      {f.file && (
                        <code className="text-xs">
                          {f.file}
                          {f.line ? `:${f.line}` : ""}
                        </code>
                      )}{" "}
                      {f.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ActivityLog({ team }: { team: TeamState }) {
  const items = [
    ...team.messages.map((m) => ({
      at: m.at,
      key: `m${m.seq}`,
      icon: <MessagesSquare className="size-3.5" />,
      text: `${m.from}${m.to ? ` → ${m.to}` : ""}: ${m.kind.replace(/_/g, " ")} — ${m.text}`,
    })),
    ...team.integrations.map((r, i) => ({
      at: r.at,
      key: `i${i}`,
      icon:
        r.status === "conflict" ? (
          <AlertTriangle className="size-3.5 text-destructive" />
        ) : r.status === "merged" ? (
          <GitMerge className="size-3.5 text-success" />
        ) : (
          <CheckCircle2 className="size-3.5" />
        ),
      text: `${r.subtaskId}: ${r.status === "merged" ? `merged ${r.files.length} file(s)` : r.status === "empty" ? "nothing to merge" : `conflict in ${r.files.join(", ")}`}`,
    })),
  ].sort((a, b) => a.at - b.at);
  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
        Activity log ({items.length})
      </summary>
      <ol className="max-h-80 space-y-1 overflow-y-auto px-4 pb-3 text-xs">
        {items.map((it) => (
          <li key={it.key} className="flex animate-row-in items-start gap-2">
            <time className="w-16 shrink-0 text-muted-foreground tabular-nums">
              {new Date(it.at).toLocaleTimeString()}
            </time>
            <span className="mt-0.5 shrink-0 text-muted-foreground">{it.icon}</span>
            <span className="min-w-0 break-words">{it.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
