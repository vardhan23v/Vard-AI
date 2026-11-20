/** Which Chromium the browser agent uses, with an Install button when there is none. */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Progress } from "@/components/ui/progress";
import { browser } from "@/lib/agent-client";
import { cn } from "@/lib/utils";
import { useBrowserState } from "./useBrowser";

export function ChromiumStatus({ className }: { className?: string }) {
  const st = useBrowserState();
  const [installing, setInstalling] = useState(false);
  const inst = st.status.data?.install;

  const doInstall = async () => {
    setInstalling(true);
    try {
      await browser.install();
      st.refresh();
      toast.success("Browser installed");
    } catch (e) {
      toast.error("Install failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInstalling(false);
    }
  };

  return (
    <section
      aria-label="Browser installation"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      {st.status.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
      ) : st.status.error ? (
        <p role="alert" className="text-sm text-destructive">
          {String(st.status.error)}
        </p>
      ) : inst?.installed ? (
        <p className="flex min-w-0 items-start gap-2 text-sm">
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 animate-scale-in text-diff-add"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="font-medium">{inst.name}</span>{" "}
            {inst.version && <span className="text-muted-foreground">({inst.version})</span>}
            <span
              className="block truncate font-mono text-xs text-muted-foreground"
              title={inst.executable}
            >
              {inst.executable}
            </span>
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            No Chromium found. Install {inst?.installable?.name} {inst?.installable?.version} (about{" "}
            {inst?.installable?.approxMB} MB) into Playwright's cache folder. Nothing is bundled
            with Vard.
          </span>
        </p>
      )}
      {inst && !inst.installed && (
        <div className="flex min-w-48 flex-col gap-1">
          <button
            onClick={() => void doInstall()}
            disabled={installing}
            className="press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {installing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}{" "}
            Install browser
          </button>
          {installing &&
            (st.install && st.install.total > 0 ? (
              <Progress
                value={(st.install.received / st.install.total) * 100}
                className="h-1.5 animate-fade-in [&>*]:transition-transform [&>*]:duration-[var(--motion-base)] [&>*]:ease-[var(--ease-out)]"
                aria-label="Download progress"
              />
            ) : (
              <div
                className="loading-bar w-full rounded-full bg-primary/20"
                role="progressbar"
                aria-label="Starting download"
              />
            ))}
        </div>
      )}
    </section>
  );
}
