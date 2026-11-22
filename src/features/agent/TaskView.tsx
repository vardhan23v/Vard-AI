import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Plug,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  FolderOpen,
  GitMerge,
  Loader2,
  ShieldAlert,
  Square,
  Terminal,
  Trash2,
  Wrench,
  XCircle,
  Sparkles,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Markdown } from "@/features/chat/Markdown";
import { TeamDashboard } from "@/features/agents/TeamDashboard";
import { CodeContextCard, TaskBrowserPanel } from "@/features/browser/TaskBrowserPanel";
import { DiffView } from "./DiffView";
import { RetryNotice } from "./RetryNotice";
import { isRunning, taskActions, useTask, type LiveTask, type TimelineItem } from "./store";
import { projectPath, type AgentTask } from "./projects";
import { MEMORY_CATEGORIES, memory } from "@/lib/agent-client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Pill, type Tone } from "@/components/Pill";

const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  awaiting_plan_approval: "Needs plan approval",
  acting: "Working",
  observing: "Working",
  verifying: "Verifying",
  done: "Done",
  blocked: "Blocked",
  cancelled: "Cancelled",
  merged: "Merged",
  discarded: "Discarded",
};

export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "done" || status === "merged"
      ? "ok"
      : status === "blocked"
        ? "bad"
        : status === "awaiting_plan_approval"
          ? "attention"
          : status === "cancelled" || status === "discarded"
            ? "muted"
            : "live";
  const live = ["planning", "acting", "observing", "verifying"].includes(status);
  return (
    <Pill tone={tone} spin={live}>
      {STATUS_LABEL[status] ?? status}
    </Pill>
  );
}

export function TaskView({ task }: { task: AgentTask }) {
  const live = useTask(task.id);
  const status = live?.done?.status ?? live?.state ?? task.status;
  const running = isRunning(live);
  const hasTeam = !!live?.team;

  // After the window reloads, ask the agent for the team run's current state.
  useEffect(() => {
    if (
      task.mode === "team" &&
      !hasTeam &&
      !["done", "blocked", "cancelled", "merged", "discarded"].includes(task.status)
    )
      void taskActions.sync(task.id).catch(() => {});
  }, [task.id, task.mode, task.status, hasTeam]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={live?.worktree?.action === "merged" ? "merged" : status} />
            {task.model && (
              <span className="truncate text-xs text-muted-foreground">{task.model}</span>
            )}
          </div>
          <h1 className="mt-2 line-clamp-2 font-sans text-base font-medium">{task.prompt}</h1>
          {running && <RetryNotice wait={live?.retry} className="mt-1.5" />}
        </div>
        {running && (
          <button
            onClick={() => taskActions.cancel(task.id)}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-input px-3 text-sm hover:bg-accent"
          >
            <Square className="size-3.5" /> Stop
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-6">
          {!live && <OfflineSummary task={task} />}
          {live && <CodeContextCard live={live} />}
          {live?.team && (
            <div className="animate-enter">
              <TeamDashboard task={task} live={live} />
            </div>
          )}
          {!live?.team && live?.pending?.kind === "plan" && (
            <PlanApproval taskId={task.id} live={live} />
          )}
          {!live?.team && live?.plan && live.pending?.kind !== "plan" && (
            <Card title="Plan" icon={<CircleDot className="size-4" />}>
              <Markdown text={live.plan} className="text-sm" />
            </Card>
          )}
          {live?.recall && live.recall.count > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Brain className="size-3.5 text-agent-foreground" aria-hidden />
              Using {live.recall.count} of {live.recall.total} project notes
            </p>
          )}
          {live?.skills && live.skills.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-agent-foreground" aria-hidden />
              Skills:
              {live.skills.map((s) => (
                <span
                  key={s.id}
                  title={s.reasons.join("; ")}
                  className="rounded-full border border-border px-2 py-px text-foreground"
                >
                  {s.name}
                </span>
              ))}
            </p>
          )}
          {live && live.todos.length > 0 && <Todos todos={live.todos} />}
          {!live?.team && live && live.timeline.length > 0 && (
            <Timeline taskId={task.id} items={live.timeline} />
          )}
          {live && <TaskBrowserPanel live={live} />}
          {live?.pending?.kind === "tool" && <ToolApproval taskId={task.id} live={live} />}
          {live?.done && <Result task={task} live={live} />}
        </div>
      </div>
    </div>
  );
}

