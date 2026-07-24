import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider, THEME_INIT_SCRIPT } from "../lib/theme";
import { BrandProvider, BRAND_INIT_SCRIPT } from "../lib/brand";
import { MotionProvider, MOTION_INIT_SCRIPT } from "../lib/motion";
import { Toaster } from "../components/ui/sonner";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Vard AI | The Developer Intelligence Platform" },
      { name: "description", content: "Your AI Engineering Partner. The AI Operating System for Developers." },
      { name: "author", content: "Vard AI" },
      { property: "og:title", content: "Vard AI | The Developer Intelligence Platform" },
      { property: "og:description", content: "Your AI Engineering Partner. The AI Operating System for Developers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@VardAI" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BRAND_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

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
          "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif;",
        );
        const esc = (s: string) =>
          s.replace(/[&<>"']/g, (c) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
          );
        const chunkName = failedUrl ? failedUrl.split("/").pop()!.split("?")[0] : "unknown chunk";
        banner.innerHTML = `
          <div style="max-width:420px;padding:28px 32px;border-radius:20px;background:hsl(var(--card));border:1px solid hsl(var(--border));box-shadow:0 24px 60px rgba(0,0,0,0.4);text-align:center;color:hsl(var(--foreground));" role="alert" aria-live="polite">
            <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:conic-gradient(hsl(var(--primary)) 0deg, hsl(var(--accent)) 360deg);animation:spin 1s linear infinite;mask-image:radial-gradient(circle,transparent 55%,black 56%);-webkit-mask-image:radial-gradient(circle,transparent 55%,black 56%);"></div>
            <h2 style="margin:0 0 8px;font-size:1.125rem;font-weight:600;">Updating VARD…</h2>
            <p id="vard-reload-msg" style="margin:0 0 18px;font-size:0.9375rem;line-height:1.5;color:hsl(var(--muted-foreground));">A new version is ready. Reloading in <span id="vard-reload-count" style="font-weight:600;color:hsl(var(--foreground));">5</span>s.</p>
            <details style="margin:0 0 16px;text-align:left;font-size:0.8125rem;color:hsl(var(--muted-foreground));background:hsl(var(--muted)/0.4);border:1px solid hsl(var(--border));border-radius:10px;padding:10px 12px;">
              <summary style="cursor:pointer;font-weight:600;color:hsl(var(--foreground));list-style:none;">Failed chunk: <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.75rem;">${esc(chunkName)}</code></summary>
              <div style="margin-top:8px;word-break:break-all;">
                ${failedUrl ? `<div style="margin-bottom:6px;"><span style="opacity:0.7;">URL:</span> <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.7rem;">${esc(failedUrl)}</code></div>` : ""}
                <div><span style="opacity:0.7;">Error:</span> <code style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.7rem;">${esc(errorMessage)}</code></div>
              </div>
            </details>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <button id="vard-reload-retry" style="padding:10px 20px;border-radius:999px;border:1px solid hsl(var(--border));background:hsl(var(--accent));color:hsl(var(--accent-foreground));font-weight:600;cursor:pointer;">Try again now</button>
              <button id="vard-reload-copy" style="padding:10px 20px;border-radius:999px;border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--foreground));font-weight:600;cursor:pointer;">Copy details</button>
              <button id="vard-reload-now" style="padding:10px 20px;border-radius:999px;border:none;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-weight:600;cursor:pointer;">Reload now</button>
              <button id="vard-reload-cancel" style="padding:10px 20px;border-radius:999px;border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--foreground));font-weight:600;cursor:pointer;">Stay on page</button>
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
        <BrandProvider>
          <MotionProvider>
            <RouteTransition>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            </RouteTransition>
            <Toaster />
          </MotionProvider>
        </BrandProvider>
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
