/** Approve, edit or reject the planner's task graph before any agent starts. */
import { useState } from "react";
import { Check, CircleDot, Trash2 } from "lucide-react";

import { Card } from "@/features/agent/TaskView";
import { taskActions, type LiveTask } from "@/features/agent/store";
import { ROLE_LABEL } from "./team-utils";

type Graph = NonNullable<NonNullable<LiveTask["pending"]>["graph"]>;
const WORKERS = ["frontend", "backend", "database", "testing", "browser", "analyst"] as const;

export function TeamPlanApproval({ taskId, live }: { taskId: string; live: LiveTask }) {
  const req = live.pending!;
  const original = req.graph!;
  const [graph, setGraph] = useState<Graph>(original);
  const [feedback, setFeedback] = useState("");
  const edited = JSON.stringify(graph) !== JSON.stringify(original);

  const update = (i: number, patch: Partial<Graph["tasks"][number]>) =>
    setGraph((g) => ({ ...g, tasks: g.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const remove = (i: number) =>
    setGraph((g) => {
      const id = g.tasks[i].id;
      return {
        ...g,
        tasks: g.tasks
          .filter((_, j) => j !== i)
          .map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => d !== id) })),
      };
    });

  return (
    <Card
      title="Review the team plan"
      icon={<CircleDot className="size-4 text-primary" />}
      tone="attention"
    >
      {graph.summary && <p className="mb-3 text-sm">{graph.summary}</p>}
      <ol className="space-y-3">
        {graph.tasks.map((t, i) => (
          <li key={t.id} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`st-title-${t.id}`}>
                  Title
                </label>
                <input
                  id={`st-title-${t.id}`}
                  value={t.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="w-full rounded border border-transparent bg-transparent px-1 text-sm font-medium outline-none hover:border-input focus:border-primary"
                />
                <p className="px-1 text-xs text-muted-foreground">
                  <code>{t.id}</code>
                  {t.dependsOn.length > 0 && <> · after {t.dependsOn.join(", ")}</>}
                  {t.files.length > 0 && (
                    <>
                      {" "}
                      · {t.files.slice(0, 4).join(", ")}
                      {t.files.length > 4 ? "…" : ""}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`st-role-${t.id}`}>
                  Role
                </label>
                <select
                  id={`st-role-${t.id}`}
                  value={t.role}
                  onChange={(e) =>
                    update(i, { role: e.target.value as Graph["tasks"][number]["role"] })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
                >
                  {WORKERS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => remove(i)}
                  disabled={graph.tasks.length === 1}
                  aria-label={`Remove ${t.title}`}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
            <label className="sr-only" htmlFor={`st-desc-${t.id}`}>
              Instructions
            </label>
            <textarea
              id={`st-desc-${t.id}`}
              value={t.description}
              onChange={(e) => update(i, { description: e.target.value })}
              rows={2}
              className="mt-2 w-full resize-y rounded-md border border-input bg-background p-2 text-xs outline-none focus:border-primary"
            />
          </li>
        ))}
      </ol>
      <label htmlFor="team-feedback" className="mt-4 block text-xs text-muted-foreground">
        Feedback for the planner (used if you ask for a new plan)
      </label>
      <input
        id="team-feedback"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g. Keep the API and UI in one subtask"
        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() =>
            taskActions.approve(
              taskId,
              req.approvalId,
              "allow_once",
              edited ? { graph } : undefined,
            )
          }
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          <Check className="size-4" />{" "}
          {edited
            ? "Start with my changes"
            : `Start ${graph.tasks.length} agent task${graph.tasks.length > 1 ? "s" : ""}`}
        </button>
        {edited && (
          <button
            onClick={() => setGraph(original)}
            className="min-h-10 rounded-md border border-input px-4 text-sm hover:bg-accent"
          >
            Undo changes
          </button>
        )}
        <button
          onClick={() =>
            taskActions.approve(taskId, req.approvalId, "deny", {
              reason: feedback || "Please revise the plan.",
            })
          }
          className="min-h-10 rounded-md px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Ask for a new plan
        </button>
      </div>
    </Card>
  );
}
