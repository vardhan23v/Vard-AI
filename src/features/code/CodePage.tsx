/**
 * Code: Vard's index of a project. Status and controls, hybrid search, symbols, a file's outline
 * and dependencies, the dependency graph and change impact analysis. The index lives in the
 * project's .vard/index and is separate from project memory.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Braces,
  Copy,
  FileCode,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StarField } from "@/components/StarField";
import {
  code,
  isTauri,
  onCodeIndex,
  type CodeIndexStatus,
  type CodeQuery,
  type CodeResults,
  type ImpactReport,
} from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { projectPath, projectsQuery } from "@/features/agent/projects";
import { Pill } from "@/features/agents/Pill";
import { DepGraph } from "./DepGraph";

type Loc = { path: string; line: number };

export function CodePage() {
  const projects = useQuery(projectsQuery());
  const [projectId, setProjectId] = useState("");
  const root = projectId ? projectPath(projectId) : undefined;
  useEffect(() => {
    if (!projectId && projects.data?.length) {
      const first = projects.data.find((p) => projectPath(p.id));
      if (first) setProjectId(first.id);
    }
  }, [projects.data, projectId]);
  const [open, setOpen] = useState<Loc | null>(null);

  if (!isTauri())
    return (
      <p className="p-6 text-sm text-muted-foreground">
        The code index is built by the agent in the Vard AI desktop app.
      </p>
    );
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl">
              <Braces className="size-6 text-agent-foreground" aria-hidden /> Code
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Vard indexes your project's files, symbols and imports (on this Mac, in{" "}
              <code>.vard/index</code>) so agents find the right code and check what a change
              affects before editing.
            </p>
          </div>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Project"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
          >
            <option value="">Choose a project</option>
            {projects.data
              ?.filter((p) => projectPath(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </header>
        {!root ? (
          <div className="relative overflow-hidden rounded-xl border border-dashed border-border p-10 text-center">
            <StarField seed={61} />
            <p className="relative text-sm text-muted-foreground">
              Add a project folder in Projects, then choose it here.
            </p>
          </div>
        ) : (
          <Workspace key={root} root={root} open={open} setOpen={setOpen} />
        )}
      </div>
    </div>
  );
}

export function Workspace({
  root,
  open,
  setOpen,
}: {
  root: string;
  open: Loc | null;
  setOpen: (l: Loc | null) => void;
}) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["code-status", root],
    queryFn: () => code.status(root).then((e) => e.status),
    retry: false,
  });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(
    () =>
      onCodeIndex((e) => {
        if (e.type === "code_index_progress" && e.projectRoot === root)
          setProgress({ done: e.done, total: e.total });
        if (e.type === "code_index_status" && e.status.projectRoot === root) {
          qc.setQueryData(["code-status", root], e.status);
          if (e.status.state !== "indexing") setProgress(null);
        }
      }),
    [root, qc],
  );
  const s = status.data;
  const ready = s?.state === "ready" || (s?.files ?? 0) > 0;
  const run = async (action: Parameters<typeof code.index>[1]) => {
    try {
      const r = await code.index(root, action);
      qc.setQueryData(["code-status", root], r.status);
    } catch (e) {
      toast.error("Index action failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  return (
    <div className="space-y-5">
      <IndexCard s={s} loading={status.isLoading} progress={progress} run={run} />
      {ready && (
        <div className={cn("grid gap-5", open && "xl:grid-cols-[1fr_28rem]")}>
          <Tabs defaultValue="search" className="min-w-0">
            <TabsList className="flex-wrap">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="symbols">Symbols</TabsTrigger>
              <TabsTrigger value="file">File</TabsTrigger>
              <TabsTrigger value="graph">Graph</TabsTrigger>
              <TabsTrigger value="impact">Impact</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="pt-4">
              <SearchTab root={root} onOpen={setOpen} />
            </TabsContent>
            <TabsContent value="symbols" className="pt-4">
              <SymbolsTab root={root} onOpen={setOpen} />
            </TabsContent>
            <TabsContent value="file" className="pt-4">
              <FileTab root={root} onOpen={setOpen} initial={open?.path} />
            </TabsContent>
            <TabsContent value="graph" className="pt-4">
              <GraphTab root={root} onOpen={setOpen} />
            </TabsContent>
            <TabsContent value="impact" className="pt-4">
              <ImpactTab root={root} onOpen={setOpen} />
            </TabsContent>
            <TabsContent value="settings" className="pt-4">
              <SettingsTab root={root} />
            </TabsContent>
          </Tabs>
          {open && <Snippet root={root} loc={open} onClose={() => setOpen(null)} />}
        </div>
      )}
    </div>
  );
}

function IndexCard({
  s,
  loading,
  progress,
  run,
}: {
  s?: CodeIndexStatus;
  loading: boolean;
  progress: { done: number; total: number } | null;
  run: (a: Parameters<typeof code.index>[1]) => void;
}) {
  const indexing = s?.state === "indexing" || !!progress;
  return (
    <section aria-label="Index status" className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Pill
              tone={
                s?.state === "ready"
                  ? "ok"
                  : s?.state === "error"
                    ? "bad"
                    : indexing
                      ? "live"
                      : "muted"
              }
              spin={indexing}
            >
              {indexing
                ? "Indexing"
                : s?.state === "ready"
                  ? "Ready"
                  : s?.state === "error"
                    ? "Error"
                    : "Not indexed"}
            </Pill>
          )}
          {s && s.files > 0 && (
            <span className="text-muted-foreground">
              {s.files.toLocaleString()} files · {s.symbols.toLocaleString()} symbols ·{" "}
              {s.imports.toLocaleString()} imports · {(s.bytes / 1e6).toFixed(1)} MB
              {s.failed ? ` · ${s.failed} couldn't be parsed` : ""}
              {s.indexedAt ? ` · updated ${new Date(s.indexedAt).toLocaleString()}` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {indexing ? (
            <button
              onClick={() => run("cancel")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
            >
              <Square className="size-3.5" /> Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() => run("build")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <RefreshCw className="size-4" /> {s?.files ? "Update index" : "Build index"}
              </button>
              {!!s?.files && (
                <>
                  <button
                    onClick={() => run("rebuild")}
                    className="min-h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
                  >
                    Re-index all
                  </button>
                  <button
                    onClick={() =>
                      window.confirm(
                        "Delete this project's code index? It can be rebuilt any time.",
                      ) && run("clean")
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" /> Delete index
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {progress && progress.total > 0 && (
        <div className="mt-3 space-y-1">
          <Progress
            value={(progress.done / progress.total) * 100}
            className="h-1.5"
            aria-label="Indexing progress"
          />
          <p className="text-xs text-muted-foreground">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()} files
          </p>
        </div>
      )}
      {s && Object.keys(s.languages).length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {Object.entries(s.languages)
            .sort((a, b) => b[1] - a[1])
            .map(([l, n]) => (
              <span key={l} className="rounded-full border border-border px-2 py-0.5">
                {l} {n}
              </span>
            ))}
        </p>
      )}
      {s?.overCap && (
        <p className="mt-2 text-xs text-destructive">
          The index is over its size limit; add exclusions in Settings to keep it small.
        </p>
      )}
      {s?.error && <p className="mt-2 text-xs text-destructive">{s.error}</p>}
    </section>
  );
}

function useCodeQuery(root: string, query: CodeQuery | null) {
  return useQuery({
    queryKey: ["code-q", root, query],
    queryFn: () => code.query(root, query!),
    enabled: !!query,
    retry: false,
  });
}

const LocButton = ({
  path,
  line,
  onOpen,
  children,
}: Loc & { onOpen: (l: Loc) => void; children?: React.ReactNode }) => (
  <button
    onClick={() => onOpen({ path, line })}
    className="text-left font-mono text-xs text-agent-foreground underline-offset-2 hover:underline"
  >
    {path}:{line}
    {children}
  </button>
);

function SearchTab({ root, onOpen }: { root: string; onOpen: (l: Loc) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState<CodeQuery | null>(null);
  const r = useCodeQuery(root, q);
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) setQ({ kind: "search", query: text.trim(), limit: 25 });
        }}
        className="flex gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">Search the code</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. where is user authentication handled?"
            className="h-10 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none focus:border-primary"
          />
        </label>
        <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Search
        </button>
      </form>
      <Results
        r={r}
        render={(d) =>
          d.hits?.length ? (
            <ul className="space-y-2">
              {d.hits.map((h, i) => (
                <li key={i} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <LocButton path={h.path} line={h.line} onOpen={onOpen} />
                    {h.symbol && (
                      <span className="text-sm">
                        {h.kind ? `${h.kind} ` : ""}
                        <strong>{h.symbol}</strong>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{h.reasons.join(" · ")}</p>
                  {h.snippet && (
                    <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                      {h.snippet}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No matches.</p>
          )
        }
      />
    </div>
  );
}

function Results({
  r,
  render,
}: {
  r: ReturnType<typeof useCodeQuery>;
  render: (d: CodeResults) => React.ReactNode;
}) {
  if (r.isFetching)
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Searching" />;
  if (r.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {String(r.error)}
      </p>
    );
  return r.data ? <>{render(r.data)}</> : null;
}

function SymbolsTab({ root, onOpen }: { root: string; onOpen: (l: Loc) => void }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState<CodeQuery | null>(null);
  const r = useCodeQuery(root, q);
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => (
          e.preventDefault(),
          text.trim() && setQ({ kind: "symbols", query: text.trim(), limit: 60 })
        )}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Symbol name"
          placeholder="Function, class or type name"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Find
        </button>
      </form>
      <Results
        r={r}
        render={(d) =>
          d.symbols?.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
              {d.symbols.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="text-xs text-muted-foreground">{s.kind}</span>{" "}
                    {s.parent ? `${s.parent}.` : ""}
                    <strong>{s.name}</strong>{" "}
                    {s.exported && <span className="text-xs text-diff-add">exported</span>}
                  </span>
                  <LocButton path={s.path} line={s.line} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No symbols match.</p>
          )
        }
      />
    </div>
  );
}

function FileTab({
  root,
  onOpen,
  initial,
}: {
  root: string;
  onOpen: (l: Loc) => void;
  initial?: string;
}) {
  const [path, setPath] = useState(initial ?? "");
  const [active, setActive] = useState(initial ?? "");
  useEffect(() => {
    if (initial) {
      setPath(initial);
      setActive(initial);
    }
  }, [initial]);
  const outline = useCodeQuery(root, active ? { kind: "outline", path: active } : null);
  const deps = useCodeQuery(root, active ? { kind: "dependencies", path: active } : null);
  const dependents = useCodeQuery(
    root,
    active ? { kind: "dependents", path: active, depth: 1 } : null,
  );
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => (e.preventDefault(), setActive(path.trim()))} className="flex gap-2">
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          aria-label="File path"
          placeholder="src/lib/agent-client.ts"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
        />
        <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Open
        </button>
      </form>
      {active && (
        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-lg border border-border bg-card p-3">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Outline
            </h3>
            <Results
              r={outline}
              render={(d) => (
                <ul className="space-y-1 text-sm">
                  {(d.symbols ?? []).map((s, i) => (
                    <li key={i} className={cn(s.parent && "pl-3")}>
                      <button
                        onClick={() => onOpen({ path: active, line: s.line })}
                        className="text-left hover:underline"
                      >
                        <span className="text-xs text-muted-foreground">{s.kind}</span> {s.name}
                      </button>
                    </li>
                  ))}
                  {!d.symbols?.length && <li className="text-muted-foreground">No definitions.</li>}
                </ul>
              )}
            />
          </section>
          <section className="rounded-lg border border-border bg-card p-3">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Imports
            </h3>
            <Results
              r={deps}
              render={(d) => (
                <ul className="space-y-1 font-mono text-xs">
                  {(d.files ?? []).map((f) => (
                    <li key={f.path}>
                      <button
                        onClick={() => (setPath(f.path), setActive(f.path))}
                        className="text-left hover:underline"
                      >
                        {f.path}
                      </button>
                    </li>
                  ))}
                  {!!d.packages?.length && (
                    <li className="pt-1 text-muted-foreground">
                      packages: {d.packages.join(", ")}
                    </li>
                  )}
                </ul>
              )}
            />
          </section>
          <section className="rounded-lg border border-border bg-card p-3">
            <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Imported by
            </h3>
            <Results
              r={dependents}
              render={(d) => (
                <ul className="space-y-1 font-mono text-xs">
                  {(d.files ?? []).map((f) => (
                    <li key={f.path}>
                      <button
                        onClick={() => (setPath(f.path), setActive(f.path))}
                        className="text-left hover:underline"
                      >
                        {f.path}
                        {f.test ? " (test)" : ""}
                      </button>
                    </li>
                  ))}
                  {!d.files?.length && (
                    <li className="text-muted-foreground">Nothing imports it.</li>
                  )}
                </ul>
              )}
            />
          </section>
        </div>
      )}
    </div>
  );
}

function GraphTab({ root, onOpen }: { root: string; onOpen: (l: Loc) => void }) {
  const [focus, setFocus] = useState<string | undefined>();
  const [depth, setDepth] = useState(1);
  const r = useCodeQuery(root, { kind: "graph", focus, depth, limit: 120 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {focus ? (
          <>
            <span className="font-mono text-xs">{focus}</span>
            <button
              onClick={() => onOpen({ path: focus, line: 1 })}
              className="text-xs text-agent-foreground hover:underline"
            >
              open
            </button>
            <button
              onClick={() => setFocus(undefined)}
              className="text-xs text-muted-foreground hover:underline"
            >
              back to folders
            </button>
            <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              Depth
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="h-8 rounded border border-input bg-background px-1"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          </>
        ) : (
          <span className="text-muted-foreground">
            Folders and how they import each other. Open a file in the File tab or click a file node
            to focus it.
          </span>
        )}
      </div>
      <Results
        r={r}
        render={(d) =>
          d.graph ? (
            <DepGraph graph={d.graph} onOpen={(id, kind) => kind === "file" && setFocus(id)} />
          ) : null
        }
      />
    </div>
  );
}

function ImpactTab({ root, onOpen }: { root: string; onOpen: (l: Loc) => void }) {
  const [target, setTarget] = useState("");
  const [q, setQ] = useState<CodeQuery | null>(null);
  const r = useCodeQuery(root, q);
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => (
          e.preventDefault(),
          target.trim() && setQ({ kind: "impact", target: target.trim(), depth: 3 })
        )}
        className="flex gap-2"
      >
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="File or symbol"
          placeholder="A file path or a symbol name, e.g. verifyToken"
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Analyze
        </button>
      </form>
      <Results
        r={r}
        render={(d) => (d.impact ? <ImpactCard r={d.impact} onOpen={onOpen} /> : null)}
      />
    </div>
  );
}

export function ImpactCard({ r, onOpen }: { r: ImpactReport; onOpen?: (l: Loc) => void }) {
  const open = onOpen ?? (() => {});
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{r.target}</span>
        <Pill tone={r.risk === "high" ? "bad" : r.risk === "medium" ? "attention" : "ok"}>
          {r.risk} risk
        </Pill>
      </div>
      <p className="text-xs text-muted-foreground">Because: {r.evidence.join("; ")}</p>
      {r.notes.map((n) => (
        <p key={n} className="text-xs text-muted-foreground">
          Note: {n}
        </p>
      ))}
      <ImpactList
        title={`Direct dependents (${r.direct.length})`}
        items={r.direct.map((d) => ({ path: d.path, line: 1, sub: d.via }))}
        onOpen={open}
      />
      <ImpactList
        title={`Indirect (${r.indirect.length})`}
        items={r.indirect
          .slice(0, 30)
          .map((d) => ({ path: d.path, line: 1, sub: `${d.depth} hops` }))}
        onOpen={open}
      />
      <ImpactList
        title={`References (${r.referencing.length})`}
        items={r.referencing
          .slice(0, 30)
          .map((d) => ({ path: d.path, line: d.line, sub: d.symbol }))}
        onOpen={open}
      />
      <ImpactList
        title="Tests"
        items={r.tests.map((t) => ({ path: t, line: 1 }))}
        onOpen={open}
        empty="No related tests found."
      />
      {r.publicApi.length > 0 && (
        <p className="text-xs">Public API: {r.publicApi.map((s) => s.name).join(", ")}</p>
      )}
      {r.verify.length > 0 && (
        <p className="text-xs">
          Verify with:{" "}
          {r.verify.map((v) => (
            <code key={v} className="mr-2 rounded bg-muted px-1">
              {v}
            </code>
          ))}
        </p>
      )}
    </div>
  );
}

function ImpactList({
  title,
  items,
  onOpen,
  empty,
}: {
  title: string;
  items: { path: string; line: number; sub?: string }[];
  onOpen: (l: Loc) => void;
  empty?: string;
}) {
  if (!items.length && !empty) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      {items.length ? (
        <ul className="space-y-0.5">
          {items.map((x, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <LocButton path={x.path} line={x.line} onOpen={onOpen} />
              {x.sub && <span className="text-xs text-muted-foreground">{x.sub}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function SettingsTab({ root }: { root: string }) {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["code-config", root],
    queryFn: () => code.config(root).then((e) => e.config),
    retry: false,
  });
  const [exclude, setExclude] = useState<string | null>(null);
  const value = exclude ?? cfg.data?.exclude.join("\n") ?? "";
  const save = async (patch: Parameters<typeof code.config>[1]) => {
    try {
      const r = await code.config(root, patch);
      qc.setQueryData(["code-config", root], r.config);
      toast.success("Saved. Update the index to apply it.");
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : String(e) });
    }
  };
  if (!cfg.data) return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <label htmlFor="excl" className="block font-medium">
          Excluded folders or patterns
        </label>
        <p className="text-xs text-muted-foreground">
          One per line, relative to the project (for example <code>generated/</code> or{" "}
          <code>**/*.snap</code>). .gitignore, dependencies, build output and credential files are
          always skipped.
        </p>
        <textarea
          id="excl"
          value={value}
          onChange={(e) => setExclude(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() =>
            void save({
              exclude: value
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
          className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Save exclusions
        </button>
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">Semantic search (optional)</h3>
        <p className="text-xs text-muted-foreground">
          Off by default: search uses keywords, symbols, paths and the import graph. Turn on vector
          search with a local Ollama model you already have (nothing is downloaded), or with your
          OpenAI or Google key; code that looks like it holds secrets is never sent.
        </p>
        <select
          value={cfg.data.embeddings.provider}
          onChange={(e) => void save({ embeddings: { provider: e.target.value as "none" } })}
          aria-label="Embeddings provider"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
        >
          <option value="none">Off</option>
          <option value="ollama">Ollama on this Mac (nomic-embed-text)</option>
          <option value="openai">OpenAI (text-embedding-3-small)</option>
          <option value="google">Google (text-embedding-004)</option>
        </select>
      </section>
      <section className="space-y-1">
        <h3 className="font-medium">Limits</h3>
        <p className="text-xs text-muted-foreground">
          Files up to {(cfg.data.maxFileBytes / 1e6).toFixed(1)} MB, at most{" "}
          {cfg.data.maxFiles.toLocaleString()} files, index up to{" "}
          {(cfg.data.maxIndexBytes / 1e6).toFixed(0)} MB.
          {cfg.data.watch ? " Changed files are re-indexed while the project is open." : ""}
        </p>
      </section>
    </div>
  );
}

function Snippet({ root, loc, onClose }: { root: string; loc: Loc; onClose: () => void }) {
  const r = useCodeQuery(root, { kind: "snippet", path: loc.path, line: loc.line, context: 20 });
  const abs = `${root}/${loc.path}`;
  return (
    <aside
      aria-label="Code"
      className="min-w-0 self-start rounded-xl border border-border bg-card xl:sticky xl:top-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate font-mono text-xs">
          <FileCode className="size-3.5 shrink-0" />
          {loc.path}:{loc.line}
        </span>
        <span className="flex items-center gap-1">
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(`${loc.path}:${loc.line}`)
                .then(() => toast.success("Copied"))
            }
            aria-label="Copy path and line"
            className="inline-flex size-8 items-center justify-center rounded hover:bg-accent"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            onClick={() => void revealItemInDir(abs)}
            aria-label="Show in Finder"
            className="inline-flex size-8 items-center justify-center rounded hover:bg-accent"
          >
            <FolderOpen className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded px-2 text-xs text-muted-foreground hover:bg-accent"
          >
            Close
          </button>
        </span>
      </div>
      <Results
        r={r}
        render={(d) =>
          d.snippet ? (
            <pre className="max-h-[70vh] overflow-auto p-2 text-xs leading-relaxed">
              {d.snippet.lines.map((l, i) => {
                const n = d.snippet!.start + i;
                return (
                  <div key={n} className={cn("flex", n === loc.line && "bg-primary/15")}>
                    <span className="w-10 shrink-0 pr-2 text-right text-muted-foreground select-none">
                      {n}
                    </span>
                    <span className="whitespace-pre">{l}</span>
                  </div>
                );
              })}
            </pre>
          ) : null
        }
      />
    </aside>
  );
}
