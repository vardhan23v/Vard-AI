/** One skill: Instructions · What the agent sees · Resources · Usage. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Loader2, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/features/chat/Markdown";
import { skills, type SkillSummary } from "@/lib/agent-client";
import { SkillState, SourceBadge } from "./SkillBadges";
import { SkillEditor } from "./SkillEditor";

const HOW: Record<string, string> = {
  auto: "picked automatically",
  explicit: "chosen by you",
  resource: "read a resource",
  script: "ran a script",
};

export function SkillDetails({
  skill,
  projectRoot,
  onChanged,
}: {
  skill: SkillSummary;
  projectRoot?: string;
  onChanged: () => void;
}) {
  const detail = useQuery({
    queryKey: ["skill", skill.id, projectRoot ?? "", skill.chars, skill.enabled],
    queryFn: () => skills.get(skill.id, projectRoot),
    retry: false,
  });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(label, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const meta: [string, string[]][] = [
    ["Tags", skill.tags],
    ["Triggers", skill.triggers],
    ["Roles", skill.roles],
    ["File patterns", skill.globs],
    ["Conflicts with", skill.conflicts],
  ];
  const resources = [
    ...skill.resources.references,
    ...skill.resources.scripts,
    ...skill.resources.assets,
  ];

  return (
    <section
      aria-label={`Skill ${skill.name}`}
      className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg">
            {skill.name}
            <span className="text-xs text-muted-foreground">v{skill.version || "?"}</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {skill.description || "No description"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SourceBadge source={skill.source} />
            <SkillState skill={skill} />
            <span className="text-xs text-muted-foreground">
              ~{Math.ceil(skill.chars / 4).toLocaleString()} tokens · used {skill.usage.count}×
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={skill.enabled}
              disabled={busy}
              onCheckedChange={(v) =>
                void act("Couldn't update the skill", () =>
                  skills.update({ op: "enable", id: skill.id, enabled: v }, projectRoot),
                )
              }
              aria-label={`${skill.enabled ? "Disable" : "Enable"} ${skill.name}`}
            />
            {skill.enabled ? "On" : "Off"}
          </label>
          {skill.source !== "builtin" && (
            <>
              <button
                onClick={() => setEditing(true)}
                disabled={!detail.data}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
              >
                <Pencil className="size-4" /> Edit
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    aria-label={`Delete ${skill.name}`}
                    className="inline-flex min-h-9 items-center rounded-md border border-input px-2.5 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {skill.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the folder {skill.path} and everything in it. It can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        void act("Couldn't delete the skill", () =>
                          skills.update({ op: "delete", id: skill.id }, projectRoot),
                        )
                      }
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </header>

      {(skill.errors.length > 0 || skill.shadowedBy) && (
        <div
          role="alert"
          className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          {skill.shadowedBy && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Not used: {skill.shadowedBy} has
              the same name and takes precedence. Rename this skill to use it.
            </p>
          )}
          {skill.errors.map((e) => (
            <p key={e} className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}
      {skill.warnings.map((w) => (
        <p key={w} className="text-xs text-muted-foreground">
          ! {w}
        </p>
      ))}

      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
        {meta
          .filter(([, v]) => v.length)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="flex flex-wrap gap-1">
                {v.map((x) => (
                  <code key={x} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {x}
                  </code>
                ))}
              </dd>
            </div>
          ))}
        {skill.path && (
          <div className="contents">
            <dt className="text-muted-foreground">Folder</dt>
            <dd className="truncate font-mono text-xs" title={skill.path}>
              {skill.path}
            </dd>
          </div>
        )}
      </dl>

      <Tabs defaultValue="instructions">
        <TabsList>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="preview">What the agent sees</TabsTrigger>
          <TabsTrigger value="resources">
            Resources ({resources.length + skill.scripts.length})
          </TabsTrigger>
          <TabsTrigger value="usage">Usage ({skill.usage.count})</TabsTrigger>
        </TabsList>
        {detail.isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </p>
        ) : detail.error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {String(detail.error)}
          </p>
        ) : detail.data ? (
          <>
            <TabsContent value="instructions" className="pt-3">
              {detail.data.body ? (
                <Markdown text={detail.data.body} />
              ) : (
                <p className="text-sm text-muted-foreground">No instructions.</p>
              )}
            </TabsContent>
            <TabsContent value="preview" className="space-y-2 pt-3">
              <p className="text-xs text-muted-foreground">
                When this skill is chosen for a task, this block is added to the agent's context (~
                {detail.data.preview.tokens.toLocaleString()} tokens), wrapped as untrusted
                guidance.
              </p>
              <pre className="max-h-[28rem] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                {detail.data.preview.text || "This skill is invalid, so it is never sent."}
              </pre>
            </TabsContent>
            <TabsContent value="resources" className="space-y-3 pt-3 text-sm">
              {skill.scripts.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">Scripts</h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    The agent can ask to run these. Every run needs your approval; "always" is never
                    offered.
                  </p>
                  <ul className="space-y-1">
                    {skill.scripts.map((s) => (
                      <li key={s.name} className="flex items-start gap-2">
                        <Play className="mt-0.5 size-3.5 shrink-0 text-agent-foreground" />
                        <span>
                          <code className="text-xs">{s.name}</code>{" "}
                          <span className="text-muted-foreground">({s.file})</span>
                          {s.description && (
                            <span className="block text-xs text-muted-foreground">
                              {s.description}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {resources.length ? (
                <div>
                  <h3 className="mb-1 font-medium">Files</h3>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Read only when the agent asks for one.
                  </p>
                  <ul className="space-y-1">
                    {resources.map((r) => (
                      <li key={r} className="flex items-center gap-2 font-mono text-xs">
                        <FileText className="size-3.5 text-muted-foreground" /> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                !skill.scripts.length && (
                  <p className="text-muted-foreground">This skill has no resources.</p>
                )
              )}
            </TabsContent>
            <TabsContent value="usage" className="pt-3">
              {detail.data.usage.length ? (
                <ul className="divide-y divide-border text-sm">
                  {detail.data.usage.map((u, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        Task <code className="text-xs">{u.taskId}</code>
                        {u.role && <span className="text-muted-foreground"> · {u.role} agent</span>}
                        <span className="text-muted-foreground"> · {HOW[u.how] ?? u.how}</span>
                      </span>
                      <time
                        className="text-xs text-muted-foreground"
                        dateTime={new Date(u.at).toISOString()}
                      >
                        {new Date(u.at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Not used yet.</p>
              )}
            </TabsContent>
          </>
        ) : null}
      </Tabs>

      {editing && detail.data && skill.source !== "builtin" && (
        <SkillEditor
          open={editing}
          onOpenChange={setEditing}
          initial={detail.data.text}
          scope={skill.source}
          name={skill.name}
          projectRoot={projectRoot}
          onSaved={() => {
            onChanged();
            void detail.refetch();
          }}
        />
      )}
    </section>
  );
}
