/**
 * Integrations: the MCP servers Vard can use. Global servers work in every project; a project
 * can add its own (saved in its .vard/mcp.json, which must be trusted before anything runs).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  Loader2,
  Plug,
  Plus,
  Server,
  ShieldAlert,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StarField } from "@/components/StarField";
import {
  isTauri,
  mcp,
  onMcpStatus,
  type McpServerStatus,
  type McpServersEvent,
} from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { projectPath, projectsQuery } from "@/features/agent/projects";
import { ServerDetails } from "./ServerDetails";
import { ServerDialog } from "./ServerDialog";
import { StateBadge } from "./StateBadge";

export function IntegrationsPage() {
  const qc = useQueryClient();
  const projects = useQuery(projectsQuery());
  const [projectId, setProjectId] = useState<string>("");
  const projectRoot = projectId ? projectPath(projectId) : undefined;
  const key = ["mcp", projectRoot ?? "global"];
  const q = useQuery({
    queryKey: key,
    queryFn: () => mcp.list(projectRoot),
    enabled: isTauri(),
    retry: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    open: boolean;
    edit?: McpServerStatus;
    scope: "global" | "project";
  }>({ open: false, scope: "global" });

  // Live status from the agent (connects, crashes, tool-list changes).
  useEffect(
    () =>
      onMcpStatus((e) => {
        if ((e.projectRoot ?? undefined) !== projectRoot) return;
        qc.setQueryData<McpServersEvent>(key, (old) => ({
          ...e,
          importSources: old?.importSources,
        }));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot],
  );

  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const servers = useMemo(() => q.data?.servers ?? [], [q.data]);
  const current = servers.find((s) => s.key === selected) ?? servers[0];
  const projectServers = servers.filter((s) => s.scope === "project");
  const needsTrust = !!projectRoot && projectServers.length > 0 && q.data?.trusted === false;

  const toggle = async (s: McpServerStatus, on: boolean) => {
    try {
      await mcp.save(s.scope, { ...s.config, enabled: on }, { projectRoot, replaceId: s.id });
      if (on) await mcp.connection({ scope: s.scope, id: s.id, projectRoot }, "connect");
      refresh();
    } catch (e) {
      toast.error("Couldn't update the server", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const importFrom = async (file: string, label: string) => {
    try {
      const r = await mcp.importFile(projectRoot ? "project" : "global", file, projectRoot);
      toast.success(`Imported ${r.imported?.length ?? 0} servers from ${label}`, {
        description: "They start disabled. Review each one, then turn it on.",
      });
      refresh();
    } catch (e) {
      toast.error("Import failed", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!isTauri())
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Integrations run in the Vard AI desktop app, where the agent can start and talk to MCP
        servers.
      </p>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl">
              <Plug className="size-6 text-agent-foreground" aria-hidden /> Integrations
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Connect MCP servers to give the agent new tools, data and prompts. Every tool call
              asks for your approval unless you allow it, and nothing outside your project is
              reachable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm">
              <span className="sr-only">Show servers for</span>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setSelected(null);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
              >
                <option value="">All projects (global servers)</option>
                {projects.data
                  ?.filter((p) => projectPath(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      Project: {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {(q.data?.importSources?.length ?? 0) > 0 && (
              <details className="relative">
                <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent">
                  <Download className="size-4" /> Import
                </summary>
                <ul className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-popover p-1 shadow-lg">
                  {q.data!.importSources!.map((s) => (
                    <li key={s.file}>
                      <button
                        onClick={() => void importFrom(s.file, s.label)}
                        className="w-full rounded px-2 py-2 text-left text-sm hover:bg-accent"
                        title={s.file}
                      >
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button
              onClick={() => setDialog({ open: true, scope: projectRoot ? "project" : "global" })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <Plus className="size-4" /> Add server
            </button>
          </div>
        </header>

        {needsTrust && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/50 bg-primary/5 p-4"
          >
            <p className="flex items-start gap-2 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                This project's <code>.vard/mcp.json</code> wants to run {projectServers.length}{" "}
                server{projectServers.length > 1 ? "s" : ""}. Review them below; nothing starts
                until you trust this config.
              </span>
            </p>
            <button
              onClick={async () => {
                await mcp.trust(projectRoot!, true);
                refresh();
              }}
              className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Trust this config
            </button>
          </div>
        )}

        {q.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : q.error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {String(q.error)}
          </p>
        ) : !servers.length ? (
          <div className="relative overflow-hidden rounded-xl border border-dashed border-border p-10 text-center">
            <StarField seed={23} />
            <div className="relative space-y-3">
              <p className="text-lg">No servers yet</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Add a local server (for example{" "}
                <code>npx -y @modelcontextprotocol/server-everything</code>) or a remote one by URL
                {(q.data?.importSources?.length ?? 0) > 0
                  ? ", or import the ones you use in other apps"
                  : ""}
                .
              </p>
              <button
                onClick={() => setDialog({ open: true, scope: projectRoot ? "project" : "global" })}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                <Plus className="size-4" /> Add your first server
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <ul className="space-y-2" aria-label="Servers">
              {servers.map((s) => (
                <li key={s.key}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(s.key)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(s.key)}
                    aria-current={current?.key === s.key}
                    className={cn(
                      "cursor-pointer rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                      current?.key === s.key
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:bg-accent/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {s.transport === "stdio" ? (
                          <Server className="size-4 shrink-0 text-agent-foreground" />
                        ) : (
                          <Wifi className="size-4 shrink-0 text-agent-foreground" />
                        )}
                        <span className="truncate text-sm font-medium">{s.name}</span>
                      </div>
                      <span onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={s.enabled}
                          onCheckedChange={(v) => void toggle(s, v)}
                          aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                        />
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StateBadge state={s.state} />
                      {s.state === "connected" && <span>{s.toolCount} tools</span>}
                      <span>{s.scope === "global" ? "global" : "project"}</span>
                      {s.lastConnectedAt && s.state !== "connected" && (
                        <span>last {new Date(s.lastConnectedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                    {s.error && (
                      <p className="mt-1 line-clamp-2 text-xs text-destructive">{s.error}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {current && (
              <ServerDetails
                key={current.key}
                server={current}
                projectRoot={projectRoot}
                onEdit={() => setDialog({ open: true, edit: current, scope: current.scope })}
                onChanged={refresh}
              />
            )}
          </div>
        )}
      </div>
      {dialog.open && (
        <ServerDialog
          open={dialog.open}
          onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))}
          scope={dialog.scope}
          projectRoot={dialog.scope === "project" ? projectRoot : undefined}
          existing={dialog.edit}
          onSaved={refresh}
        />
      )}
      {q.isFetching && !q.isLoading && (
        <Loader2
          className="fixed right-4 bottom-4 size-4 animate-spin text-muted-foreground"
          aria-label="Refreshing"
        />
      )}
    </div>
  );
}