export function Card({
  title,
  icon,
  children,
  tone,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: "attention";
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card",
        // Approval cards appear mid-run; let them enter rather than pop in.
        tone === "attention" ? "animate-enter border-warning/60" : "border-border",
      )}
      aria-label={title}
    >
      <h2 className="flex items-center gap-2 border-b border-border px-4 py-2.5 font-sans text-sm font-semibold">
        {icon} {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function OfflineSummary({ task }: { task: AgentTask }) {
  return (
    <Card title="Summary">
      {task.summary ? (
        <Markdown text={task.summary} className="text-sm" />
      ) : (
        <p className="text-sm text-muted-foreground">No summary was saved for this task.</p>
      )}
      {task.diff_stat && (
        <pre className="mt-3 font-mono text-xs text-muted-foreground">{task.diff_stat}</pre>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        The step-by-step log is kept in this Mac's trace files and isn't shown after a restart.
      </p>
    </Card>
  );
}

function PlanApproval({ taskId, live }: { taskId: string; live: LiveTask }) {
  const req = live.pending!;
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(req.plan ?? live.plan ?? "");
  const [feedback, setFeedback] = useState("");

  return (
    <Card
      title="Review the plan"
      icon={<CircleDot className="size-4 text-primary" />}
      tone="attention"
    >
      {editing ? (
        <>
          <label htmlFor="plan-edit" className="sr-only">
            Edit plan
          </label>
          <textarea
            id="plan-edit"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
          />
        </>
      ) : (
        <Markdown text={plan} className="text-sm" />
      )}
      <label htmlFor="plan-feedback" className="mt-4 block text-xs text-muted-foreground">
        Feedback for the agent (used if you ask for changes)
      </label>
      <input
        id="plan-feedback"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g. Don't touch the public API"
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() =>
            taskActions.approve(
              taskId,
              req.approvalId,
              "allow_once",
              editing ? { plan } : undefined,
            )
          }
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <Check className="size-4" /> {editing ? "Approve edited plan" : "Approve plan"}
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="min-h-10 rounded-md border border-input px-4 text-sm hover:bg-accent"
        >
          {editing ? "Preview" : "Edit plan"}
        </button>
        <button
          onClick={() =>
            taskActions.approve(taskId, req.approvalId, "deny", {
              reason: feedback || "Please revise the plan.",
            })
          }
          className="min-h-10 rounded-md px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Ask for changes
        </button>
      </div>
    </Card>
  );
}

export function ToolApproval({ taskId, live }: { taskId: string; live: LiveTask }) {
  const req = live.pending!;
  const m = req.mcp;
  const agent = req.agentId ? live.team?.agents.find((a) => a.agentId === req.agentId) : undefined;
  return (
    <Card
      title={m ? `Allow ${m.serverName} to run ${m.tool}?` : "Allow this action?"}
      icon={<ShieldAlert className="size-4 text-warning" />}
      tone="attention"
    >
      {(req.agentId || live.approvals.length > 1) && (
        <p className="mb-2 text-xs text-muted-foreground">
          {req.agentId && (
            <>
              Asked by the <span className="text-foreground">{agent?.role ?? "team"}</span> agent{" "}
              <code className="text-xs">{req.agentId}</code>.{" "}
            </>
          )}
          {live.approvals.length > 1 && `${live.approvals.length - 1} more waiting after this one.`}
        </p>
      )}
      {m ? (
        <div className="space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <McpBadge server={m.serverName} />
            {m.destructive ? (
              <span className="rounded-full border border-destructive/40 px-1.5 py-px text-xs text-destructive">
                destructive
              </span>
            ) : m.readOnly ? (
              <span className="rounded-full border border-success/40 px-1.5 py-px text-xs text-success">
                read-only (unverified)
              </span>
            ) : null}
          </p>
          <p>{m.access}</p>
          <p className="text-xs text-muted-foreground">
            MCP servers are third-party code. Check the arguments before allowing.
          </p>
        </div>
      ) : (
        <p className="text-sm">
          {req.reason}
          {req.noAlways && (
            <span className="block text-xs text-muted-foreground">
              This kind of action asks every time.
            </span>
          )}
        </p>
      )}
      <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-background/60 p-3 font-mono text-xs">
        {m ? m.tool : req.tool}: {formatInput(req.input)}
      </pre>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          autoFocus
          onClick={() => taskActions.approve(taskId, req.approvalId, "allow_once")}
          className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Allow once
        </button>
        {!m?.destructive && !req.noAlways && (
          <button
            onClick={() => taskActions.approve(taskId, req.approvalId, "always")}
            className="min-h-10 rounded-md border border-input px-4 text-sm hover:bg-accent"
          >
            {m ? "Always allow this tool in this project" : "Always allow in this project"}
          </button>
        )}
        <button
          onClick={() => taskActions.approve(taskId, req.approvalId, "deny")}
          className="min-h-10 rounded-md px-4 text-sm text-destructive hover:bg-destructive/10"
        >
          Deny
        </button>
      </div>
    </Card>
  );
}

function Todos({ todos }: { todos: LiveTask["todos"] }) {
  return (
    <Card title="Checklist">
      <ul className="space-y-1.5 text-sm">
        {todos.map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            {t.status === "completed" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : t.status === "in_progress" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-agent-foreground" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(t.status === "completed" && "text-muted-foreground line-through")}>
              {t.content}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Timeline({ items }: { taskId: string; items: TimelineItem[] }) {
  return (
    <ol className="space-y-2" aria-label="Agent steps">
      {items.map((item, i) => {
        if (item.kind === "text")
          return (
            <li key={i}>
              <Markdown text={item.text} className="text-sm" />
            </li>
          );
        if (item.kind === "tool") return <ToolStep key={i} item={item} />;
        if (item.kind === "approval")
          return (
            <li key={i} className="text-xs text-muted-foreground">
              {item.event.kind === "plan" ? "Plan" : item.event.tool} —{" "}
              {item.decision
                ? (
                    { allow_once: "approved", always: "always allowed", deny: "denied" } as Record<
                      string,
                      string
                    >
                  )[item.decision]
                : "waiting for you"}
            </li>
          );
        if (item.kind === "verify")
          return (
            <li key={i} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {item.event.status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-agent-foreground" />
                ) : item.event.status === "passed" ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : (
                  <XCircle className="size-4 text-destructive" />
                )}
                <span>Verify</span>
                <code className="truncate font-mono text-xs text-muted-foreground">
                  {item.event.command}
                </code>
              </div>
              {item.event.output && item.event.status === "failed" && (
                <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs text-muted-foreground">
                  {item.event.output}
                </pre>
              )}
            </li>
          );
        return (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /> {item.message}
          </li>
        );
      })}
    </ol>
  );
}

function ToolStep({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const Icon = item.tool === "run_command" ? Terminal : Wrench;
  return (
    <li className="rounded-lg border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")}
        />
        <Icon className="size-4 shrink-0 text-agent-foreground" />
        {item.mcp && <McpBadge server={item.mcp.serverName} />}
        <span className="font-mono text-xs">{item.mcp ? item.mcp.tool : item.tool}</span>
        <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
          {summarize(item.input)}
        </span>
        {!item.result ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : item.result.ok ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <XCircle className="size-3.5 text-destructive" />
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <pre className="max-h-40 overflow-auto font-mono text-xs text-muted-foreground">
            {formatInput(item.input)}
          </pre>
          {item.result && (
            <pre className="max-h-64 overflow-auto font-mono text-xs">{item.result.output}</pre>
          )}
        </div>
      )}
    </li>
  );
}

function Result({ task, live }: { task: AgentTask; live: LiveTask }) {
  const done = live.done!;
  const merged = live.worktree?.action === "merged";
  const discarded = live.worktree?.action === "discarded";
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    if (done.status === "done" && live.worktree && !live.diff && !merged && !discarded) {
      setLoadingDiff(true);
      void taskActions.diff(task.id);
    }
  }, [done.status, live.worktree, live.diff, merged, discarded, task.id]);

  useEffect(() => {
    if (live.diff) setLoadingDiff(false);
  }, [live.diff]);

  return (
    <>
      <Card
        title={
          done.status === "done" ? "Finished" : done.status === "blocked" ? "Blocked" : "Stopped"
        }
        icon={
          done.status === "done" ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : (
            <AlertTriangle className="size-4 text-destructive" />
          )
        }
      >
        <Markdown text={done.summary || "No summary."} className="text-sm" />
        {done.reason && <p className="mt-2 text-sm text-muted-foreground">{done.reason}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          {done.steps != null && `${done.steps} steps`}
          {done.usage && ` · ${done.usage.totalTokens.toLocaleString()} tokens`}
          {live.worktree?.branch && ` · branch ${live.worktree.branch}`}
        </p>
      </Card>

      {live.worktree && !discarded && (
        <Card title="Changes">
          {merged ? (
            <p className="text-sm">Merged into your project.</p>
          ) : loadingDiff ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading the diff…
            </p>
          ) : live.diff ? (
            <>
              {live.diff.stat && (
                <pre className="mb-3 font-mono text-xs text-muted-foreground">{live.diff.stat}</pre>
              )}
              <DiffView diff={live.diff.diff} />
            </>
          ) : null}
          {!merged && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  taskActions
                    .merge(task.id)
                    .catch((e) => toast.error("Merge failed", { description: String(e) }))
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <GitMerge className="size-4" /> Merge into project
              </button>
              {live.worktree.path && (
                <button
                  onClick={() => revealItemInDir(live.worktree!.path!)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-input px-4 text-sm hover:bg-accent"
                >
                  <FolderOpen className="size-4" /> Show in Finder
                </button>
              )}
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard these changes? The task's worktree and branch are deleted.",
                    )
                  )
                    void taskActions.discard(task.id);
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Discard
              </button>
            </div>
          )}
        </Card>
      )}

      {live.proposals?.length ? <SuggestedMemories task={task} items={live.proposals} /> : null}
    </>
  );
}

