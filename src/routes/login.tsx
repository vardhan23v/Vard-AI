import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Vard AI" },
      { name: "description", content: "Sign in to Vard AI." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
  }),
  component: LoginPage,
});

function isSameOriginPath(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

function LoginPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const safeNext = next && isSameOriginPath(next) ? next : "/dashboard";

  // If a session already exists (e.g. the user was sent here from the consent
  // route after signing in in another tab), forward them to their destination.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) window.location.assign(safeNext);
    });
    return () => {
      cancelled = true;
    };
  }, [safeNext]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      window.location.assign(safeNext);
      return;
    }

    const emailRedirectTo = `${window.location.origin}${safeNext}`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: name ? { name } : undefined,
        emailRedirectTo,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      window.location.assign(safeNext);
      return;
    }
    setInfo("Check your email to confirm your account, then sign in.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-3 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="font-bold text-lg">VardAI</span>
        </Link>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h1 className="text-xl font-semibold mb-1">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {isLogin ? "Sign in to continue." : "Get started with Vard AI."}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {!isLogin && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            )}
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              required
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              required
              minLength={6}
              className="w-full rounded-lg bg-secondary border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:brightness-110 transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? "Sign in" : "Sign up"}
            </button>
          </form>

          <button
            onClick={() => setIsLogin((v) => !v)}
            className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isLogin ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}