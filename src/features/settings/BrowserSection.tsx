/** Settings → Browser: Chromium, remembered sites per project, and saved screenshots and reports. */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/EmptyState";
import { browser, isTauri } from "@/lib/agent-client";
import { usePresence } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { projectPath } from "@/features/agent/projects";
import { ProjectPicker } from "@/features/agent/ProjectPicker";
import { ChromiumStatus } from "@/features/browser/ChromiumStatus";
import { Section } from "./Section";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

const RETENTION: { days: number; label: string }[] = [
  { days: 0, label: "Keep forever" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

export function BrowserSection() {
  const [projectId, setProjectId] = useState("");
  const root = projectId ? projectPath(projectId) : undefined;
  return (
    <Section
      title="Browser"
      description="The isolated headless browser agents use to test your app. It never uses your own browser profile."
    >
      {!isTauri() ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          The test browser is managed in the desktop app.
        </p>
      ) : (
        <div className="space-y-4">
          <ChromiumStatus className="rounded-lg" />
          <Retention />
          <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
            <ProjectPicker value={projectId} onChange={setProjectId} />
            {root && <ProjectBrowserSettings key={root} root={root} />}
          </div>
        </div>
      )}
    </Section>
  );
}

function Retention() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["browser-settings"],
    queryFn: () => browser.settings().then((e) => e.settings),
    retry: false,
  });
  const [saving, setSaving] = useState(false);
  const days = q.data?.artifactRetentionDays;
  // A value set elsewhere (CLI or file) that isn't one of the presets still shows.
  const options =
    days === undefined || RETENTION.some((r) => r.days === days)
      ? RETENTION
      : [...RETENTION, { days, label: `${days} days` }];
  const change = async (artifactRetentionDays: number) => {
    setSaving(true);
    try {
      const r = await browser.settings({ artifactRetentionDays });
      qc.setQueryData(["browser-settings"], r.settings);
      toast.success("Saved");
    } catch (e) {
      toast.error("Couldn't save", { description: msg(e) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <div>
        <label htmlFor="artifact-retention" className="font-medium">
          Keep screenshots and reports
        </label>
        <p className="text-xs text-muted-foreground">
          Older ones are deleted from each project's .vard/artifacts automatically.
        </p>
        {q.error && (
          <p role="alert" className="text-xs text-destructive">
            {msg(q.error)}
          </p>
        )}
      </div>
      <span className="flex items-center gap-2">
        {saving && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <select
          id="artifact-retention"
          value={days ?? ""}
          disabled={days === undefined || saving}
          onChange={(e) => void change(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          {days === undefined && <option value="">…</option>}
          {options.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function ProjectBrowserSettings({ root }: { root: string }) {
  const qc = useQueryClient();
  const origins = useQuery({
    queryKey: ["browser-origins", root],
    queryFn: () => browser.origins(root).then((e) => e.origins),
    retry: false,
  });
  const list = useMemo(() => origins.data ?? [], [origins.data]);
  const rows = usePresence(list, (o) => o);
  const [cleaning, setCleaning] = useState(false);

  const forget = async (origin: string) => {
    try {
      const r = await browser.origins(root, origin);
      qc.setQueryData(["browser-origins", root], r.origins);
    } catch (e) {
      toast.error("Couldn't remove the site", { description: msg(e) });
    }
  };
  const clean = async () => {
    if (
      !window.confirm(
        "Delete every saved screenshot and report for this project? This can't be undone.",
      )
    )
      return;
    setCleaning(true);
    try {
      const r = await browser.cleanArtifacts(root);
      void qc.invalidateQueries({ queryKey: ["artifacts", root] });
      toast.success(`Removed ${r.removed ?? 0} files`);
    } catch (e) {
      toast.error("Couldn't delete them", { description: msg(e) });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="animate-enter space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">Allowed sites</h3>
        <p className="text-xs text-muted-foreground">
          Sites you let agents open for this project, besides this Mac's dev servers. Removing one
          means the agent asks again.
        </p>
        {origins.isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : origins.error ? (
          <p role="alert" className="text-xs text-destructive">
            {msg(origins.error)}
          </p>
        ) : !rows.length ? (
          <EmptyState
            icon={<Globe className="size-5" aria-hidden />}
            text="No remembered sites for this project."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map(({ item: o, leaving }) => (
              <li
                key={o}
                aria-hidden={leaving || undefined}
                className={cn(
                  "flex animate-row-in items-center justify-between gap-2 px-3 py-1.5 transition-opacity duration-(--motion-base)",
                  leaving && "pointer-events-none opacity-0",
                )}
              >
                <span className="truncate font-mono text-xs">{o}</span>
                <button
                  onClick={() => void forget(o)}
                  aria-label={`Remove ${o}`}
                  className="press inline-flex min-h-8 items-center gap-1 rounded px-2 text-xs text-destructive hover:bg-destructive/10"
                >
                  <X className="size-3.5" aria-hidden /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Screenshots and reports are saved in this project's .vard/artifacts.
        </p>
        <button
          onClick={() => void clean()}
          disabled={cleaning}
          className="press inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
        >
          {cleaning ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-4" aria-hidden />
          )}{" "}
          Delete saved screenshots and reports
        </button>
      </div>
    </div>
  );
}