const CATEGORY_LABEL = Object.fromEntries(MEMORY_CATEGORIES.map((c) => [c.id, c.title])) as Record<
  string,
  string
>;

/**
 * What the agent learned. "Ask" mode: checkboxes, nothing saved until Save. "Automatic" mode:
 * notes arrive already saved as inferred, each with an Undo.
 */
function SuggestedMemories({
  task,
  items,
}: {
  task: AgentTask;
  items: NonNullable<LiveTask["proposals"]>;
}) {
  const pending = items.filter((i) => !i.autoSaved);
  const auto = items.filter((i) => i.autoSaved);
  const [checked, setChecked] = useState(() => pending.map(() => true));
  const [state, setState] = useState<"open" | "saving" | "saved" | "dismissed">(
    pending.length ? "open" : "saved",
  );
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const root = projectPath(task.project_id);
  const qc = useQueryClient();

  if (state === "dismissed" && !auto.length) return null;
  const save = async () => {
    if (!root) return toast.error("Pick this project's folder again to save memories.");
    setState("saving");
    try {
      const snap = await memory.update(root, {
        op: "accept",
        items: pending
          .filter((_, i) => checked[i])
          .map(({ category, text, replaces }) => ({ category, text, replaces, taskId: task.id })),
      });
      qc.setQueryData(["memory", root], snap);
      setState("saved");
      toast.success("Saved to project memory", {
        description: `${snap.saved ?? 0} saved · ${snap.entries.filter((e) => !e.supersededBy).length} notes for this project`,
      });
    } catch (e) {
      setState("open");
      toast.error("Couldn't save memories", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const undo = async (id: string) => {
    if (!root) return;
    try {
      const snap = await memory.update(root, { op: "delete", entryId: id });
      qc.setQueryData(["memory", root], snap);
      setUndone((u) => new Set(u).add(id));
    } catch (e) {
      toast.error("Couldn't undo", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Card title="Project memory" icon={<Brain className="size-4 text-agent-foreground" />}>
      {auto.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Added automatically as inferred notes (verify them in the project's Memory view):
          </p>
          <ul className="space-y-1">
            {auto.map((it) => (
              <li
                key={it.id}
                className="flex min-h-9 items-start justify-between gap-3 rounded-md px-2 py-1.5"
              >
                <span
                  className={cn(
                    "text-sm",
                    undone.has(it.id) && "text-muted-foreground line-through",
                  )}
                >
                  <span className="text-xs text-muted-foreground">
                    {CATEGORY_LABEL[it.category] ?? it.category} ·{" "}
                  </span>
                  {it.text}
                </span>
                {!undone.has(it.id) && (
                  <button
                    onClick={() => void undo(it.id)}
                    className="shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pending.length > 0 &&
        (state === "saved" ? (
          <p className="text-sm">Saved. Vard will use these notes in this project's next tasks.</p>
        ) : state === "dismissed" ? null : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Remember these for next time? Uncheck anything that's wrong.
            </p>
            <ul className="space-y-2">
              {pending.map((it, i) => (
                <li key={it.id}>
                  <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={checked[i]}
                      onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))}
                      className="mt-1 size-4 accent-[var(--primary)]"
                    />
                    <span className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABEL[it.category] ?? it.category} ·{" "}
                      </span>
                      {it.text}
                      {it.replacesText && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          updates: <s>{it.replacesText}</s>
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void save()}
                disabled={state === "saving" || !checked.some(Boolean)}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {state === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}{" "}
                Save selected
              </button>
              <button
                onClick={() => setState("dismissed")}
                className="min-h-10 rounded-md px-4 text-sm hover:bg-accent"
              >
                Dismiss
              </button>
            </div>
          </>
        ))}
    </Card>
  );
}

function McpBadge({ server }: { server: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-agent/50 px-1.5 py-px text-[11px] text-agent-foreground"
      title="Tool from an MCP server"
    >
      <Plug className="size-3" aria-hidden /> {server}
    </span>
  );
}

function formatInput(input: unknown) {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function summarize(input: unknown) {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    return String(o.command ?? o.path ?? o.pattern ?? o.query ?? "");
  }
  return "";
}
