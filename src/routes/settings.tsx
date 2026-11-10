import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, Loader2, Moon, Sun } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { AppShell } from "@/components/shell/AppShell";
import { requireAuth } from "@/lib/guard";
import { isTauri, keys, ping, type ProviderId } from "@/lib/agent-client";
import { PROVIDERS, type ProviderInfo } from "@/lib/models";
import { ACCENTS, useTheme } from "@/lib/theme";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  beforeLoad: requireAuth,
  component: () => <AppShell />,
});

// The settings content renders through AppShell's <Outlet/> via an index child.
export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-10 px-6 py-10">
        <header>
          <h1 className="text-2xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keys, models and how Vard looks.</p>
        </header>
        <ApiKeys />
        <Appearance />
        <AgentStatus />
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s-${title}`} className="space-y-4">
      <div>
        <h2 id={`s-${title}`} className="text-lg">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ApiKeys() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["key-status"], queryFn: keys.status, enabled: isTauri() });

  return (
    <Section
      title="API keys"
      description="Keys are stored in your macOS Keychain. They never leave this Mac except in requests to the provider you chose."
    >
      {!isTauri() && (
        <p className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
          Keys can only be managed in the Vard AI desktop app.
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {PROVIDERS.filter((p) => p.needsKey).map((p) => (
          <KeyRow
            key={p.id}
            provider={p}
            hint={status.data?.[p.id] ?? null}
            loading={status.isLoading}
            onChange={() => qc.invalidateQueries({ queryKey: ["key-status"] })}
          />
        ))}
      </ul>
    </Section>
  );
}

function KeyRow({
  provider,
  hint,
  loading,
  onChange,
}: {
  provider: ProviderInfo;
  hint: string | null;
  loading: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputId = `key-${provider.id}`;

  const save = async () => {
    setSaving(true);
    try {
      await keys.set(provider.id as ProviderId, value);
      setValue("");
      setEditing(false);
      onChange();
      toast.success(`${provider.label} key saved`);
    } catch (err) {
      toast.error("Key not saved", { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the ${provider.label} key from your Keychain?`)) return;
    await keys.remove(provider.id as ProviderId);
    onChange();
  };

  return (
    <li className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-sm font-medium">{provider.label}</p>
            <p className="text-xs text-muted-foreground">
              {loading ? "Checking…" : hint ? `Saved ${hint}` : "No key saved"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {provider.keyUrl && (
            <button
              type="button"
              onClick={() => (isTauri() ? openUrl(provider.keyUrl!) : window.open(provider.keyUrl, "_blank", "noopener"))}
              className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Get a key <ExternalLink className="size-3" />
            </button>
          )}
          {hint && !editing && (
            <button onClick={remove} className="min-h-9 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10">
              Remove
            </button>
          )}
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={!isTauri()}
              className="min-h-9 rounded-md border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
            >
              {hint ? "Replace" : "Add key"}
            </button>
          )}
        </div>
      </div>
      {editing && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            {provider.label} API key
          </label>
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={provider.keyHint}
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!value.trim() || saving}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setValue("");
            }}
            className="h-10 rounded-md px-3 text-sm hover:bg-accent"
          >
            Cancel
          </button>
        </form>
      )}
    </li>
  );
}

function Appearance() {
  const { mode, setMode, accent, setAccent } = useTheme();
  const motion = useMotion();
  return (
    <Section title="Appearance" description="Vard Starry Night, in dark or light.">
      <div className="space-y-5 rounded-lg border border-border bg-card p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Mode</legend>
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm capitalize",
                  mode === m ? "border-primary bg-accent" : "border-border hover:bg-accent",
                )}
              >
                {m === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />} {m}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Accent</legend>
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAccent(a.id)}
                aria-pressed={accent === a.id}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm",
                  accent === a.id ? "border-primary bg-accent" : "border-border hover:bg-accent",
                )}
              >
                <span className="size-3.5 rounded-full" style={{ background: a.swatch }} aria-hidden />
                {a.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Reduce motion</legend>
          <div className="flex gap-2">
            {(["system", "on", "off"] as const).map((v) => (
              <button
                key={v}
                onClick={() => motion.setReducedMotion(v)}
                aria-pressed={motion.reducedMotion === v}
                className={cn(
                  "min-h-10 rounded-md border px-4 text-sm capitalize",
                  motion.reducedMotion === v ? "border-primary bg-accent" : "border-border hover:bg-accent",
                )}
              >
                {v === "system" ? "Follow macOS" : v}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Section>
  );
}

function AgentStatus() {
  const q = useQuery({ queryKey: ["agent-ping"], queryFn: () => ping(), enabled: isTauri(), retry: false });
  return (
    <Section title="Agent" description="The local process that talks to models and runs tools.">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm">
        <span>
          {!isTauri()
            ? "Not available in preview mode"
            : q.isLoading
              ? "Checking…"
              : q.error
                ? `Not responding: ${q.error.message}`
                : `Running, version ${q.data}`}
        </span>
        {isTauri() && (
          <button onClick={() => q.refetch()} className="min-h-9 rounded-md border border-input px-3 hover:bg-accent">
            Check again
          </button>
        )}
      </div>
    </Section>
  );
}
