import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mic, Sparkles } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { JarvisOrb } from "@/components/JarvisOrb";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vard — Your Personal AI Assistant" },
      { name: "description", content: "A Siri and Jarvis-style personal AI assistant. Talk to Vard by voice or text." },
      { property: "og:title", content: "Vard — Your Personal AI Assistant" },
      { property: "og:description", content: "A Siri and Jarvis-style personal AI assistant. Talk to Vard by voice or text." },
    ],
  }),
  component: Home,
});

function Home() {
  const stars = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    top: `${(i * 37) % 100}%`,
    left: `${(i * 53) % 100}%`,
    delay: `${(i % 8) * 0.4}s`,
    size: `${((i % 3) + 1) * 2}px`,
  }));
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center relative px-4 py-10 overflow-hidden">
        {/* animated ambient blobs */}
        <div className="pointer-events-none absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-primary/25 blur-[120px] animate-drift" />
        <div
          className="pointer-events-none absolute -bottom-32 -right-24 w-[460px] h-[460px] rounded-full bg-accent/20 blur-[120px] animate-drift"
          style={{ animationDelay: "3s" }}
        />

        {/* twinkling stars */}
        {stars.map((s) => (
          <span
            key={s.id}
            className="pointer-events-none absolute rounded-full bg-primary/70 animate-twinkle"
            style={{
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
            }}
          />
        ))}

        <div className="pointer-events-none absolute inset-6 border border-primary/15 rounded-3xl" />
        <div className="pointer-events-none absolute top-8 left-8 text-[10px] tracking-[0.3em] uppercase text-primary/70 animate-fade-up">
          V.A.R.D · standby
        </div>
        <div
          className="pointer-events-none absolute top-8 right-8 text-[10px] tracking-[0.3em] uppercase text-primary/70 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          systems · nominal
        </div>

        <div className="flex flex-col items-center gap-8 relative z-10">
          <div className="animate-float">
            <JarvisOrb size={220} />
          </div>
          <div className="text-center max-w-xl">
            <h1
              className="text-4xl md:text-5xl font-light tracking-[0.2em] animate-fade-up bg-clip-text text-transparent animate-shimmer"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--foreground), var(--primary), var(--accent), var(--foreground))",
              }}
            >
              MEET VARD
            </h1>
            <p
              className="mt-3 text-sm uppercase tracking-[0.35em] text-primary/80 animate-fade-up"
              style={{ animationDelay: "0.15s" }}
            >
              Your personal AI assistant
            </p>
            <p
              className="mt-5 text-muted-foreground text-base leading-relaxed animate-fade-up"
              style={{ animationDelay: "0.3s" }}
            >
              A Siri and Jarvis-style companion — always listening, always ready.
              Ask by voice, ask by text, get things done at the speed of thought.
            </p>
          </div>

          <div
            className="flex flex-col sm:flex-row items-center gap-3 animate-fade-up"
            style={{ animationDelay: "0.45s" }}
          >
            <Link
              to="/dashboard"
              className="group flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 hover:scale-105 transition-all shadow-[0_0_30px_-8px_var(--primary)]"
            >
              <Mic className="w-4 h-4 group-hover:animate-pulse" />
              Activate Vard
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/login"
              className="group flex items-center gap-2 px-6 py-3 rounded-full border border-primary/40 text-foreground hover:bg-card hover:scale-105 transition-all"
            >
              <Sparkles className="w-4 h-4 text-primary group-hover:rotate-12 transition-transform" />
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
