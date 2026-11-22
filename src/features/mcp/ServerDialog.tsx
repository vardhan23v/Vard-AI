/**
 * Add or edit an MCP server: local (stdio: command, args, folder, env) or remote (Streamable
 * HTTP: URL, auth, headers). Secret values go straight to the Keychain through the agent and are
 * never shown again; leaving a stored secret blank keeps it.
 */
import { useState } from "react";
import { Eye, EyeOff, Loader2, Plus, Server, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { mcp, type McpScope, type McpServerStatus, type McpTestResult } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

type EnvRow = { name: string; value: string; secret: boolean; stored?: boolean };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function ServerDialog({
  open,
  onOpenChange,
  scope,
  projectRoot,
  existing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: McpScope;
  projectRoot?: string;
  existing?: McpServerStatus;
  onSaved: () => void;
}) {
  const cfg = existing?.config;
  const [kind, setKind] = useState<"stdio" | "http">(cfg?.transport.type ?? "stdio");
  const [name, setName] = useState(cfg?.name ?? "");
  const [id, setId] = useState(cfg?.id ?? "");
  const [idTouched, setIdTouched] = useState(!!cfg);
  const [description, setDescription] = useState(cfg?.description ?? "");
  const [enabled, setEnabled] = useState(cfg?.enabled ?? true);
  const stdio = cfg?.transport.type === "stdio" ? cfg.transport : undefined;
  const http = cfg?.transport.type === "http" ? cfg.transport : undefined;
  const stored = new Set(existing?.secrets.filter((s) => s.set).map((s) => s.name));
  const [command, setCommand] = useState(stdio?.command ?? "");
  const [args, setArgs] = useState((stdio?.args ?? []).join("\n"));
  const [cwd, setCwd] = useState(stdio?.cwd ?? "");
  const [env, setEnv] = useState<EnvRow[]>(
    Object.entries(stdio?.env ?? {}).map(([k, v]) =>
      "secret" in v
        ? { name: k, value: "", secret: true, stored: stored.has(k) }
        : { name: k, value: v.value, secret: false },
    ),
  );
  const [url, setUrl] = useState(http?.url ?? "");
  const [auth, setAuth] = useState<"none" | "bearer" | "oauth">(http?.auth ?? "none");
  const [token, setToken] = useState("");
  const [headers, setHeaders] = useState<EnvRow[]>(
    Object.keys(http?.headers ?? {}).map((h) => ({
      name: h,
      value: "",
      secret: true,
      stored: stored.has(`header:${h}`),
    })),
  );
  const [startup, setStartup] = useState(Math.round((cfg?.timeouts.startupMs ?? 20000) / 1000));
  const [request, setRequest] = useState(Math.round((cfg?.timeouts.requestMs ?? 60000) / 1000));
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [test, setTest] = useState<McpTestResult | null>(null);
  const [showValues, setShowValues] = useState(false);

  const serverId = idTouched ? id : slug(name);

  const build = () => ({
    id: serverId,
    name: name.trim(),
    ...(description.trim() ? { description: description.trim() } : {}),
    enabled,
    disabledTools: cfg?.disabledTools ?? [],
    timeouts: { startupMs: startup * 1000, requestMs: request * 1000 },
    transport:
      kind === "stdio"
        ? {
            type: "stdio" as const,
            command: command.trim(),
            args: args
              .split("\n")
              .map((a) => a.trim())
              .filter(Boolean),
            ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
            env: Object.fromEntries(
              env
                .filter((e) => e.name.trim())
                .map((e) => [
                  e.name.trim(),
                  e.secret ? { secret: true as const } : { value: e.value },
                ]),
            ),
          }
        : {
            type: "http" as const,
            url: url.trim(),
            auth,
            headers: Object.fromEntries(
              headers
                .filter((h) => h.name.trim())
                .map((h) => [h.name.trim(), { secret: true as const }]),
            ),
          },
  });

  /** Stores the secret values typed in this dialog (blank keeps what's stored). */
  const storeSecrets = async () => {
    const ref = { scope, id: serverId, projectRoot };
    const jobs: Promise<unknown>[] = [];
    if (kind === "stdio")
      for (const e of env)
        if (e.secret && e.name.trim() && e.value)
          jobs.push(mcp.setSecret(ref, e.name.trim(), e.value));
    if (kind === "http") {
      for (const h of headers)
        if (h.name.trim() && h.value)
          jobs.push(mcp.setSecret(ref, `header:${h.name.trim()}`, h.value));
      if (auth === "bearer" && token) jobs.push(mcp.setSecret(ref, "token", token));
    }
    await Promise.all(jobs);
  };

  const valid =
    name.trim() &&
    /^[a-z0-9][a-z0-9-]{0,39}$/.test(serverId) &&
    (kind === "stdio" ? command.trim() : url.trim());

  const runTest = async () => {
    setBusy("test");
    setTest(null);
    try {
      await storeSecrets();
      setTest(await mcp.test({ scope, id: serverId, projectRoot }, build()));
    } catch (e) {
      toast.error("Test failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await mcp.save(scope, build(), { projectRoot, replaceId: cfg?.id });
      await storeSecrets();
      toast.success(existing ? "Server updated" : "Server added", {
        description: enabled ? "Connect it from its card." : "It's disabled until you turn it on.",
      });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't save the server", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const field = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Add an MCP server"}</DialogTitle>
          <DialogDescription>
            {scope === "global"
              ? "Available in every project."
              : "Only for this project (saved in .vard/mcp.json)."}{" "}
            Secrets go to your macOS Keychain.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Server type" className="grid grid-cols-2 gap-2">
          {(
            [
              ["stdio", "Local", "A program on this Mac (stdio)", Server],
              ["http", "Remote", "A URL (Streamable HTTP)", Wifi],
            ] as const
          ).map(([k, label, hint, Icon]) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              disabled={!!existing}
              onClick={() => setKind(k)}
              className={cn(
                "flex min-h-14 items-start gap-2 rounded-md border px-3 py-2 text-left disabled:opacity-60",
                kind === k ? "border-primary bg-accent" : "border-border hover:bg-accent",
              )}
            >
              <Icon className="mt-0.5 size-4 text-agent-foreground" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Name</span>
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="GitHub"
              autoFocus
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>ID (used in tool names)</span>
            <input
              className={cn(field, "font-mono")}
              value={serverId}
              disabled={!!existing}
              onChange={(e) => {
                setIdTouched(true);
                setId(e.target.value);
              }}
              placeholder="github"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Description (optional)</span>
            <input
              className={field}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </div>

        {kind === "stdio" ? (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span>Command</span>
              <input
                className={cn(field, "font-mono")}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Arguments (one per line)</span>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={"-y\n@modelcontextprotocol/server-everything"}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>
                Working directory (optional{scope === "project" ? ", inside the project" : ""})
              </span>
              <input
                className={cn(field, "font-mono")}
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="."
              />
            </label>
            <Rows
              title="Environment variables"
              hint="Only these reach the server (plus PATH, HOME and similar). Mark keys and tokens as secret."
              rows={env}
              setRows={setEnv}
              allowPlain
              show={showValues}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1 text-sm">
              <span>Server URL</span>
              <input
                className={cn(field, "font-mono")}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mcp.example.com/mcp"
              />
            </label>
            <div className="block space-y-1 text-sm">
              <span id="server-auth-label">Authentication</span>
              <Select value={auth} onValueChange={(v) => setAuth(v as typeof auth)}>
                <SelectTrigger aria-labelledby="server-auth-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer token</SelectItem>
                  <SelectItem value="oauth">OAuth (sign in in the browser)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {auth === "bearer" && (
              <label className="block space-y-1 text-sm">
                <span>
                  Token{" "}
                  {stored.has("token") && (
                    <span className="text-xs text-muted-foreground">
                      (stored · leave blank to keep)
                    </span>
                  )}
                </span>
                <input
                  type={showValues ? "text" : "password"}
                  autoComplete="off"
                  className={cn(field, "font-mono")}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
            )}
            {auth === "oauth" && (
              <p className="text-xs text-muted-foreground">
                After saving, use Authorize on the server card to sign in. Tokens are kept in your
                Keychain.
              </p>
            )}
            <Rows
              title="Headers"
              hint="Sent with every request; values are stored as secrets."
              rows={headers}
              setRows={setHeaders}
              show={showValues}
            />
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Timeouts</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span>Startup (s)</span>
              <input
                type="number"
                min={1}
                max={120}
                className={field}
                value={startup}
                onChange={(e) => setStartup(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span>Each request (s)</span>
              <input
                type="number"
                min={1}
                max={600}
                className={field}
                value={request}
                onChange={(e) => setRequest(Number(e.target.value))}
              />
            </label>
          </div>
        </details>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
          </label>
          <button
            type="button"
            onClick={() => setShowValues((v) => !v)}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
          >
            {showValues ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}{" "}
            {showValues ? "Hide" : "Show"} typed values
          </button>
        </div>

        {test && (
          <div
            role="status"
            className={cn(
              "rounded-md border p-3 text-sm",
              test.ok ? "border-success/40" : "border-destructive/40",
            )}
          >
            {test.ok ? (
              <p>
                Connected to <strong>{test.serverInfo?.name ?? "the server"}</strong>{" "}
                {test.serverInfo?.version} · protocol {test.protocolVersion} · {test.tools} tools,{" "}
                {test.resources} resources, {test.prompts} prompts.
              </p>
            ) : (
              <p className="text-destructive">{test.error}</p>
            )}
            {test.logs.length > 0 && (
              <pre className="mt-2 max-h-28 overflow-auto font-mono text-[11px] text-muted-foreground">
                {test.logs.join("\n")}
              </pre>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <button
            onClick={() => void runTest()}
            disabled={!valid || !!busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-input px-4 text-sm hover:bg-accent disabled:opacity-50"
          >
            {busy === "test" && <Loader2 className="size-4 animate-spin" />} Test connection
          </button>
          <button
            onClick={() => void save()}
            disabled={!valid || !!busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "save" && <Loader2 className="size-4 animate-spin" />}{" "}
            {existing ? "Save" : "Add server"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rows({
  title,
  hint,
  rows,
  setRows,
  allowPlain,
  show,
}: {
  title: string;
  hint: string;
  rows: EnvRow[];
  setRows: (r: EnvRow[]) => void;
  allowPlain?: boolean;
  show: boolean;
}) {
  const update = (i: number, patch: Partial<EnvRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm">{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Name"
            className="h-9 w-40 rounded-md border border-input bg-background px-2 font-mono text-xs"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="NAME"
          />
          <input
            aria-label="Value"
            type={r.secret && !show ? "password" : "text"}
            autoComplete="off"
            className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
            value={r.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder={r.stored ? "•••• stored (leave blank to keep)" : "value"}
          />
          {allowPlain && (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={r.secret}
                onChange={(e) => update(i, { secret: e.target.checked })}
              />{" "}
              secret
            </label>
          )}
          <button
            type="button"
            aria-label="Remove"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { name: "", value: "", secret: true }])}
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent"
      >
        <Plus className="size-3.5" /> Add
      </button>
    </fieldset>
  );
}
