import { useEffect, useState } from "react";
import {
  AlertTriangle,
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
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Markdown } from "@/features/chat/Markdown";
import { DiffView } from "./DiffView";
import { isRunning, taskActions, useTask, type LiveTask, type TimelineItem } from "./store";
import type { AgentTask } from "./projects";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<string, string> = {
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
  const tone =
    status === "done" || status === "merged"
      ? "border-diff-add/50 text-diff-add"
      : status === "blocked"
        ? "border-destructive/50 text-destructive"
        : status === "awaiting_plan_approval"
          ? "border-primary/60 text-primary"
          : status === "cancelled" || status === "discarded"
            ? "border-border text-muted-foreground"
            : "border-agent/60 text-agent-foreground";
  const live = ["planning", "acting", "observing", "verifying"].includes(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", tone)}>
      {live && <Loader2 className="size-3 animate-spin" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TaskView({ task }: { task: AgentTask }) {
  const live = useTask(task.id);
  const status = live?.done?.status ?? live?.state ?? task.status;
  const running = isRunning(live);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={live?.worktree?.action === "merged" ? "merged" : status} />
            {task.model && <span className="truncate text-xs text-muted-foreground">{task.model}</span>}
          </div>
          <h1 className="mt-2 line-clamp-2 font-sans text-base font-medium">{task.prompt}</h1>
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
          {live?.pending?.kind === "plan" && <PlanApproval taskId={task.id} live={live} />}
          {live?.plan && live.pending?.kind !== "plan" && (
            <Card title="Plan" icon={<CircleDot className="size-4" />}>
              <Markdown text={live.plan} className="text-sm" />
            </Card>
          )}
          {live && live.todos.length > 0 && <Todos todos={live.todos} />}
          {live && live.timeline.length > 0 && <Timeline taskId={task.id} items={live.timeline} />}
          {live?.pending?.kind === "tool" && <ToolApproval taskId={task.id} live={live} />}
          {live?.done && <Result task={task} live={live} />}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children, tone }: { title: string; icon?: React.ReactNode; children: React.ReactNode; tone?: "attention" }) {
  return (
    <section
      className={cn("rounded-xl border bg-card", tone === "attention" ? "border-primary/60" : "border-border")}
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
      {task.summary ? <Markdown text={task.summary} className="text-sm" /> : <p className="text-sm text-muted-foreground">No summary was saved for this task.</p>}
      {task.diff_stat && <pre className="mt-3 font-mono text-xs text-muted-foreground">{task.diff_stat}</pre>}
      <p className="mt-3 text-xs text-muted-foreground">The step-by-step log is kept in this Mac's trace files and isn't shown after a restart.</p>
    </Card>
  );
}

function PlanApproval({ taskId, live }: { taskId: string; live: LiveTask }) {
  const req = live.pending!;
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(req.plan ?? live.plan ?? "");
  const [feedback, setFeedback] = useState("");

  return (
    <Card title="Review the plan" icon={<CircleDot className="size-4 text-primary" />} tone="attention">
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
            className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus:border-primary"
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
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => taskActions.approve(taskId, req.approvalId, "allow_once", editing ? { plan } : undefined)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <Check className="size-4" /> {editing ? "Approve edited plan" : "Approve plan"}
        </button>
        <button onClick={() => setEditing((v) => !v)} className="min-h-10 rounded-md border border-input px-4 text-sm hover:bg-accent">
          {editing ? "Preview" : "Edit plan"}
        </button>
        <button
          onClick={() => taskActions.approve(taskId, req.approvalId, "deny", { reason: feedback || "Please revise the plan." })}
          className="min-h-10 rounded-md px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Ask for changes
        </button>
      </div>
    </Card>
  );
}

function ToolApproval({ taskId, live }: { taskId: string; live: LiveTask }) {
  const req = live.pending!;
  return (
    <Card title="Allow this action?" icon={<ShieldAlert className="size-4 text-primary" />} tone="attention">
      <p className="text-sm">{req.reason}</p>
      <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-background/60 p-3 font-mono text-xs">
        {req.tool}: {formatInput(req.input)}
      </pre>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          autoFocus
          onClick={() => taskActions.approve(taskId, req.approvalId, "allow_once")}
          className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Allow once
        </button>
        <button
          onClick={() => taskActions.approve(taskId, req.approvalId, "always")}
          className="min-h-10 rounded-md border border-input px-4 text-sm hover:bg-accent"
        >
          Always allow in this project
        </button>
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
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-diff-add" />
            ) : t.status === "in_progress" ? (
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-agent-foreground" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={cn(t.status === "completed" && "text-muted-foreground line-through")}>{t.content}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Timeline({ items }: { taskId: string; items: TimelineItem[] }) {
  return (
    <ol className="space-y-2" aria-label="Agent steps">
      {items.map((item, i) => {
        if (item.kind === "text") return <li key={i}><Markdown text={item.text} className="text-sm" /></li>;
        if (item.kind === "tool") return <ToolStep key={i} item={item} />;
        if (item.kind === "approval")
          return (
            <li key={i} className="text-xs text-muted-foreground">
              {item.event.kind === "plan" ? "Plan" : item.event.tool} —{" "}
              {item.decision ? ({ allow_once: "approved", always: "always allowed", deny: "denied" } as Record<string, string>)[item.decision] : "waiting for you"}
            </li>
          );
        if (item.kind === "verify")
          return (
            <li key={i} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {item.event.status === "running" ? (
                  <Loader2 className="size-4 animate-spin text-agent-foreground" />
                ) : item.event.status === "passed" ? (
                  <CheckCircle2 className="size-4 text-diff-add" />
                ) : (
                  <XCircle className="size-4 text-destructive" />
                )}
                <span>Verify</span>
                <code className="truncate font-mono text-xs text-muted-foreground">{item.event.command}</code>
              </div>
              {item.event.output && item.event.status === "failed" && (
                <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs text-muted-foreground">{item.event.output}</pre>
              )}
            </li>
          );
        return (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
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
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
        <Icon className="size-4 shrink-0 text-agent-foreground" />
        <span className="font-mono text-xs">{item.tool}</span>
        <span className="flex-1 truncate font-mono text-xs text-muted-foreground">{summarize(item.input)}</span>
        {!item.result ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : item.result.ok ? (
          <Check className="size-3.5 text-diff-add" />
        ) : (
          <XCircle className="size-3.5 text-destructive" />
        )}
      </button>
      {open && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          <pre className="max-h-40 overflow-auto font-mono text-xs text-muted-foreground">{formatInput(item.input)}</pre>
          {item.result && <pre className="max-h-64 overflow-auto font-mono text-xs">{item.result.output}</pre>}
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
        title={done.status === "done" ? "Finished" : done.status === "blocked" ? "Blocked" : "Stopped"}
        icon={done.status === "done" ? <CheckCircle2 className="size-4 text-diff-add" /> : <AlertTriangle className="size-4 text-destructive" />}
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
              {live.diff.stat && <pre className="mb-3 font-mono text-xs text-muted-foreground">{live.diff.stat}</pre>}
              <DiffView diff={live.diff.diff} />
            </>
          ) : null}
          {!merged && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => taskActions.merge(task.id).catch((e) => toast.error("Merge failed", { description: String(e) }))}
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
                  if (window.confirm("Discard these changes? The task's worktree and branch are deleted.")) void taskActions.discard(task.id);
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Discard
              </button>
            </div>
          )}
        </Card>
      )}
    </>
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
