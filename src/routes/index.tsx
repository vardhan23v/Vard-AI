import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Mic, Sparkles, Brain, Zap, Shield, Waves, Command, Cpu } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
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

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        shown ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-8 blur-sm"
      } ${className}`}
    >
      {children}
    </div>
  );
}

type Feature = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  { icon: Mic, title: "Natural voice", description: "Talk to Vard hands-free — real-time transcription and rich, spoken replies." },
  { icon: Brain, title: "Persistent memory", description: "Facts, preferences, and people — remembered across every conversation." },
  { icon: Zap, title: "Automations", description: "Recurring routines and triggers that run quietly in the background." },
  { icon: Command, title: "Shortcuts", description: "Slash commands and quick phrases to launch anything in one keystroke." },
  { icon: Waves, title: "Living orb", description: "A cinematic avatar that breathes, listens, and reacts as you speak." },
  { icon: Shield, title: "Private by default", description: "Your data stays yours — end-to-end auth with granular per-tool consent." },
];

function Home() {
  const stars = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    top: `${(i * 37) % 100}%`,
    left: `${(i * 53) % 100}%`,
    delay: `${(i % 8) * 0.4}s`,
    size: `${((i % 3) + 1) * 2}px`,
  }));
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
        <section className="min-h-screen flex flex-col items-center justify-center relative px-4 py-10">
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
              search={{ next: "" }}
              className="group flex items-center gap-2 px-6 py-3 rounded-full border border-primary/40 text-foreground hover:bg-card hover:scale-105 transition-all"
            >
              <Sparkles className="w-4 h-4 text-primary group-hover:rotate-12 transition-transform" />
              Sign in
            </Link>
          </div>
        </div>
        </section>

        {/* Scroll-reveal feature cards */}
        <section className="relative px-6 pt-4 pb-24 max-w-6xl mx-auto">
          <Reveal>
            <div className="text-center mb-14">
              <div className="text-[10px] tracking-[0.35em] uppercase text-primary/80 mb-3">
                capabilities · online
              </div>
              <h2 className="text-3xl md:text-4xl font-light tracking-tight text-foreground">
                Everything a personal assistant should be
              </h2>
              <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
                Built for speed, memory, and presence — designed to feel less like software, more like a companion.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 90}>
                  <div className="group relative h-full rounded-2xl border border-border bg-card/40 backdrop-blur p-6 overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_60px_-20px_var(--primary)]">
                    {/* animated gradient wash on hover */}
                    <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_var(--x,50%)_var(--y,0%),color-mix(in_oklab,var(--primary)_30%,transparent),transparent_60%)]" />
                    <div className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 blur-xl" />

                    <div className="relative">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                        <Icon className="w-5 h-5 text-primary transition-transform duration-500 group-hover:scale-110" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-2 tracking-tight">
                        {f.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {f.description}
                      </p>
                      <div className="mt-5 flex items-center gap-1.5 text-xs uppercase tracking-[0.25em] text-primary/70 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500">
                        Explore <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={200}>
            <div className="mt-20 rounded-3xl border border-primary/20 bg-card/40 backdrop-blur p-10 text-center relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_70%)]" />
              <Cpu className="w-8 h-8 text-primary mx-auto mb-4 relative animate-pulse" />
              <h3 className="relative text-2xl md:text-3xl font-light tracking-tight text-foreground">
                Ready when you are.
              </h3>
              <p className="relative mt-2 text-muted-foreground">
                Say the word — Vard boots up in under a second.
              </p>
              <Link
                to="/dashboard"
                className="relative mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 hover:scale-105 transition-all shadow-[0_0_30px_-8px_var(--primary)]"
              >
                <Mic className="w-4 h-4" />
                Activate Vard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
