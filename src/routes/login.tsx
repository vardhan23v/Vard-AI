import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authErrorMessage, signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/lib/google-auth";
import { StarField } from "@/components/StarField";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" && s.next ? { next: s.next } : {},
  component: LoginPage,
});

function isSameOriginPath(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//");
}

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary";

function LoginPage() {
  const { next } = Route.useSearch();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const safeNext = next && isSameOriginPath(next) ? next : "/chat";

  // Already signed in (or just returned from Google in the browser preview).
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) => {
        if (user) window.location.assign(safeNext);
      }),
    [safeNext],
  );

  const google = async () => {
    setLoading("google");
    setError("");
    setInfo("Finish signing in in your browser…");
    try {
      await signInWithGoogle();
    } catch (err) {
      setInfo("");
      setError(authErrorMessage(err));
      setLoading(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("email");
    setError("");
    setInfo("");

    try {
      if (isLogin) await signInWithEmail(email, password);
      else {
        await signUpWithEmail(name, email, password);
        setInfo("Account created. We sent a verification link to your email.");
      }
      // onAuthStateChanged navigates on success.
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="absolute inset-x-0 top-0 h-7" data-tauri-drag-region />
      <StarField count={64} seed={19} />
      <main className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/icon.svg" alt="" className="size-14 rounded-2xl" />
          <span className="font-heading text-xl font-semibold">Vard AI</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-xl">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            {isLogin ? "Sign in to sync your chats and projects." : "One account for chat and the coding agent."}
          </p>

          <button
            type="button"
            onClick={google}
            disabled={loading !== null}
            className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-input bg-background/60 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            {loading === "google" ? <Loader2 className="size-4 animate-spin" /> : <GoogleMark />}
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate={false}>
            {!isLogin && (
              <div>
                <label htmlFor="name" className="mb-1 block text-xs text-muted-foreground">
                  Name
                </label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required className={inputClass} />
              </div>
            )}
            <div>
              <label htmlFor="email" className="mb-1 block text-xs text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                minLength={6}
                className={inputClass}
              />
            </div>
            <div aria-live="polite">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {info && <p className="text-sm text-muted-foreground">{info}</p>}
            </div>
            <button
              type="submit"
              disabled={loading !== null}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {loading === "email" && <Loader2 className="size-4 animate-spin" />}
              {isLogin ? "Sign in with email" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setIsLogin((v) => !v);
              setError("");
              setInfo("");
            }}
            className="mt-4 min-h-9 w-full text-sm text-muted-foreground hover:text-foreground"
          >
            {isLogin ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}

/** Google's "G" mark, as Google's sign-in branding guidelines require. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
