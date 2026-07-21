import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, Send, Cloud, Calendar, Music, Zap } from "lucide-react";
import { JarvisOrb, useCyclingState } from "@/components/JarvisOrb";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const QUICK = [
  { icon: Cloud, label: "What's the weather?" },
  { icon: Calendar, label: "Today's schedule" },
  { icon: Music, label: "Play focus music" },
  { icon: Zap, label: "Summarize my day" },
];

function DashboardHome() {
  const [state] = useCyclingState();
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    navigate({ to: "/dashboard/chat", search: { q: text } as never });
  };

  const status =
    state === "listening" ? "Listening…" :
    state === "thinking" ? "Thinking…" :
    state === "speaking" ? "Responding…" :
    "Tap the core, or ask anything.";

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen w-full px-4 py-10 overflow-hidden">
      {/* HUD corners */}
      <div className="pointer-events-none absolute inset-6 border border-primary/15 rounded-3xl" />
      <div className="pointer-events-none absolute top-8 left-8 text-[10px] tracking-[0.3em] uppercase text-primary/70">
        V.A.R.D · online
      </div>
      <div className="pointer-events-none absolute top-8 right-8 text-[10px] tracking-[0.3em] uppercase text-primary/70">
        core temp · nominal
      </div>

      <div className="flex flex-col items-center gap-6 mb-10">
        <JarvisOrb state={state} size={280} onClick={() => submit("Hello Vard")} />
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-light tracking-widest text-foreground">
            GOOD EVENING
          </h1>
          <p className="mt-2 text-sm uppercase tracking-[0.35em] text-primary/80">
            {status}
          </p>
        </div>
      </div>

      {/* command bar */}
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2 bg-card/70 backdrop-blur border border-primary/30 rounded-full px-4 py-2 shadow-[0_0_30px_-10px_var(--primary)]">
          <Mic className="w-4 h-4 text-primary" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(input)}
            placeholder="Ask Vard anything…"
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground py-2"
          />
          <button
            onClick={() => submit(input)}
            aria-label="Send"
            className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
          {QUICK.map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => submit(label)}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card/60 border border-border hover:border-primary/60 hover:bg-card text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <Icon className="w-3.5 h-3.5 text-primary" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}