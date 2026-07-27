import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Sparkles,
  Mic,
  Brain,
  Shield,
  Zap,
  Palette,
  Command,
  Github,
  ExternalLink,
  MessageSquare,
  Eye,
  MousePointer2,
  Cpu,
  Layers,
  Lock,
  Code2,
  Terminal,
} from "lucide-react";
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

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Streaming AI chat",
    items: ["Live token-by-token output", "Percentage progress indicator", "Stop / cancel / regenerate controls", "Escape-key shortcut to abort"],
  },
  {
    icon: Eye,
    title: "Theming & branding",
    items: ["Dark / light / system mode", "Multiple accent palettes", "Logo upload with crop", "Background styles & motion presets"],
  },
  {
    icon: MousePointer2,
    title: "Accessibility",
    items: ["Reduced-motion toggle + preview", "Respects system motion preference", "ARIA progress indicators", "Keyboard shortcuts"],
  },
  {
    icon: Cpu,
    title: "Architecture",
    items: ["TanStack Start v1 full-stack", "Supabase Auth & sessions", "Groq API for inference", "MCP server with OAuth tools"],
  },
];

const STACK = [
  { label: "TanStack Start", group: "Framework" },
  { label: "React 19", group: "UI" },
  { label: "TypeScript", group: "UI" },
  { label: "Tailwind CSS v4", group: "Styling" },
  { label: "Lucide React", group: "Styling" },
  { label: "Supabase Auth", group: "Auth" },
  { label: "Groq API", group: "AI / Voice" },
  { label: "Lovable AI Gateway", group: "AI / Voice" },
  { label: "MCP", group: "Tools" },
  { label: "Playwright", group: "Testing" },
];

const GROUP_COLORS: Record<string, string> = {
  Framework: "bg-foreground/10 text-foreground border-foreground/20",
  UI: "bg-primary/10 text-primary border-primary/20",
  Styling: "bg-chart-2/15 text-chart-2 border-chart-2/30",
  Auth: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  "AI / Voice": "bg-chart-4/15 text-chart-4 border-chart-4/30",
  Tools: "bg-chart-5/15 text-chart-5 border-chart-5/30",
  Testing: "bg-muted text-muted-foreground border-border",
};

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

          <Reveal delay={100}>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-light tracking-tight text-foreground mb-2">What Vard can do</h2>
              <p className="text-muted-foreground max-w-2xl">
                A quick look at the core feature groups that make up the assistant experience.
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-20">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.title} delay={i * 90}>
                  <div className="h-full rounded-2xl border border-border bg-card/40 backdrop-blur p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                    </div>
                    <ul className="space-y-2">
                      {feature.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal delay={100}>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-light tracking-tight text-foreground mb-2">Tech stack</h2>
              <p className="text-muted-foreground max-w-2xl">
                Every layer is chosen for speed, type safety, and a great developer experience.
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="rounded-2xl border border-border bg-card/40 backdrop-blur p-6 md:p-8 mb-20">
              <div className="flex flex-wrap gap-3">
                {STACK.map((tech) => (
                  <div
                    key={tech.label}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
                      GROUP_COLORS[tech.group] ?? "bg-muted text-muted-foreground border-border"
                    }`}
                    title={tech.group}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    {tech.label}
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Code2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>TanStack Start v1 with file-based routing and server functions.</span>
                </div>
                <div className="flex items-start gap-3">
                  <Layers className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>React 19 + TypeScript + Tailwind CSS v4 with CSS custom properties.</span>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Supabase Auth for authenticated sessions and protected API routes.</span>
                </div>
                <div className="flex items-start gap-3">
                  <Terminal className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Playwright regression tests for reduced-motion accessibility.</span>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={200}>
            <div className="rounded-3xl border border-primary/20 bg-card/40 backdrop-blur p-8 md:p-12 text-center relative overflow-hidden mb-20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]" />
              <h2 className="relative text-2xl md:text-3xl font-light tracking-tight text-foreground mb-4">
                Voice & chat
              </h2>
              <p className="relative text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
                Voice input is captured in the browser and sent to{" "}
                <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">/api/transcribe</code>,
                which uses the Lovable AI Gateway. The chat endpoint at{" "}
                <code className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">/api/chat</code>{" "}
                streams responses from Groq in real time. Both endpoints require an authenticated Supabase session.
              </p>
              <div className="relative flex flex-wrap justify-center gap-3 text-xs uppercase tracking-[0.2em] text-primary/80">
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">llama-3.3-70b-versatile</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">Server-sent events</span>
                <span className="px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5">AbortController</span>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mb-6">
              <h2 className="text-2xl md:text-3xl font-light tracking-tight text-foreground mb-2">Project links</h2>
              <p className="text-muted-foreground max-w-2xl">
                Follow the project or open the source on GitHub.
              </p>
            </div>
          </Reveal>

          <Reveal delay={150}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-20">
              <a
                href="https://github.com/vardhan23v/Vard-AI.git"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card/40 backdrop-blur p-5 transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_60px_-20px_var(--primary)]"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                  <Github className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">GitHub repository</h3>
                  <p className="text-xs text-muted-foreground truncate">vardhan23v/Vard-AI</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
              <a
                href="https://vard-ai.lovable.app"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card/40 backdrop-blur p-5 transition-all duration-500 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_20px_60px_-20px_var(--primary)]"
              >
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center transition-transform duration-500 group-hover:scale-110">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5">Published site</h3>
                  <p className="text-xs text-muted-foreground truncate">vard-ai.lovable.app</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
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
