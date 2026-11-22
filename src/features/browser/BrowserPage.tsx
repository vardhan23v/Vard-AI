/**
 * Browser: the isolated test browser agents use. Shows which Chromium is used (and installs one on
 * request), live sessions with their page, viewport, screenshots, console and network problems,
 * reports and activity, plus dev servers. Everything comes from the agent's events.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  FolderOpen,
  Globe,
  ImageOff,
  RotateCw,
  Server,
  Square,
  Terminal,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { browser, isTauri, type BrowserSessionInfo, type ViewportPreset } from "@/lib/agent-client";
import { Flash } from "@/lib/motion";
import { usePresence } from "@/lib/motion-hooks";
import { cn } from "@/lib/utils";
import { projectPath, projectsQuery } from "@/features/agent/projects";
import { Pill } from "@/features/agents/Pill";
import { projectOfArtifact } from "./artifacts";
import { Shot } from "./Shot";
import { ChromiumStatus } from "./ChromiumStatus";
import { useBrowserState } from "./useBrowser";

const VIEWPORTS: { id: ViewportPreset; label: string }[] = [
  { id: "mobile", label: "Mobile 375" },
  { id: "mobile-large", label: "Mobile L 430" },
  { id: "tablet", label: "Tablet 768" },
  { id: "laptop", label: "Laptop 1366" },
  { id: "desktop", label: "Desktop 1920" },
];

export function BrowserPage() {
  const st = useBrowserState();
  const [selected, setSelected] = useState<string | null>(null);
  const current =
    st.sessions.find((s) => s.id === selected) ??
    st.sessions.find((s) => s.state !== "closed") ??
    st.sessions[0];
  const sessionRows = usePresence(st.sessions, (s) => s.id);

  if (!isTauri())
    return (
      <p className="p-6 text-sm text-muted-foreground">
        The test browser runs in the Vard AI desktop app.
      </p>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="@container mx-auto max-w-6xl space-y-5 px-6 py-6">
        <PageHeader
          icon={Globe}
          title="Browser"
          description={
            <>
              Agents test your app in an isolated headless browser: a fresh profile per task, no
              access to your own browser, and only this Mac's dev servers unless you allow another
              site. Screenshots and reports are saved in the project's <code>.vard/artifacts</code>.
            </>
          }
        />

        <ChromiumStatus />

        {!st.sessions.length ? (
          <EmptyState
            size="lg"
            seed={53}
            icon={<Globe className="size-6" aria-hidden />}
            title="No browser sessions yet"
            text={
              <>
                Sessions appear here when an agent opens a page, for example a task like "check the
                dashboard on mobile and desktop".
              </>
            }
          />
        ) : (
          <div className="grid gap-5 @3xl:grid-cols-[17rem_1fr]">
            <ul className="space-y-2" aria-label="Browser sessions">
              {sessionRows.map(({ item: s, leaving }) => (
                <li
                  key={s.id}
                  aria-hidden={leaving || undefined}
                  className={cn(
                    "animate-enter transition-opacity duration-(--motion-base)",
                    leaving && "pointer-events-none opacity-0",
                  )}
                >
                  <button
                    onClick={() => setSelected(s.id)}
                    aria-current={current?.id === s.id}
                    className={cn(
                      "press w-full rounded-lg border p-3 text-left transition-colors",
                      current?.id === s.id
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.agentId ?? s.taskId ?? s.id}
                      </span>
                      <SessionState s={s} />
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {s.url ?? "about:blank"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.viewport.name} · {s.screenshots.length} shots
                      {s.consoleErrors ? (
                        <>
                          {" · "}
                          <Flash value={s.consoleErrors}>{s.consoleErrors} errors</Flash>
                        </>
                      ) : null}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {current && (
              <SessionView
                s={current}
                reports={st.reports[current.id] ?? []}
                log={st.log.filter((l) => l.sessionId === current.id)}
              />
            )}
          </div>
        )}

        {st.servers.length > 0 && (
          <section aria-label="Dev servers" className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Server className="size-4" /> Dev servers
            </h2>
            <ul className="space-y-2 text-sm">
              {st.servers.map((d) => (
                <li key={d.id} className="flex animate-row-in flex-wrap items-center gap-2">
                  {d.state === "ready" && <span className="live-dot text-success" aria-hidden />}
                  <Flash value={d.state}>
                    <Pill
                      tone={
                        d.state === "ready"
                          ? "ok"
                          : d.state === "failed"
                            ? "bad"
                            : d.state === "starting"
                              ? "live"
                              : "muted"
                      }
                      spin={d.state === "starting"}
                    >
                      {d.state}
                    </Pill>
                  </Flash>
                  <code className="text-xs">{d.url}</code>
                  <span className="truncate text-xs text-muted-foreground" title={d.command}>
                    {d.command}
                  </span>
                  {d.error && <span className="text-xs text-destructive">{d.error}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ArtifactsSection />
      </div>
    </div>
  );
}

function SessionState({ s }: { s: BrowserSessionInfo }) {
  const tone =
    s.state === "ready"
      ? "ok"
      : s.state === "busy" || s.state === "starting"
        ? "live"
        : s.state === "crashed"
          ? "bad"
          : "muted";
  const running = s.state === "ready" || s.state === "busy" || s.state === "starting";
  return (
    <span className="inline-flex items-center gap-1.5">
      {running && (
        <span
          className={cn("live-dot", s.state === "ready" ? "text-success" : "text-agent-foreground")}
          aria-hidden
        />
      )}
      <Flash value={s.state}>
        <Pill tone={tone} spin={s.state === "busy"}>
          {s.state}
        </Pill>
      </Flash>
    </span>
  );
}

function SessionView({
  s,
  reports,
  log,
}: {
  s: BrowserSessionInfo;
  reports: ReturnType<typeof useBrowserState>["reports"][string];
  log: ReturnType<typeof useBrowserState>["log"];
}) {
  const [url, setUrl] = useState(s.url ?? "");
  const [busy, setBusy] = useState(false);
  const live = s.state !== "closed";
  const act = async (
    action: Parameters<typeof browser.control>[1],
    extra: Parameters<typeof browser.control>[2] = {},
  ) => {
    setBusy(true);
    try {
      await browser.control(s.id, action, extra);
    } catch (e) {
      toast.error("Browser action failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };
  const report = reports.at(-1);
  // In flight: a control request we sent, or the agent driving the page.
  const pending = busy || s.state === "busy";
  const logRows = useMemo(() => {
    const seen = new Map<string, number>();
    return log.map((l) => {
      const base = `${l.at}:${l.action}:${l.detail ?? ""}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { l, key: n ? `${base}:${n}` : base };
    });
  }, [log]);
  return (
    <section
      aria-label={`Session ${s.id}`}
      className="min-w-0 animate-enter space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <div className="space-y-1">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void act("navigate", { url: url.trim() });
          }}
        >
          <button
            type="button"
            disabled={!live || busy}
            onClick={() => void act("back")}
            aria-label="Back"
            className="press inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent disabled:opacity-50"
          >
            <ArrowLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={!live || busy}
            onClick={() => void act("reload")}
            aria-label="Reload"
            className="press inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent disabled:opacity-50"
          >
            <RotateCw className="size-4" />
          </button>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Address</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!live}
              placeholder={s.url ?? "http://localhost:5173"}
              className="h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-xs disabled:opacity-60"
            />
          </label>
          <Select
            value={s.viewport.name}
            disabled={!live || busy}
            onValueChange={(v) => void act("viewport", { viewport: v as ViewportPreset })}
          >
            <SelectTrigger aria-label="Viewport" className="w-auto text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEWPORTS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
              {!VIEWPORTS.some((v) => v.id === s.viewport.name) && (
                <SelectItem value={s.viewport.name}>{s.viewport.name}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={!live || busy}
            onClick={() => void act("screenshot")}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs hover:bg-accent disabled:opacity-50"
          >
            <Camera className="size-4" /> Screenshot
          </button>
          <button
            type="button"
            disabled={!live}
            onClick={() => void act("stop")}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Square className="size-3.5" /> Stop
          </button>
        </form>
        <div
          className={cn("h-0.5 rounded-full", pending && "loading-bar")}
          role={pending ? "progressbar" : undefined}
          aria-label={pending ? "Page working" : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {s.viewport.width}×{s.viewport.height} · {s.tabs} tab(s)
        {s.lastAction ? ` · last: ${s.lastAction}` : ""}
      </p>
      <Tabs defaultValue="shots">
        <TabsList>
          <TabsTrigger value="shots">Screenshots ({s.screenshots.length})</TabsTrigger>
          <TabsTrigger value="console">
            Console (
            <Flash value={s.recentConsole?.length ?? 0}>{s.recentConsole?.length ?? 0}</Flash>)
          </TabsTrigger>
          <TabsTrigger value="network">
            Network (
            <Flash value={s.recentNetwork?.length ?? 0}>{s.recentNetwork?.length ?? 0}</Flash>)
          </TabsTrigger>
          <TabsTrigger value="report">
            Report{report ? ` (${report.findings.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="log">Activity ({log.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="shots" className="pt-3">
          {s.screenshots.length ? (
            <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {[...s.screenshots].reverse().map((x) => (
                <Shot
                  key={x.path}
                  path={x.path}
                  label={`${x.label}${x.viewport ? ` · ${x.viewport}` : ""}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Camera className="size-5" aria-hidden />} text="No screenshots yet.">
              {live && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("screenshot")}
                  className="press inline-flex min-h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs hover:bg-accent disabled:opacity-50"
                >
                  <Camera className="size-3.5" /> Take one
                </button>
              )}
            </EmptyState>
          )}
        </TabsContent>
        <TabsContent value="console" className="pt-3">
          <EntryList
            empty="No console errors or warnings."
            emptyIcon={<Terminal className="size-5" aria-hidden />}
            items={(s.recentConsole ?? []).map((c) => ({
              key: `${c.at}${c.text}`,
              tone: c.type === "warning" ? "warn" : "error",
              text: c.text,
              sub: c.url ? `${c.url}${c.line !== undefined ? `:${c.line}` : ""}` : c.type,
            }))}
          />
        </TabsContent>
        <TabsContent value="network" className="pt-3">
          <EntryList
            empty="No failed requests."
            emptyIcon={<Wifi className="size-5" aria-hidden />}
            items={(s.recentNetwork ?? []).map((n) => ({
              key: `${n.at}${n.url}`,
              tone: n.kind === "blocked" ? "warn" : "error",
              text: `${n.method} ${n.url}${n.status ? ` → ${n.status}` : ""}`,
              sub: n.error ?? n.resource ?? n.kind,
            }))}
          />
        </TabsContent>
        <TabsContent value="report" className="pt-3">
          {report ? (
            <ReportView report={report} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No responsive test has run in this session.
            </p>
          )}
        </TabsContent>
        <TabsContent value="log" className="pt-3">
          {!logRows.length && (
            <EmptyState
              icon={<Globe className="size-5" aria-hidden />}
              text="No actions in this session yet."
            />
          )}
          <ol className="max-h-80 space-y-1 overflow-y-auto text-xs">
            {[...logRows].reverse().map(({ l, key }) => (
              <li
                key={key}
                className={cn("flex animate-row-in gap-2", !l.ok && "text-destructive")}
              >
                <time className="w-20 shrink-0 text-muted-foreground tabular-nums">
                  {new Date(l.at).toLocaleTimeString()}
                </time>
                <span>
                  {l.action}
                  {l.detail ? ` — ${l.detail}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function EntryList({
  items,
  empty,
  emptyIcon,
}: {
  items: { key: string; tone: "warn" | "error"; text: string; sub?: string }[];
  empty: string;
  emptyIcon: ReactNode;
}) {
  if (!items.length) return <EmptyState icon={emptyIcon} text={empty} />;
  return (
    <ul className="max-h-80 space-y-1.5 overflow-y-auto text-xs">
      {[...items].reverse().map((x) => (
        <li key={x.key} className="animate-row-in rounded border border-border p-2">
          <p
            className={cn("break-words", x.tone === "error" ? "text-destructive" : "text-primary")}
          >
            {x.text}
          </p>
          {x.sub && <p className="mt-0.5 truncate font-mono text-muted-foreground">{x.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

export function ReportView({
  report,
}: {
  report: NonNullable<ReturnType<typeof useBrowserState>["reports"][string]>[number];
}) {
  const byVp = useMemo(
    () =>
      [...report.viewports, "all"]
        .map((v) => ({ v, items: report.findings.filter((f) => f.viewport === v) }))
        .filter((g) => g.items.length),
    [report],
  );
  return (
    <div className="space-y-3 text-sm">
      <p>{report.summary}</p>
      {byVp.map((g) => (
        <Collapsible key={g.v} defaultOpen>
          <CollapsibleTrigger className="group mb-1 flex items-center gap-1 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground">
            <ChevronDown
              className="size-3.5 transition-transform duration-(--motion-fast) group-data-[state=closed]:-rotate-90"
              aria-hidden
            />
            {g.v} ({g.items.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="stagger space-y-1">
              {g.items.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <Pill
                    tone={
                      f.severity === "high"
                        ? "bad"
                        : f.severity === "medium"
                          ? "attention"
                          : "muted"
                    }
                  >
                    {f.severity}
                  </Pill>
                  <span className="min-w-0">
                    {f.message}
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {f.evidence}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
      {report.screenshots.length > 0 && (
        <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-3">
          {report.screenshots.map((s) => (
            <Shot key={s.path} path={s.path} label={s.viewport ?? s.label} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArtifactsSection() {
  const projects = useQuery(projectsQuery());
  const [projectId, setProjectId] = useState("");
  const root = projectId ? projectPath(projectId) : undefined;
  const q = useQuery({
    queryKey: ["artifacts", root],
    queryFn: () => browser.artifacts(root!),
    enabled: !!root && isTauri(),
    retry: false,
  });
  const items = q.data?.items ?? [];
  const total = items.reduce((n, a) => n + a.bytes, 0);
  return (
    <section
      aria-label="Artifacts"
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Saved screenshots and reports</h2>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger aria-label="Project" className="w-auto min-w-44">
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.data
                ?.filter((p) => projectPath(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {root && items.length > 0 && (
            <button
              onClick={async () => {
                if (
                  !window.confirm(
                    `Delete ${items.length} files (${(total / 1e6).toFixed(1)} MB) in .vard/artifacts? This can't be undone.`,
                  )
                )
                  return;
                const r = await browser.cleanArtifacts(root);
                toast.success(`Removed ${r.removed ?? 0} files`);
                void q.refetch();
              }}
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" /> Delete all
            </button>
          )}
        </div>
      </div>
      {root &&
        (items.length ? (
          <>
            <p className="text-xs text-muted-foreground">
              {items.length} files · {(total / 1e6).toFixed(1)} MB · never deleted automatically
            </p>
            <div className="stagger grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {items
                .filter((a) => a.name.endsWith(".png"))
                .slice(0, 24)
                .map((a) => (
                  <Shot key={a.path} path={a.path} label={`${a.run}/${a.name}`} />
                ))}
            </div>
          </>
        ) : q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <EmptyState
            icon={<ImageOff className="size-5" aria-hidden />}
            text="No artifacts in this project yet. Agents save screenshots and reports here when they test it."
          />
        ))}
      {!root && (
        <EmptyState
          icon={<FolderOpen className="size-5" aria-hidden />}
          text="Choose a project above to see its saved artifacts."
        />
      )}
    </section>
  );
}
