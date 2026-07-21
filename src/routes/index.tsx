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
  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col items-center justify-center relative px-4 py-10">
        <div className="pointer-events-none absolute inset-6 border border-primary/15 rounded-3xl" />
        <div className="pointer-events-none absolute top-8 left-8 text-[10px] tracking-[0.3em] uppercase text-primary/70">
          V.A.R.D · standby
        </div>
        <div className="pointer-events-none absolute top-8 right-8 text-[10px] tracking-[0.3em] uppercase text-primary/70">
          systems · nominal
        </div>

        <div className="flex flex-col items-center gap-8">
          <JarvisOrb size={220} />
          <div className="text-center max-w-xl">
            <h1 className="text-4xl md:text-5xl font-light tracking-[0.2em] text-foreground">
              MEET VARD
            </h1>
            <p className="mt-3 text-sm uppercase tracking-[0.35em] text-primary/80">
              Your personal AI assistant
            </p>
            <p className="mt-5 text-muted-foreground text-base leading-relaxed">
              A Siri and Jarvis-style companion — always listening, always ready.
              Ask by voice, ask by text, get things done at the speed of thought.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium hover:brightness-110 transition-all shadow-[0_0_30px_-8px_var(--primary)]"
            >
              <Mic className="w-4 h-4" />
              Activate Vard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 px-6 py-3 rounded-full border border-primary/40 text-foreground hover:bg-card transition-all"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
