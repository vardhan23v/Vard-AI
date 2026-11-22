/** Browser work inside a task: sessions, findings, screenshots and dev servers, from real events. */
import { Globe, Server } from "lucide-react";
import { Card } from "@/features/agent/TaskView";
import type { LiveTask } from "@/features/agent/store";
import { Pill } from "@/features/agents/Pill";
import { Flash } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ReportView } from "./BrowserPage";
import { Shot } from "./Shot";

export function TaskBrowserPanel({ live }: { live: LiveTask }) {
  const b = live.browser;
  if (!b) return null;
  const sessions = Object.values(b.sessions);
  const servers = Object.values(b.servers);
  if (!sessions.length && !servers.length && !b.reports.length) return null;
  const shots = sessions
    .flatMap((s) => s.screenshots.map((x) => ({ ...x, who: s.agentId })))
    .sort((a, c) => c.at - a.at)
    .slice(0, 8);
  const reports = b.reports;
  return (
    <div className="animate-enter">
      <Card title="Browser" icon={<Globe className="size-4" />}>
        <div className="space-y-4 text-sm">
          {sessions.map((s) => (
            <div key={s.id} className="flex animate-row-in flex-wrap items-center gap-2">
              {(s.state === "ready" || s.state === "busy" || s.state === "starting") && (
                <span
                  className={cn(
                    "live-dot",
                    s.state === "ready" ? "text-success" : "text-agent-foreground",
                  )}
                  aria-hidden
                />
              )}
              <Flash value={s.state}>
                <Pill
                  tone={
                    s.state === "ready"
                      ? "ok"
                      : s.state === "busy"
                        ? "live"
                        : s.state === "crashed"
                          ? "bad"
                          : "muted"
                  }
                  spin={s.state === "busy"}
                >
                  {s.state}
                </Pill>
              </Flash>
              {s.agentId && <span className="text-xs text-muted-foreground">{s.agentId}</span>}
              <code className="truncate text-xs">{s.url ?? "about:blank"}</code>
              <span className="text-xs text-muted-foreground">
                {s.viewport.name} {s.viewport.width}×{s.viewport.height}
                {s.consoleErrors ? ` · ${s.consoleErrors} console errors` : ""}
                {s.networkErrors ? ` · ${s.networkErrors} network problems` : ""}
              </span>
            </div>
          ))}
          {servers.map((d) => (
            <p key={d.id} className="flex animate-row-in flex-wrap items-center gap-2 text-xs">
              <Server className="size-3.5 text-muted-foreground" />
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
              <code>{d.url}</code>
              <span className="truncate text-muted-foreground">{d.command}</span>
              {d.error && <span className="text-destructive">{d.error}</span>}
            </p>
          ))}
          {reports.length > 0 && (
            <div className="space-y-3">
              {reports.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Test history:{" "}
                  {reports
                    .map(
                      (r, i) =>
                        `#${i + 1} ${r.findings.filter((f) => f.severity !== "low").length ? "problems" : "clean"}`,
                    )
                    .join(" → ")}
                </p>
              )}
              <ReportView report={reports[reports.length - 1]} />
            </div>
          )}
          {shots.length > 0 && !reports.length && (
            <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4">
              {shots.map((x) => (
                <Shot
                  key={x.path}
                  path={x.path}
                  label={`${x.label}${x.viewport ? ` · ${x.viewport}` : ""}`}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

export function CodeContextCard({ live }: { live: LiveTask }) {
  if (!live.code?.overview) return null;
  return (
    <details className="animate-enter rounded-xl border border-border bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold">
        Codebase overview
        {live.code.indexing ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            (index still updating)
          </span>
        ) : null}
      </summary>
      <pre className="overflow-x-auto px-4 pb-3 text-xs whitespace-pre-wrap text-muted-foreground">
        {live.code.overview}
      </pre>
    </details>
  );
}
