/**
 * Skills: reusable instructions the agent picks per task. Built-in skills ship with Vard,
 * global ones live in ~/.vard/skills, and a project can add its own in .vard/skills (which must
 * be trusted before they are used).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Download, Plus, Search, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { isTauri, skills, type SkillSummary } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { projectPath, projectsQuery } from "@/features/agent/projects";
import { SkillState, SOURCE_LABEL } from "./SkillBadges";
import { SkillDetails } from "./SkillDetails";
import { NEW_SKILL_TEMPLATE, SkillEditor } from "./SkillEditor";

type Filter = "all" | SkillSummary["source"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "global", label: "Global" },
  { id: "project", label: "Project" },
];

export function SkillsPage() {
  const qc = useQueryClient();
  const projects = useQuery(projectsQuery());
  const [projectId, setProjectId] = useState("");
  const projectRoot = projectId ? projectPath(projectId) : undefined;
  const key = ["skills", projectRoot ?? "global"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => skills.list(projectRoot),
    enabled: isTauri(),
    retry: false,
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const all = useMemo(() => q.data?.skills ?? [], [q.data]);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter(
      (k) =>
        (filter === "all" || k.source === filter) &&
        (!s ||
          [k.name, k.description, ...k.tags, ...k.roles].some((x) => x.toLowerCase().includes(s))),
    );
  }, [all, filter, search]);
  const recent = useMemo(
    () =>
      all
        .filter((k) => k.usage.lastUsedAt)
        .sort((a, b) => (b.usage.lastUsedAt ?? 0) - (a.usage.lastUsedAt ?? 0))
        .slice(0, 5),
    [all],
  );
  const current = all.find((k) => k.id === selected) ?? shown[0];
  const needsTrust = !!projectRoot && q.data?.trusted === false;

  const importSkill = async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a skill folder (with SKILL.md)",
    });
    if (typeof picked !== "string") return;
    try {
      const r = await skills.update(
        { op: "import", scope: projectRoot ? "project" : "global", from: picked },
        projectRoot,
      );
      toast.success(`Imported ${r.changed}`, {
        description: "It starts turned off. Review it, then turn it on.",
      });
      setSelected(r.changed ?? null);
      refresh();
    } catch (e) {
      toast.error("Import failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!isTauri())
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Skills are managed by the agent in the Vard AI desktop app.
      </p>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <PageHeader
          icon={Sparkles}
          title="Skills"
          description="Reusable instructions that teach the agent how to do a kind of task. Vard picks the relevant ones for each task and shows which it used. Skills are guidance only: they never skip approvals."
          actions={
            <>
              <label className="text-sm">
                <span className="sr-only">Show skills for</span>
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    setSelected(null);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Global and built-in</option>
                  {projects.data
                    ?.filter((p) => projectPath(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        Project: {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                onClick={() => void importSkill()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
              >
                <Download className="size-4" /> Import
              </button>
              <button
                onClick={() => setCreating(true)}
                className="press inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Plus className="size-4" /> New skill
              </button>
            </>
          }
        />

        {needsTrust && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/50 bg-primary/5 p-4"
          >
            <p className="flex items-start gap-2 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                This project's <code>.vard/skills</code> folder has skills the agent won't use until
                you trust them. Review them below first: their text goes into the agent's context.
              </span>
            </p>
            <button
              onClick={async () => {
                try {
                  await skills.update({ op: "trust", trusted: true }, projectRoot);
                  refresh();
                } catch (e) {
                  toast.error("Couldn't trust the skills", {
                    description: e instanceof Error ? e.message : String(e),
                  });
                }
              }}
              className="press min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Trust these skills
            </button>
          </div>
        )}

        {recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Recently used:</span>
            {recent.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelected(k.id)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-accent"
              >
                {k.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filter by source"
            className="inline-flex rounded-md border border-border p-0.5"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  filter === f.id
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="ml-1 text-xs text-muted-foreground">
                  {f.id === "all" ? all.length : all.filter((k) => k.source === f.id).length}
                </span>
              </button>
            ))}
          </div>
          <label className="relative flex-1 sm:max-w-xs">
            <span className="sr-only">Search skills</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, tag or role"
              className="h-9 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        {q.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : q.error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {String(q.error)}
          </p>
        ) : !shown.length ? (
          <EmptyState
            size="lg"
            seed={31}
            title={search || filter !== "all" ? "No skills match" : "No skills"}
            text={
              filter === "project" && !projectRoot
                ? "Choose a project above to see its skills."
                : "Create a skill for how your team works, or import one from a folder."
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            {/* Keyed by the filter and search so a new result set cascades in again. */}
            <ul key={`${filter}:${projectId}`} className="stagger space-y-2" aria-label="Skills">
              {shown.map((k) => (
                <li key={k.id}>
                  <button
                    onClick={() => setSelected(k.id)}
                    aria-current={current?.id === k.id}
                    className={cn(
                      "lift w-full rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      current?.id === k.id
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{k.name}</span>
                      <SkillState skill={k} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {k.description || k.errors[0]}
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {SOURCE_LABEL[k.source]}
                      {k.usage.count > 0 && ` · used ${k.usage.count}×`}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {current && (
              <SkillDetails
                key={current.id}
                skill={current}
                projectRoot={projectRoot}
                onChanged={refresh}
              />
            )}
          </div>
        )}
      </div>
      {creating && (
        <SkillEditor
          open={creating}
          onOpenChange={setCreating}
          initial={NEW_SKILL_TEMPLATE}
          projectRoot={projectRoot}
          onSaved={(id) => {
            setSelected(id ?? null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
