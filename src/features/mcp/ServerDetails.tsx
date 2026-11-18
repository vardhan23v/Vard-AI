/** One MCP server: Overview · Tools · Resources · Prompts · Permissions · Logs. */
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Copy,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Plug,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mcp, type McpServerStatus } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { StateBadge } from "./StateBadge";

export function ServerDetails({
  server,
  projectRoot,
  onEdit,
  onChanged,
}: {
  server: McpServerStatus;
  projectRoot?: string;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const ref = { scope: server.scope, id: server.id, projectRoot };
  const connected = server.state === "connected";
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(label, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label={server.name} className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg">
            {server.name} <StateBadge state={server.state} />
          </h2>
          <p className="truncate font-mono text-xs text-muted-foreground" title={server.target}>
            {server.transport === "stdio" ? "Local" : "Remote"} · {server.target}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <>
              <Btn
                icon={RefreshCw}
                label="Reconnect"
                busy={busy === "Reconnect"}
                onClick={() => act("Reconnect", () => mcp.connection(ref, "reconnect"))}
              />
              <Btn
                icon={Unplug}
                label="Disconnect"
                busy={busy === "Disconnect"}
                onClick={() => act("Disconnect", () => mcp.connection(ref, "disconnect"))}
              />
            </>
          ) : server.state === "needs_auth" ||
            (server.config.transport.type === "http" &&
              server.config.transport.auth === "oauth") ? (
            <Btn
              icon={KeyRound}
              label="Authorize"
              busy={busy === "Authorize"}
              disabled={!server.enabled}
              onClick={() => act("Authorize", () => mcp.connection(ref, "authorize"))}
            />
          ) : null}
          {!connected && (
            <Btn
              icon={Plug}
              label="Connect"
              primary
              busy={busy === "Connect"}
              disabled={!server.enabled || server.state === "needs_trust"}
              onClick={() => act("Connect", () => mcp.connection(ref, "connect"))}
            />
          )}
          <Btn icon={Pencil} label="Edit" onClick={onEdit} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10">
                <Trash2 className="size-4" /> Remove
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {server.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It disconnects, and its stored secrets are deleted from your Keychain. Permissions
                  you set for its tools stay until you revoke them.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void act("Remove", () => mcp.remove(ref))}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      {server.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {server.error}
        </p>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tools">Tools {connected ? `(${server.toolCount})` : ""}</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview server={server} projectRoot={projectRoot} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="tools">
          {connected ? (
            <Tools server={server} projectRoot={projectRoot} onChanged={onChanged} />
          ) : (
            <NotConnected />
          )}
        </TabsContent>
        <TabsContent value="resources">
          {connected ? <Resources server={server} projectRoot={projectRoot} /> : <NotConnected />}
        </TabsContent>
        <TabsContent value="prompts">
          {connected ? <Prompts server={server} projectRoot={projectRoot} /> : <NotConnected />}
        </TabsContent>
        <TabsContent value="permissions">
          {projectRoot ? (
            connected ? (
              <Permissions server={server} projectRoot={projectRoot} />
            ) : (
              <NotConnected />
            )
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              Permissions are per project: choose a project at the top to set them.
            </p>
          )}
        </TabsContent>
        <TabsContent value="logs">
          <Logs server={server} projectRoot={projectRoot} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Btn({
  icon: Icon,
  label,
  onClick,
  busy,
  disabled,
  primary,
}: {
  icon: typeof Plug;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm disabled:opacity-50",
        primary
          ? "bg-primary font-medium text-primary-foreground"
          : "border border-input hover:bg-accent",
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />} {label}
    </button>
  );
}

const NotConnected = () => (
  <p className="p-3 text-sm text-muted-foreground">Connect the server to see this.</p>
);

function Overview({
  server,
  projectRoot,
  onChanged,
}: {
  server: McpServerStatus;
  projectRoot?: string;
  onChanged: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const rows: [string, string | undefined][] = [
    ["Scope", server.scope === "global" ? "All projects" : "This project only"],
    [
      "Server",
      server.serverInfo ? `${server.serverInfo.name} ${server.serverInfo.version}` : undefined,
    ],
    ["Protocol", server.protocolVersion],
    ["Capabilities", server.capabilities.join(", ") || undefined],
    [
      "Offers",
      server.state === "connected"
        ? `${server.toolCount} tools · ${server.resourceCount} resources · ${server.promptCount} prompts`
        : undefined,
    ],
    [
      "Last connected",
      server.lastConnectedAt ? new Date(server.lastConnectedAt).toLocaleString() : undefined,
    ],
    ["Description", server.description],
  ];
  const saveSecret = async (name: string, value: string | null) => {
    try {
      await mcp.setSecret({ scope: server.scope, id: server.id, projectRoot }, name, value);
      setValues((v) => ({ ...v, [name]: "" }));
      toast.success(value ? "Saved to your Keychain" : "Removed from your Keychain");
      onChanged();
    } catch (e) {
      toast.error("Keychain", { description: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <div className="space-y-4 pt-2">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
      </dl>
      {server.secrets.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Secrets</h3>
          <p className="text-xs text-muted-foreground">
            Kept in your macOS Keychain. Values are never shown again.
          </p>
          {server.secrets.map((s) => (
            <form
              key={s.name}
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (values[s.name]) void saveSecret(s.name, values[s.name]);
              }}
            >
              <span className="w-44 truncate font-mono text-xs">
                {s.name.replace(/^header:/, "header ")}
              </span>
              <span className={cn("text-xs", s.set ? "text-diff-add" : "text-destructive")}>
                {s.set ? "stored" : "missing"}
              </span>
              <input
                type="password"
                autoComplete="off"
                aria-label={`New value for ${s.name}`}
                value={values[s.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [s.name]: e.target.value }))}
                placeholder={s.set ? "Replace…" : "Value"}
                className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={!values[s.name]}
                className="min-h-9 rounded-md border border-input px-3 text-xs hover:bg-accent disabled:opacity-50"
              >
                Save
              </button>
              {s.set && (
                <button
                  type="button"
                  onClick={() => void saveSecret(s.name, null)}
                  className="min-h-9 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10"
                >
                  Clear
                </button>
              )}
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function useInspect<K extends "tools" | "resources" | "prompts" | "logs">(
  server: McpServerStatus,
  projectRoot: string | undefined,
  kind: K,
) {
  return useQuery({
    queryKey: [
      "mcp-inspect",
      server.key,
      projectRoot ?? "",
      kind,
      server.toolCount,
      server.resourceCount,
      server.promptCount,
    ],
    queryFn: () => mcp.inspect({ scope: server.scope, id: server.id, projectRoot }, kind),
    retry: false,
  });
}

function Tools({
  server,
  projectRoot,
  onChanged,
}: {
  server: McpServerStatus;
  projectRoot?: string;
  onChanged: () => void;
}) {
  const q = useInspect(server, projectRoot, "tools");
  const toggle = async (name: string, on: boolean) => {
    const disabled = new Set(server.config.disabledTools);
    if (on) disabled.delete(name);
    else disabled.add(name);
    try {
      await mcp.save(
        server.scope,
        { ...server.config, disabledTools: [...disabled] },
        { projectRoot, replaceId: server.id },
      );
      onChanged();
    } catch (e) {
      toast.error("Couldn't update the tool", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  if (q.isLoading) return <Loader2 className="m-3 size-4 animate-spin text-muted-foreground" />;
  if (q.error) return <p className="p-3 text-sm text-destructive">{String(q.error)}</p>;
  return (
    <div className="space-y-2 pt-2">
      <p className="text-xs text-muted-foreground">
        Descriptions and hints come from the server and aren't verified. Switched-off tools are
        never offered to the agent.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {q.data?.tools?.map((t) => (
          <li key={t.name} className="space-y-1 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.description || "No description."}
                </p>
                <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                  {t.annotations?.readOnlyHint && <Hint tone="ok">read-only (unverified)</Hint>}
                  {t.annotations?.destructiveHint && (
                    <Hint tone="danger">destructive: asks every time</Hint>
                  )}
                  {t.annotations?.openWorldHint && <Hint>reaches external systems</Hint>}
                  <Hint mono>{t.qualifiedName}</Hint>
                </p>
              </div>
              <Switch
                checked={t.enabled}
                onCheckedChange={(v) => void toggle(t.name, v)}
                aria-label={`Offer ${t.name} to the agent`}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Input schema
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-background p-2 font-mono text-[11px]">
                {JSON.stringify(t.inputSchema, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Hint({
  children,
  tone,
  mono,
}: {
  children: React.ReactNode;
  tone?: "ok" | "danger";
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-1.5 py-px",
        tone === "ok"
          ? "border-diff-add/40 text-diff-add"
          : tone === "danger"
            ? "border-destructive/40 text-destructive"
            : "border-border text-muted-foreground",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

function Resources({ server, projectRoot }: { server: McpServerStatus; projectRoot?: string }) {
  const q = useInspect(server, projectRoot, "resources");
  const [uri, setUri] = useState("");
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const read = async (u: string) => {
    setLoading(true);
    setContent(null);
    try {
      setContent(
        (await mcp.readResource({ scope: server.scope, id: server.id, projectRoot }, u)).text,
      );
    } catch (e) {
      toast.error("Couldn't read the resource", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };
  if (q.isLoading) return <Loader2 className="m-3 size-4 animate-spin text-muted-foreground" />;
  const items = q.data?.resources ?? [];
  return (
    <div className="space-y-3 pt-2">
      {!items.length && (
        <p className="text-sm text-muted-foreground">This server offers no resources.</p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((r) => (
          <li key={r.uri} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm">{r.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{r.uri}</p>
              {(r.description || r.mimeType) && (
                <p className="text-xs text-muted-foreground">
                  {[r.mimeType, r.description].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {r.template ? (
              <span className="text-xs text-muted-foreground">template</span>
            ) : (
              <button
                onClick={() => void read(r.uri)}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-input px-3 text-xs hover:bg-accent"
              >
                <BookOpen className="size-3.5" /> View
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (uri.trim()) void read(uri.trim());
        }}
      >
        <input
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          placeholder="Read a URI (e.g. from a template)"
          aria-label="Resource URI"
          className="h-9 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none focus:border-primary"
        />
        <button
          type="submit"
          className="min-h-9 rounded-md border border-input px-3 text-xs hover:bg-accent"
        >
          Read
        </button>
      </form>
      {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      {content !== null && (
        <pre className="max-h-80 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-xs whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  );
}

function Prompts({ server, projectRoot }: { server: McpServerStatus; projectRoot?: string }) {
  const q = useInspect(server, projectRoot, "prompts");
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const prompt = q.data?.prompts?.find((p) => p.name === chosen);
  useEffect(() => {
    setArgs({});
    setResult(null);
  }, [chosen]);
  if (q.isLoading) return <Loader2 className="m-3 size-4 animate-spin text-muted-foreground" />;
  const items = q.data?.prompts ?? [];
  const run = async () => {
    try {
      setResult(
        (await mcp.getPrompt({ scope: server.scope, id: server.id, projectRoot }, chosen!, args))
          .text,
      );
    } catch (e) {
      toast.error("Couldn't get the prompt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  return (
    <div className="space-y-3 pt-2">
      {!items.length && (
        <p className="text-sm text-muted-foreground">This server offers no prompts.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((p) => (
          <button
            key={p.name}
            onClick={() => setChosen(p.name)}
            className={cn(
              "min-h-9 rounded-md border px-3 text-sm",
              chosen === p.name ? "border-primary bg-accent" : "border-border hover:bg-accent",
            )}
            title={p.description}
          >
            {p.name}
          </button>
        ))}
      </div>
      {prompt && (
        <form
          className="space-y-2 rounded-lg border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {prompt.description && (
            <p className="text-sm text-muted-foreground">{prompt.description}</p>
          )}
          {prompt.arguments.map((a) => (
            <label key={a.name} className="block space-y-1 text-sm">
              <span>
                {a.name}
                {a.required && <span className="text-destructive"> *</span>}{" "}
                {a.description && (
                  <span className="text-xs text-muted-foreground">{a.description}</span>
                )}
              </span>
              <input
                value={args[a.name] ?? ""}
                onChange={(e) => setArgs((v) => ({ ...v, [a.name]: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary"
              />
            </label>
          ))}
          <button
            type="submit"
            className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Get prompt
          </button>
        </form>
      )}
      {result !== null && (
        <div className="space-y-2">
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs whitespace-pre-wrap">
            {result}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => void navigate({ to: "/chat", search: { draft: result } })}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              <MessageSquarePlus className="size-4" /> Use in a new chat
            </button>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(result);
                toast.success("Copied. Paste it into a chat or a task.");
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
            >
              <Copy className="size-4" /> Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Permissions({ server, projectRoot }: { server: McpServerStatus; projectRoot: string }) {
  const qc = useQueryClient();
  const tools = useInspect(server, projectRoot, "tools");
  const key = ["mcp-perms", projectRoot];
  const rules = useQuery({
    queryKey: key,
    queryFn: () => mcp.permissions(projectRoot, { op: "list" }),
  });
  const set = async (k: string, value: "allow" | "deny" | null) => {
    try {
      qc.setQueryData(key, await mcp.permissions(projectRoot, { op: "set", key: k, value }));
    } catch (e) {
      toast.error("Couldn't update the permission", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const revoke = async () => {
    qc.setQueryData(
      key,
      await mcp.permissions(projectRoot, { op: "revoke", prefix: `${server.id}/` }),
    );
    toast.success(`Permissions for ${server.name} reset to "Ask"`);
  };
  if (tools.isLoading || rules.isLoading)
    return <Loader2 className="m-3 size-4 animate-spin text-muted-foreground" />;
  const current = rules.data?.rules ?? {};
  const rows = [
    ...(tools.data?.tools ?? [])
      .filter((t) => t.enabled)
      .map((t) => ({
        key: `${server.id}/${t.name}`,
        label: t.name,
        destructive: !!t.annotations?.destructiveHint && !t.annotations?.readOnlyHint,
      })),
    ...(server.resourceCount
      ? [{ key: `${server.id}/#resources`, label: "Read resources", destructive: false }]
      : []),
  ];
  return (
    <div className="space-y-3 pt-2">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" /> For this project. <strong>Ask</strong>{" "}
        shows an approval before each call. Tools the server marks as destructive always ask.
        Arguments that point outside the project are always refused.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => {
          const v = current[r.key] ?? "ask";
          return (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="font-mono text-sm">{r.label}</span>
              <div
                role="radiogroup"
                aria-label={`Permission for ${r.label}`}
                className="inline-flex rounded-md border border-border p-0.5"
              >
                {(["ask", "allow", "deny"] as const).map((opt) => (
                  <button
                    key={opt}
                    role="radio"
                    aria-checked={v === opt}
                    disabled={opt === "allow" && r.destructive}
                    title={
                      opt === "allow" && r.destructive ? "Destructive tools always ask" : undefined
                    }
                    onClick={() => void set(r.key, opt === "ask" ? null : opt)}
                    className={cn(
                      "min-h-8 rounded px-3 text-xs capitalize disabled:opacity-40",
                      v === opt
                        ? opt === "deny"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-accent font-medium"
                        : "hover:bg-accent",
                    )}
                  >
                    {opt === "allow" ? "Always allow" : opt}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        onClick={() => void revoke()}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <PlugZap className="size-4" /> Revoke all permissions for this server
      </button>
    </div>
  );
}

function Logs({ server, projectRoot }: { server: McpServerStatus; projectRoot?: string }) {
  const q = useQuery({
    queryKey: ["mcp-logs", server.key, projectRoot ?? ""],
    queryFn: () => mcp.inspect({ scope: server.scope, id: server.id, projectRoot }, "logs"),
    refetchInterval: 3000,
  });
  const lines = q.data?.logs ?? [];
  return (
    <div className="pt-2">
      <p className="mb-2 text-xs text-muted-foreground">
        The server's stderr and connection events, newest last. Secrets are masked.
      </p>
      <pre className="max-h-96 min-h-24 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] whitespace-pre-wrap">
        {lines.length ? lines.join("\n") : "Nothing yet."}
      </pre>
    </div>
  );
}
