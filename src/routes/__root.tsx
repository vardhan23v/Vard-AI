import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider, THEME_INIT_SCRIPT } from "../lib/theme";
import { BrandProvider, BRAND_INIT_SCRIPT } from "../lib/brand";

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
    const showReloadBanner = () => {
      try {
        const banner = document.createElement("div");
        banner.id = "vard-reload-banner";
        banner.setAttribute(
          "style",
          "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif;",
        );
        banner.innerHTML = `
          <div style="max-width:420px;padding:28px 32px;border-radius:20px;background:hsl(var(--card));border:1px solid hsl(var(--border));box-shadow:0 24px 60px rgba(0,0,0,0.4);text-align:center;color:hsl(var(--foreground));" role="alert" aria-live="polite">
            <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:50%;background:conic-gradient(hsl(var(--primary)) 0deg, hsl(var(--accent)) 360deg);animation:spin 1s linear infinite;mask-image:radial-gradient(circle,transparent 55%,black 56%);-webkit-mask-image:radial-gradient(circle,transparent 55%,black 56%);"></div>
            <h2 style="margin:0 0 8px;font-size:1.125rem;font-weight:600;">Updating VARD…</h2>
            <p style="margin:0 0 18px;font-size:0.9375rem;line-height:1.5;color:hsl(var(--muted-foreground));">A new version is ready. We're refreshing the page so you get the latest build.</p>
            <button style="padding:10px 20px;border-radius:999px;border:none;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font-weight:600;cursor:pointer;" onclick="window.location.reload()">Reload now</button>
          </div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        `;
        document.body.appendChild(banner);
      } catch {
        // DOM injection failed; fall back to toast only
      }
    };
    const maybeReload = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
        if (Date.now() - last < 10_000) return; // avoid reload loops
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // ignore storage errors
      }
      toast("Updating VARD…", {
        description: "A new version is ready. Reloading to get the latest build.",
      });
      showReloadBanner();
      setTimeout(() => window.location.reload(), 1400);
    };
    const onError = (e: ErrorEvent) => {
      if (e?.message && isChunkError(e.message)) maybeReload();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? "");
      if (isChunkError(msg)) maybeReload();
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
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </BrandProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
