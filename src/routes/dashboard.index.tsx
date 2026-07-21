import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Mic, MicOff, Loader2, Send, Search, Command,
  Mail, CalendarClock, BarChart3, Zap, ArrowUpRight,
} from "lucide-react";
import { useVoiceInput } from "@/lib/voice-input";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

const ACTIONS = [
  { icon: Mail, label: "Draft Email", tone: "indigo" },
  { icon: CalendarClock, label: "Schedule", tone: "cyan" },
  { icon: BarChart3, label: "Analyze Data", tone: "violet" },
] as const;

const AGENDA = [
  { title: "Product Sync", time: "10:00 AM", color: "bg-primary" },
  { title: "Design Review", time: "1:30 PM", color: "bg-accent/70" },
  { title: "1:1 with Priya", time: "4:00 PM", color: "bg-primary/50" },
];

function DashboardHome() {
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
      className="relative min-h-screen w-full overflow-hidden"
      style={{ fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Ambient aurora backdrop */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-primary/25 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/3 -right-40 w-[480px] h-[480px] rounded-full bg-accent/20 blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/3 w-[460px] h-[460px] rounded-full bg-primary/15 blur-[140px]" />

      <main className="relative z-10 flex flex-col min-h-screen p-6 lg:p-10 pb-40">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
          {/* Top bento row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:h-[440px]">
            {/* Hero orb tile */}
            <button
              type="button"
              onClick={() => submit("Hello Vard")}
              className="lg:col-span-8 relative overflow-hidden rounded-[2rem] border border-border bg-card/40 backdrop-blur-md shadow-2xl flex items-center justify-center group min-h-[360px] text-left"
              aria-label="Activate Vard"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px)] [background-size:44px_44px]" />
              <div className="relative w-64 h-64 transition-transform duration-500 group-hover:scale-[1.03]">
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-accent via-primary to-accent blur-3xl opacity-50 animate-pulse" />
                <div className="absolute inset-4 rounded-full border border-border backdrop-blur-2xl overflow-hidden shadow-[inset_0_0_60px_color-mix(in_oklab,var(--foreground)_15%,transparent)] flex items-center justify-center">
                  <div className="w-40 h-40 rounded-full bg-gradient-to-br from-accent via-primary to-accent opacity-80 blur-lg animate-spin-slow" />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklab,var(--foreground)_25%,transparent),transparent_70%)]" />
                  {(voice.status === "recording") && (
                    <div className="absolute inset-0 rounded-full border border-accent/60 animate-ring" />
                  )}
                </div>
              </div>
              <div className="absolute bottom-7 left-8">
                <h2
                  className="text-3xl font-bold tracking-tight text-foreground mb-1"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Vard AI
                </h2>
                <p className="text-muted-foreground text-sm">
                  {voice.status === "recording"
                    ? "Listening to you…"
                    : voice.status === "transcribing"
                    ? "Transcribing…"
                    : "Listening to your workspace…"}
                </p>
              </div>
              <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1 rounded-full bg-card/60 border border-border text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                Core Online
              </div>
            </button>

            {/* Greeting + Stats column */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="flex-1 rounded-[2rem] border border-border bg-card/40 backdrop-blur-md p-8">
                <p className="text-accent font-medium mb-2">Good day, Vard.</p>
                <h1
                  className="text-2xl font-bold leading-tight text-foreground"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Ready for your morning briefing?
                </h1>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    Systems Nominal
                  </span>
                </div>
              </div>

              <div className="h-40 rounded-[2rem] border border-border bg-gradient-to-br from-primary/25 to-accent/10 backdrop-blur-md p-6 flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <span className="text-sm text-foreground/80">Pending Actions</span>
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div
                  className="text-4xl font-bold text-foreground"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  12
                </div>
              </div>
            </div>
          </div>

          {/* Lower bento row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Agenda */}
            <div className="lg:col-span-4 rounded-[2rem] border border-border bg-card/40 backdrop-blur-md p-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-5">
                Today's Agenda
              </h3>
              <div className="space-y-4">
                {AGENDA.map((a) => (
                  <div key={a.title} className="flex items-center gap-4">
                    <div className={`w-1 h-9 rounded-full ${a.color}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="lg:col-span-8 grid grid-cols-3 gap-4">
              {ACTIONS.map(({ icon: Icon, label, tone }) => {
                const tint =
                  tone === "indigo"
                    ? "bg-primary/15 text-primary group-hover:bg-primary/25"
                    : tone === "cyan"
                    ? "bg-accent/15 text-accent group-hover:bg-accent/25"
                    : "bg-primary/10 text-primary group-hover:bg-primary/20";
                return (
                  <button
                    key={label}
                    onClick={() => submit(label)}
                    className="group rounded-2xl border border-border bg-card/30 p-5 flex flex-col items-start gap-3 hover:bg-card/60 transition-all"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${tint}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Floating command bar */}
      <div className="fixed bottom-6 left-0 right-0 z-20 flex justify-center px-6 lg:pl-[276px]">
        <div className="w-full max-w-2xl">
          <div className="relative">
            <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary/40 via-accent/30 to-primary/40 blur opacity-40" />
            <div className="relative bg-card/70 backdrop-blur-2xl border border-border rounded-2xl h-16 flex items-center px-5 gap-3 shadow-2xl">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit(input)}
                placeholder={
                  voice.status === "recording"
                    ? "Listening…"
                    : voice.status === "transcribing"
                    ? "Transcribing…"
                    : "Command Vard AI…"
                }
                className="bg-transparent border-none outline-none flex-1 text-foreground placeholder:text-muted-foreground text-sm"
              />
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted border border-border text-[10px] text-muted-foreground font-mono">
                <Command className="w-3 h-3" /> K
              </div>
              <button
                onClick={voice.toggle}
                disabled={voice.status === "transcribing"}
                aria-label={voice.status === "recording" ? "Stop recording" : "Start voice input"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-60 ${
                  voice.status === "recording"
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-muted border border-border text-foreground/70 hover:text-foreground hover:bg-muted/70"
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
              <button
                onClick={() => submit(input)}
                aria-label="Send"
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground hover:brightness-110 transition-all shadow-[0_0_24px_-6px_var(--accent)]"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          {voice.error && (
            <p className="mt-2 text-xs text-destructive/90 text-center">{voice.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}