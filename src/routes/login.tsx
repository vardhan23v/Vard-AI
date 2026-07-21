import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Vard AI" },
      { name: "description", content: "Sign in to Vard AI." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    setError("Auth not connected yet. Enable Lovable Cloud to sign in.");
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