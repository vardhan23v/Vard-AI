import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Mic, MicOff, Loader2, Newspaper, Home as HomeIcon, ShieldCheck, Sparkles } from "lucide-react";
import { useCyclingState } from "@/components/JarvisOrb";
import { useVoiceInput } from "@/lib/voice-input";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const QUICK = [
  { icon: Newspaper, label: "Briefing" },
  { icon: ShieldCheck, label: "Security" },
  { icon: HomeIcon, label: "Smart Home" },
  { icon: Sparkles, label: "Ideas" },
];

function DashboardHome() {
  const [state] = useCyclingState();
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const voice = useVoiceInput((text) => setInput(text));

  const submit = (q: string) => {
    const text = q.trim();
    if (!text) return;
    navigate({ to: "/dashboard/chat", search: { q: text } as never });
  };

  return (
    <div
      className="relative flex flex-col items-center justify-between min-h-screen w-full px-6 py-8 overflow-hidden"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Ambient nebula gradients */}
      <div className="pointer-events-none absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-primary/20 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[420px] h-[420px] rounded-full bg-accent/20 blur-[120px]" />

      {/* HUD corner labels (mono) */}
      <div
        className="absolute top-6 left-6 text-[9px] tracking-[0.3em] text-primary/70"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        OS_VER: 2.4.0
      </div>
      <div
        className="absolute top-6 right-6 text-[9px] tracking-[0.3em] text-primary/70 text-right"
        style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
      >
        VAR_A7_CORE
      </div>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 w-full z-10">
        <div className="text-center space-y-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-[0.35em]">
            Systems Ready
          </p>
          <h1 className="text-3xl md:text-4xl font-light text-foreground tracking-tight">
            Hello, Vard.
          </h1>
        </div>

        {/* Nebula Orb */}
        <button
          type="button"
          onClick={() => submit("Hello Vard")}
          aria-label="Activate Vard"
          className="relative w-64 h-64 md:w-72 md:h-72 flex items-center justify-center group"
        >
          {/* soft cinematic backdrops */}
          <div className="absolute inset-0 rounded-full bg-primary/10 blur-[80px] animate-pulse" />
          <div className="absolute w-44 h-44 rounded-full bg-accent/20 blur-[60px]" />

          {/* outer decorative rings */}
          <div className="absolute w-56 h-56 rounded-full border border-primary/15" />
          <div className="absolute w-64 h-64 rounded-full border-t-2 border-primary/30 rotate-45 animate-orb-spin" />
          <div className="absolute w-48 h-48 rounded-full border border-dashed border-accent/20 animate-orb-spin-rev" />

          {/* orb gradient border */}
          <div className="relative w-40 h-40 rounded-full p-[1px] bg-gradient-to-tr from-primary/60 via-white/25 to-accent/60 orb-glow transition-transform duration-500 group-hover:scale-105">
            <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden relative">
              {/* fluid gradient interior */}
              <div
                className="absolute inset-0 opacity-90 animate-orb-pulse"
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, oklch(0.92 0.15 170 / 0.95), transparent 55%), radial-gradient(circle at 70% 75%, oklch(0.78 0.18 190 / 0.9), transparent 55%), radial-gradient(circle at 50% 50%, oklch(0.32 0.08 200 / 0.9), transparent 70%)",
                }}
              />
              {/* glass reflection */}
              <div className="absolute -top-3 -left-3 w-20 h-20 bg-white/25 blur-lg rounded-full" />
              {/* subtle inner core */}
              <div className="w-16 h-16 rounded-full bg-white/10 blur-md" />
            </div>
          </div>

          {(state === "listening" || voice.status === "recording") && (
            <div className="absolute w-56 h-56 rounded-full border border-primary/40 animate-ring" />
          )}
        </button>

        {/* quick action chips */}
        <div className="flex flex-wrap justify-center gap-2 max-w-md">
          {QUICK.map(({ icon: Icon, label }) => (
            <button
              key={label}
              onClick={() => submit(label)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-border hover:border-primary/50 hover:bg-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all backdrop-blur-sm"
            >
              <Icon className="w-3 h-3 text-primary" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Command bar */}
      <div className="w-full max-w-xl z-10">
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-primary/10 blur-2xl" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(input)}
            placeholder={
              voice.status === "recording" ? "Listening…" :
              voice.status === "transcribing" ? "Transcribing…" :
              "Enter command or tap the mic…"
            }
            className="relative w-full bg-white/[0.03] border border-border rounded-2xl py-4 pl-6 pr-14 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary/50 focus:bg-white/[0.05] transition-all backdrop-blur-md"
          />
          <button
            onClick={voice.toggle}
            disabled={voice.status === "transcribing"}
            aria-label={voice.status === "recording" ? "Stop recording" : "Start voice input"}
            className={`absolute right-2 p-2.5 rounded-xl text-primary-foreground active:scale-95 transition-all shadow-[0_0_24px_-4px_var(--primary)] disabled:opacity-60 ${
              voice.status === "recording"
                ? "bg-destructive animate-pulse"
                : "bg-primary hover:brightness-110"
            }`}
          >
            {voice.status === "transcribing" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : voice.status === "recording" ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
        </div>
        {voice.error && (
          <p className="mt-2 text-xs text-destructive/90 text-center">{voice.error}</p>
        )}
        {input && voice.status !== "recording" && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={() => submit(input)}
              className="px-4 py-1.5 rounded-full bg-primary/20 border border-primary/40 text-xs uppercase tracking-wider text-primary hover:bg-primary/30 transition-all"
            >
              Send to Vard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}