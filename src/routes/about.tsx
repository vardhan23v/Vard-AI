import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Mic, Brain, Shield, Zap, Palette, Command } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Vard AI" },
      { name: "description", content: "Learn about Vard AI: a voice-first personal assistant built with TanStack Start, React, and Supabase." },
      { property: "og:title", content: "About — Vard AI" },
      { property: "og:description", content: "Learn about Vard AI: a voice-first personal assistant built with TanStack Start, React, and Supabase." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
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

const HIGHLIGHTS = [
  {
    icon: Mic,
    title: "Voice-first",
    description: "Talk naturally. Real-time transcription and streaming replies make conversation feel effortless.",
  },
  {
    icon: Brain,
    title: "Persistent memory",
    description: "Facts, preferences, and people are remembered across threads so Vard gets better over time.",
  },
  {
    icon: Zap,
    title: "Fast streaming",
    description: "Powered by Groq for token-by-token responses with live progress and cancel controls.",
  },
  {
    icon: Palette,
    title: "Deeply customizable",
    description: "Switch themes, accents, logos, background styles, and motion presets to make Vard yours.",
  },
  {
    icon: Command,
    title: "MCP tools",
    description: "Extensible agent integrations via the Model Context Protocol — add capabilities, not complexity.",
  },
  {
    icon: Shield,
    title: "Private by default",
    description: "Authenticated sessions, server-side secrets, and granular consent keep your data in your hands.",
  },
];

function About() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden">
        <section className="relative px-6 py-16 md:py-24 max-w-5xl mx-auto">
          <Reveal>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
          </Reveal>

          <Reveal delay={100}>
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs uppercase tracking-[0.25em] text-primary mb-6">
                <Sparkles className="w-3 h-3" />
                About Vard AI
              </div>
              <h1 className="text-4xl md:text-5xl font-light tracking-tight text-foreground mb-5">
                A personal assistant built for presence.
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Vard (Voice-Activated Responsive Director) blends the cinematic personality of Jarvis with the everyday utility of Siri. It is designed to feel less like software and more like a companion — fast, aware, and yours.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-20">
            {HIGHLIGHTS.map((item, i) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.title} delay={i * 90}>
                  <div className="group h-full rounded-2xl border border-border bg-card/40 backdrop-blur p-6 transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_60px_-20px_var(--primary)]">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 transition-transform duration-500 group-hover:scale-110">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={200}>
            <div className="rounded-3xl border border-primary/20 bg-card/40 backdrop-blur p-8 md:p-12 text-center relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]" />
              <h2 className="relative text-2xl md:text-3xl font-light tracking-tight text-foreground mb-4">
                Built with modern tools.
              </h2>
              <p className="relative text-muted-foreground max-w-xl mx-auto mb-8">
                Vard AI is built on TanStack Start, React 19, TypeScript, Tailwind CSS v4, Supabase, and Groq. Every layer is chosen for speed, type safety, and a great developer experience.
              </p>
              <div className="relative flex flex-wrap justify-center gap-3 text-xs uppercase tracking-[0.2em] text-primary/80">
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">TanStack Start</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">React 19</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">TypeScript</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">Tailwind v4</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">Supabase</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">Groq</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <div className="mt-16 text-center">
              <p className="text-sm text-muted-foreground mb-5">
                Ready to experience Vard?
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 hover:scale-105 transition-all shadow-[0_0_30px_-8px_var(--primary)]"
              >
                <Zap className="w-4 h-4" />
                Open Dashboard
              </Link>
            </div>
          </Reveal>
        </section>
      </main>
    </div>
  );
}
