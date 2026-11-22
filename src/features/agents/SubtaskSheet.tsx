/** One subtask: what it is, where it stands, its result, and retry / cancel. */
import { useState } from "react";
import { RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Markdown } from "@/features/chat/Markdown";
import { taskActions, type SubtaskState, type TeamState } from "@/features/agent/store";
import { Pill } from "./Pill";
import { ROLE_LABEL, SUBTASK_LABEL, subtaskTone } from "./team-utils";

export function SubtaskSheet({
  taskId,
  team,
  subtask: s,
  onClose,
  onAgent,
}: {
  taskId: string;
  team: TeamState;
  subtask: SubtaskState | null;
  onClose: () => void;
  onAgent: (agentId: string) => void;
}) {
  const [note, setNote] = useState("");
  if (!s) return null;
  const canRetry = ["failed", "needs_attention", "cancelled", "blocked", "skipped"].includes(
    s.status,
  );
  const canCancel = ["running", "pending", "blocked"].includes(s.status);
  const finished = ["done", "failed", "cancelled"].includes(team.phase);
  const run = async (fn: () => Promise<unknown>, what: string) => {
    try {
      await fn();
      setNote("");
    } catch (e) {
      toast.error(what, { description: e instanceof Error ? e.message : String(e) });
    }
  };
  const integ = team.integrations.filter((r) => r.subtaskId === s.id);

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-6">{s.title}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="muted">{ROLE_LABEL[s.role]}</Pill>
              <Pill
                tone={subtaskTone(s.status)}
                spin={s.status === "running" || s.status === "integrating"}
              >
                {SUBTASK_LABEL[s.status]}
              </Pill>
              <code className="text-xs">{s.id}</code>
              {s.attempts > 1 && <span className="text-xs">attempt {s.attempts}</span>}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 text-sm">
          {s.question && (
            <div role="alert" className="rounded-md border border-warning/50 bg-warning/5 p-3">
              <p className="font-medium">The agent needs your input</p>
              <p className="mt-1">{s.question}</p>
            </div>
          )}
          {s.error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
              {s.error}
            </p>
          )}
          {s.blockedBy?.length ? (
            <p className="text-muted-foreground">
              Blocked because {s.blockedBy.join(", ")} didn't finish.
            </p>
          ) : null}
          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Assignment
            </h3>
            <p className="whitespace-pre-wrap">{s.description}</p>
            {s.acceptance && (
              <p className="mt-2 text-muted-foreground">Done when: {s.acceptance}</p>
            )}
          </section>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
            {s.dependsOn.length > 0 && (
              <>
                <dt className="text-muted-foreground">After</dt>
                <dd>{s.dependsOn.join(", ")}</dd>
              </>
            )}
            {s.implicitDeps.length > 0 && (
              <>
                <dt className="text-muted-foreground">Shares files with</dt>
                <dd>{s.implicitDeps.join(", ")} (runs after them)</dd>
              </>
            )}
            {s.files.length > 0 && (
              <>
                <dt className="text-muted-foreground">Expected files</dt>
                <dd className="font-mono text-xs break-all">{s.files.join(", ")}</dd>
              </>
            )}
            {s.fixOf && (
              <>
                <dt className="text-muted-foreground">Fixes</dt>
                <dd>review findings in {s.fixOf}</dd>
              </>
            )}
            {s.agentId && (
              <>
                <dt className="text-muted-foreground">Agent</dt>
                <dd>
                  <button
                    onClick={() => onAgent(s.agentId!)}
                    className="text-agent-foreground underline-offset-2 hover:underline"
                  >
                    {s.agentId}
                  </button>
                </dd>
              </>
            )}
          </dl>
          {s.result && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Result
              </h3>
              <Markdown text={s.result.summary} className="text-sm" />
              {s.result.stat && (
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 text-xs">
                  {s.result.stat}
                </pre>
              )}
            </section>
          )}
          {integ.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Integration
              </h3>
              <ul className="space-y-1 text-xs">
                {integ.map((r, i) => (
                  <li key={i}>
                    {r.status === "merged"
                      ? "Merged"
                      : r.status === "empty"
                        ? "No changes to merge"
                        : "Conflict"}
                    {r.files.length > 0 && `: ${r.files.join(", ")}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!finished && (canRetry || canCancel) && (
            <section className="space-y-2 border-t border-border pt-4">
              {canRetry && (
                <>
                  <label htmlFor="retry-note" className="block text-xs text-muted-foreground">
                    {s.question
                      ? "Your answer for the agent"
                      : "Note for the next attempt (optional)"}
                  </label>
                  <textarea
                    id="retry-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2 text-sm"
                  />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {canRetry && (
                  <button
                    onClick={() =>
                      void run(
                        () => taskActions.control(taskId, "retry_subtask", s.id, note || undefined),
                        "Couldn't retry",
                      )
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                  >
                    <RotateCcw className="size-4" /> Retry
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() =>
                      void run(
                        () => taskActions.control(taskId, "cancel_subtask", s.id),
                        "Couldn't cancel",
                      )
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
                  >
                    <Square className="size-3.5" /> Cancel this subtask
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
