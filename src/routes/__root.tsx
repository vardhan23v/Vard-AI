import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { ThemeProvider } from "../lib/theme";
import { MotionProvider } from "../lib/motion";
import { Toaster } from "../components/ui/sonner";
import { BOOT_LOG_PATH, bootLog, mark } from "../lib/boot";
import { StartupTimeoutError } from "../lib/guard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function SlowStart({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center animate-enter" role="alert">
        <img src="/icon.svg" alt="" className="mx-auto mb-4 size-12 rounded-xl" />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Vard is taking longer than usual to start
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your saved session hasn't loaded yet. Try again, or reload the window. If this keeps
          happening, the startup log is in{" "}
          <code className="font-mono text-xs">{BOOT_LOG_PATH}</code>.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={onRetry}
            className="press inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="press inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Reload window
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    bootLog(`route error ${error.name}: ${error.message}`);
  }, [error]);
  if (error instanceof StartupTimeoutError || error.name === "StartupTimeoutError") {
    return (
      <SlowStart
        onRetry={() => {
          router.invalidate();
          reset();
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again, or go back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => mark("first-render"), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const RELOAD_KEY = "__vard_chunk_reload_at";
    const isChunkError = (msg: string) =>
      /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
        msg,
      );
    const extractChunkUrl = (msg: string): string | null => {
      const m = msg.match(/https?:\/\/[^\s'")]+\.m?js(?:\?[^\s'")]*)?/i);
      return m ? m[0] : null;
    };
    const showReloadBanner = (failedUrl: string | null, errorMessage: string) => {
      try {
        const banner = document.createElement("div");
        banner.id = "vard-reload-banner";
        banner.setAttribute(
          "style",
          "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:color-mix(in oklab, var(--background) 85%, transparent);backdrop-filter:blur(8px);font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif;",
        );
        const esc = (s: string) =>
          s.replace(
            /[&<>"']/g,
            (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
          );
        const chunkName = failedUrl ? failedUrl.split("/").pop()!.split("?")[0] : "unknown chunk";
        banner.innerHTML = `
          <div style="max-width:420px;padding:28px 32px;border-radius:20px;background:var(--card);border:1px solid var(--border);box-shadow:0 24px 60px color-mix(in oklab, var(--background) 60%, transparent);text-align:center;color:var(--foreground);" role="alert" aria-live="polite">
            <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:conic-gradient(var(--primary) 0deg, var(--accent) 360deg);animation:spin 1s linear infinite;mask-image:radial-gradient(circle,transparent 55%,black 56%);-webkit-mask-image:radial-gradient(circle,transparent 55%,black 56%);"></div>
            <h2 style="margin:0 0 8px;font-size:1.125rem;font-weight:600;">Updating VARD…</h2>
            <p id="vard-reload-msg" style="margin:0 0 18px;font-size:0.9375rem;line-height:1.5;color:var(--muted-foreground);">A new version is ready. Reloading in <span id="vard-reload-count" style="font-weight:600;color:var(--foreground);">5</span>s.</p>
            <details style="margin:0 0 16px;text-align:left;font-size:0.8125rem;color:var(--muted-foreground);background:color-mix(in oklab, var(--muted) 40%, transparent);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
              <summary style="cursor:pointer;font-weight:600;color:var(--foreground);list-style:none;">Failed chunk: <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.75rem;">${esc(chunkName)}</code></summary>
              <div style="margin-top:8px;word-break:break-all;">
                ${failedUrl ? `<div style="margin-bottom:6px;"><span style="opacity:0.7;">URL:</span> <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.7rem;">${esc(failedUrl)}</code></div>` : ""}
                <div><span style="opacity:0.7;">Error:</span> <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.7rem;">${esc(errorMessage)}</code></div>
              </div>
            </details>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <button id="vard-reload-retry" style="padding:10px 20px;border-radius:999px;border:1px solid var(--border);background:var(--accent);color:var(--accent-foreground);font-weight:600;cursor:pointer;">Try again now</button>
              <button id="vard-reload-copy" style="padding:10px 20px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--foreground);font-weight:600;cursor:pointer;">Copy details</button>
              <button id="vard-reload-now" style="padding:10px 20px;border-radius:999px;border:none;background:var(--primary);color:var(--primary-foreground);font-weight:600;cursor:pointer;">Reload now</button>
              <button id="vard-reload-cancel" style="padding:10px 20px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--foreground);font-weight:600;cursor:pointer;">Stay on page</button>
            </div>
          </div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        `;
        document.body.appendChild(banner);
      } catch {
        // DOM injection failed; fall back to toast only
      }
    };
    const maybeReload = (failedUrl: string | null, errorMessage: string) => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
        if (Date.now() - last < 10_000) return; // avoid reload loops
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // ignore storage errors
      }
      toast("Updating VARD…", {
        description: failedUrl
          ? `Failed chunk: ${failedUrl.split("/").pop()!.split("?")[0]}`
          : errorMessage,
      });
      showReloadBanner(failedUrl, errorMessage);
      let remaining = 5;
      const countEl = document.getElementById("vard-reload-count");
      const msgEl = document.getElementById("vard-reload-msg");
      const nowBtn = document.getElementById("vard-reload-now");
      const cancelBtn = document.getElementById("vard-reload-cancel");
      const retryBtn = document.getElementById("vard-reload-retry") as HTMLButtonElement | null;
      const copyBtn = document.getElementById("vard-reload-copy") as HTMLButtonElement | null;
      const banner = document.getElementById("vard-reload-banner");
      const interval = window.setInterval(() => {
        remaining -= 1;
        if (countEl) countEl.textContent = String(remaining);
        if (remaining <= 0) {
          window.clearInterval(interval);
          window.location.reload();
        }
      }, 1000);
      nowBtn?.addEventListener("click", () => {
        window.clearInterval(interval);
        window.location.reload();
      });
      cancelBtn?.addEventListener("click", () => {
        window.clearInterval(interval);
        banner?.remove();
      });
      retryBtn?.addEventListener("click", async () => {
        if (!failedUrl) {
          window.clearInterval(interval);
          window.location.reload();
          return;
        }
        window.clearInterval(interval);
        const originalLabel = retryBtn.textContent;
        retryBtn.disabled = true;
        retryBtn.textContent = "Retrying…";
        if (msgEl) msgEl.textContent = "Re-fetching the latest module…";
        try {
          const bust = `${failedUrl}${failedUrl.includes("?") ? "&" : "?"}retry=${Date.now()}`;
          await import(/* @vite-ignore */ bust);
          toast.success("Recovered", { description: "Module loaded successfully." });
          banner?.remove();
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            // ignore
          }
        } catch {
          if (msgEl)
            msgEl.textContent = "Still failing. A full reload is needed to get the latest build.";
          retryBtn.disabled = false;
          retryBtn.textContent = originalLabel ?? "Try again now";
        }
      });
      copyBtn?.addEventListener("click", async () => {
        const chunkName = failedUrl ? failedUrl.split("/").pop()!.split("?")[0] : "unknown chunk";
        const details = [
          `Failed chunk: ${chunkName}`,
          failedUrl ? `URL: ${failedUrl}` : "URL: (unavailable)",
          `Error: ${errorMessage}`,
          `Time: ${new Date().toISOString()}`,
        ].join("\n");
        try {
          await navigator.clipboard.writeText(details);
          const originalLabel = copyBtn.textContent;
          copyBtn.textContent = "Copied!";
          window.setTimeout(() => {
            copyBtn.textContent = originalLabel ?? "Copy details";
          }, 2000);
        } catch {
          toast.error("Could not copy", { description: "Clipboard access was blocked." });
        }
      });
    };
    const onError = (e: ErrorEvent) => {
      if (e?.message && isChunkError(e.message)) maybeReload(extractChunkUrl(e.message), e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      if (isChunkError(msg)) maybeReload(extractChunkUrl(msg), msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionProvider>
          <RouteTransition>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </RouteTransition>
          <Toaster />
        </MotionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div key={pathname} className="route-transition">
      {children}
    </div>
  );
}
