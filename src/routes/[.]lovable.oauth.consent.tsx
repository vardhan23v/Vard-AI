import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// The Supabase JS `auth.oauth` namespace is beta; keep a local typed shim so
// we can call the three methods we need without groveling in node_modules.
type OAuthClient = { name?: string; client_id?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_uri?: string;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};
type AuthOAuth = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};
function authOAuth(): AuthOAuth {
  return (supabase.auth as unknown as { oauth: AuthOAuth }).oauth;
}

function isSameOriginPath(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage,
  // which is absent during SSR. Without this, getSession() is null on the
  // server pass and bounces already-signed-in users to /login.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) {
      throw new Error("Missing authorization_id");
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId =
      new URLSearchParams(location.search).get("authorization_id") ?? "";
    const { data, error } = await authOAuth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      throw redirect({ href: immediate });
    }
    return data;
  },
  component: ConsentScreen,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Could not load this authorization request</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function ConsentScreen() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an app";

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error } = approve
      ? await authOAuth().approveAuthorization(authorization_id)
      : await authOAuth().denyAuthorization(authorization_id);
    if (error) {
      setBusy(null);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("No redirect returned by the authorization server.");
      return;
    }
    if (isSameOriginPath(target)) {
      window.location.assign(target);
    } else {
      window.location.href = target;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-bold text-lg tracking-tight">VardAI</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            Authorize connection
          </div>
          <h1 className="mt-3 text-xl font-semibold">
            Connect {clientName} to your Vard AI account
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} will be able to call this app's enabled tools while you are signed in.
          </p>

          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Act as you when calling Vard AI's tools.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>Read your basic profile and email.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              <span>
                This does not bypass Vard AI's permissions or backend policies.
              </span>
            </li>
          </ul>

          {details?.scope && (
            <p className="mt-4 text-xs text-muted-foreground">
              Requested scope: <span className="font-mono">{details.scope}</span>
            </p>
          )}

          {error && (
            <p role="alert" className="mt-4 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button
              disabled={busy !== null}
              onClick={() => decide(true)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-60 transition-all"
            >
              {busy === "approve" && <Loader2 className="w-4 h-4 animate-spin" />}
              Approve
            </button>
            <button
              disabled={busy !== null}
              onClick={() => decide(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-foreground px-3 py-2 text-sm font-medium hover:bg-secondary/70 disabled:opacity-60 transition-all"
            >
              {busy === "deny" && <Loader2 className="w-4 h-4 animate-spin" />}
              Deny
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}