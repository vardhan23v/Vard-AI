/**
 * Project memory: what Vard knows about this project (<project>/.vard/memory.json, read and
 * written by the local agent). View, search, edit, verify, delete, re-analyze and settings.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Check,
  ChevronRight,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
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
import { EmptyState } from "@/components/EmptyState";
import { Pill } from "@/components/Pill";
import { useListEntrance } from "@/lib/motion-hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/PageHeader";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MEMORY_CATEGORIES,
  memory,
  type MemoryCategory,
  type MemoryChange,
  type MemoryEntry,
  type MemorySettings,
  type MemorySnapshot,
} from "@/lib/agent-client";
import { cn } from "@/lib/utils";

function ago(iso?: string) {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const SOURCE_LABEL: Record<MemoryEntry["source"], string> = {
  scan: "project analysis",
  user: "you",
  task: "a task",
};

export function MemoryTab({ path }: { path: string }) {
  const qc = useQueryClient();
  const key = ["memory", path];
  const q = useQuery({ queryKey: key, queryFn: () => memory.get(path), retry: false });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MemoryCategory | "all">("all");
  const [status, setStatus] = useState<"all" | "verified" | "inferred">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const change = async (c: MemoryChange, done?: string) => {
    setBusy(c.op);
    try {
      const snap = await memory.update(path, c);
      qc.setQueryData(key, snap);
      if (snap.duplicates?.length)
        toast.message("Already in memory", { description: snap.duplicates[0] });
      else if (done) toast.success(done);
      return snap;
    } catch (e) {
      toast.error("Memory", { description: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const data = q.data;
  const live = useMemo(() => data?.entries.filter((e) => !e.supersededBy) ?? [], [data]);
  const history = useMemo(() => data?.entries.filter((e) => e.supersededBy) ?? [], [data]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return live
      .filter((e) => category === "all" || e.category === category)
      .filter((e) => status === "all" || e.status === status)
      .filter((e) => !needle || e.text.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [live, query, category, status]);
  // The page cascades in once when it loads; later changes don't re-animate it.
  const entrance = useListEntrance([], !!data);

  if (q.isLoading)
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  if (q.error || !data)
    return (
      <p className="p-6 text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Couldn't load project memory."}
      </p>
    );

  const inferred = live.filter((e) => e.status === "inferred").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className={cn("mx-auto max-w-3xl space-y-6 px-6 py-6", entrance.list)}>
        <PageHeader
          icon={Brain}
          title="Project memory"
          description={
            <>
              {live.length} notes{inferred ? ` · ${inferred} inferred` : ""}
              {data.analyzedAt ? ` · analyzed ${ago(data.analyzedAt)}` : " · not analyzed yet"} ·
              stays on this Mac
            </>
          }
          actions={
            <>
              <button
                onClick={() => setAdding(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
              >
                <Plus className="size-4" /> Add a note
              </button>
              <button
                onClick={() =>
                  void change({ op: "analyze" }, "Project analyzed; your own notes were kept")
                }
                disabled={!!busy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
              >
                {busy === "analyze" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}{" "}
                Re-analyze
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={!live.length || !!busy}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="size-4" /> Clear
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all {live.length} notes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Vard forgets everything it knows about this project. This can't be undone.
                      Settings are kept.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void change({ op: "clear" }, "Project memory cleared")}
                    >
                      Delete all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          }
        />

        {adding && (
          <AddNote
            onCancel={() => setAdding(false)}
            onSave={async (c, text) =>
              (await change({ op: "add", category: c, text }, "Saved")) && setAdding(false)
            }
          />
        )}

        <div className="flex flex-wrap gap-2">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Search memory</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="h-9 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm"
            />
          </label>
          <Select value={category} onValueChange={(v) => setCategory(v as MemoryCategory | "all")}>
            <SelectTrigger aria-label="Category" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {MEMORY_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger aria-label="Status" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Verified and inferred</SelectItem>
              <SelectItem value="verified">Verified only</SelectItem>
              <SelectItem value="inferred">Inferred only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!live.length ? (
          <EmptyState
            icon={<Brain className="size-5" aria-hidden />}
            text={
              <>
                Nothing yet. Click <strong>Re-analyze</strong> to let Vard study the project, or run
                a task: afterwards it suggests what to remember.
              </>
            }
          />
        ) : !shown.length ? (
          <p className="text-sm text-muted-foreground">No notes match.</p>
        ) : (
          MEMORY_CATEGORIES.map((c) => {
            const rows = shown.filter((e) => e.category === c.id);
            if (!rows.length) return null;
            return (
              <section key={c.id} aria-labelledby={`mem-${c.id}`}>
                <h2 id={`mem-${c.id}`} className="mb-2 text-sm font-medium text-muted-foreground">
                  {c.title}
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {rows.map((e) => (
                    <EntryRow key={e.id} entry={e} busy={!!busy} change={change} />
                  ))}
                </ul>
              </section>
            );
          })
        )}

        {history.length > 0 && <HistoryList entries={history} live={live} />}

        <SettingsCard settings={data.settings} change={change} path={data.path} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: MemoryEntry["status"] }) {
  return (
    <Pill
      size="xs"
      tone={status === "verified" ? "ok" : "attention"}
      title={
        status === "verified"
          ? "Confirmed by you or the project analysis"
          : "Learned by the agent; not confirmed yet"
      }
    >
      {status === "verified" ? "Verified" : "Inferred"}
    </Pill>
  );
}

function EntryRow({
  entry,
  busy,
  change,
}: {
  entry: MemoryEntry;
  busy: boolean;
  change: (c: MemoryChange, done?: string) => Promise<MemorySnapshot | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [cat, setCat] = useState<MemoryCategory>(entry.category);

  if (editing)
    return (
      <li className="space-y-2 p-3">
        <label htmlFor={`edit-${entry.id}`} className="sr-only">
          Note text
        </label>
        <textarea
          id={`edit-${entry.id}`}
          rows={2}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={cat} onValueChange={(v) => setCat(v as MemoryCategory)}>
            <SelectTrigger aria-label="Category" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            onClick={async () => {
              const ok = await change(
                { op: "edit", entryId: entry.id, text: text.trim(), category: cat },
                "Saved",
              );
              if (ok) setEditing(false);
            }}
            disabled={busy || !text.trim()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Check className="size-4" /> Save
          </button>
          <button
            onClick={() => {
              setText(entry.text);
              setEditing(false);
            }}
            className="min-h-9 rounded-md px-3 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <span className="text-xs text-muted-foreground">Saving marks the note as verified.</span>
        </div>
      </li>
    );

  return (
    <li className="group flex items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">{entry.text}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={entry.status} />
          <span>from {SOURCE_LABEL[entry.source]}</span>
          <span title={new Date(entry.updatedAt).toLocaleString()}>
            · updated {ago(entry.updatedAt)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {entry.status === "inferred" && (
          <button
            onClick={() => void change({ op: "verify", entryId: entry.id }, "Marked as verified")}
            disabled={busy}
            aria-label="Mark as verified"
            title="Mark as verified"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-success"
          >
            <Check className="size-4" />
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit"
          title="Edit"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-4" />
        </button>
        <button
          onClick={async () => {
            const snap = await change({ op: "delete", entryId: entry.id });
            if (snap)
              toast("Note deleted", {
                description: entry.text,
                action: {
                  label: "Undo",
                  onClick: () =>
                    void change({ op: "add", category: entry.category, text: entry.text }),
                },
              });
          }}
          disabled={busy}
          aria-label="Delete"
          title="Delete"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}

function AddNote({
  onSave,
  onCancel,
}: {
  onSave: (c: MemoryCategory, text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [cat, setCat] = useState<MemoryCategory>("conventions");
  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(cat, text.trim());
      }}
    >
      <label htmlFor="new-note" className="text-sm font-medium">
        New note
      </label>
      <textarea
        id="new-note"
        rows={2}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One fact per note, e.g. “API handlers live in src/server/routes”"
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={cat} onValueChange={(v) => setCat(v as MemoryCategory)}>
          <SelectTrigger aria-label="Category" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEMORY_CATEGORIES.filter((c) => c.id !== "overview").map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="submit"
          disabled={!text.trim()}
          className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm hover:bg-accent"
        >
          <X className="size-4" /> Cancel
        </button>
        <span className="text-xs text-muted-foreground">
          Never paste keys or passwords; notes with secrets are refused.
        </span>
      </div>
    </form>
  );
}

function HistoryList({ entries, live }: { entries: MemoryEntry[]; live: MemoryEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        <History className="size-4" /> Replaced notes ({entries.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-3 text-sm">
              <p className="text-muted-foreground line-through">{e.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                replaced by “{live.find((l) => l.id === e.supersededBy)?.text ?? "a newer note"}” ·{" "}
                {ago(e.updatedAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsCard({
  settings,
  path,
  change,
}: {
  settings: MemorySettings;
  path: string;
  change: (c: MemoryChange, done?: string) => Promise<MemorySnapshot | null>;
}) {
  const [maxChars, setMaxChars] = useState(settings.maxContextChars);
  const [exclude, setExclude] = useState(settings.exclude.join("\n"));
  const set = (s: Partial<MemorySettings>) =>
    void change({ op: "settings", settings: s }, "Settings saved");
  const modes: { id: MemorySettings["autoUpdate"]; label: string; hint: string }[] = [
    { id: "off", label: "Off", hint: "Don't learn from tasks" },
    { id: "ask", label: "Ask me", hint: "Suggest notes; you choose what's saved" },
    {
      id: "auto",
      label: "Automatic",
      hint: "Save new notes as inferred; you can verify or delete them",
    },
  ];

  return (
    <section
      aria-labelledby="mem-settings"
      className="space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 id="mem-settings" className="text-sm font-medium">
        Memory settings
      </h2>
      <Row
        label="Project memory"
        hint="Turn off to stop using and learning anything for this project."
      >
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
          aria-label="Project memory"
        />
      </Row>
      <Row
        label="Use memory in tasks"
        hint="Give the agent the most relevant notes before it starts."
      >
        <Switch
          checked={settings.recall}
          disabled={!settings.enabled}
          onCheckedChange={(v) => set({ recall: v })}
          aria-label="Use memory in tasks"
        />
      </Row>
      <div>
        <p className="text-sm">Updates after tasks</p>
        <div
          role="radiogroup"
          aria-label="Updates after tasks"
          className="mt-2 grid gap-2 sm:grid-cols-3"
        >
          {modes.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={settings.autoUpdate === m.id}
              disabled={!settings.enabled}
              onClick={() => set({ autoUpdate: m.id })}
              className={cn(
                "min-h-14 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50",
                settings.autoUpdate === m.id
                  ? "border-primary bg-accent"
                  : "border-border hover:bg-accent",
              )}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block text-xs text-muted-foreground">{m.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm" id="mem-budget">
            Memory in the agent's context
          </label>
          <span className="text-xs text-muted-foreground">
            {maxChars.toLocaleString()} characters
          </span>
        </div>
        <Slider
          aria-labelledby="mem-budget"
          className="mt-3"
          min={2000}
          max={20000}
          step={1000}
          value={[maxChars]}
          onValueChange={(v) => setMaxChars(v[0])}
          onValueCommit={(v) => set({ maxContextChars: v[0] })}
        />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set({
            exclude: exclude
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          });
        }}
      >
        <label htmlFor="mem-exclude" className="text-sm">
          Excluded paths
        </label>
        <p className="text-xs text-muted-foreground">
          Globs the analysis skips, one per line (e.g. <code>docs/**</code>).{" "}
          <code>.gitignore</code>, <code>.env</code> files and keys are always skipped.
        </p>
        <textarea
          id="mem-exclude"
          rows={3}
          value={exclude}
          onChange={(e) => setExclude(e.target.value)}
          className="mt-2 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />
        <button
          type="submit"
          className="mt-1 min-h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
        >
          Save exclusions
        </button>
      </form>
      <p className="truncate font-mono text-xs text-muted-foreground" title={path}>
        {path}
      </p>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}
