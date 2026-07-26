import { useState, useEffect, useRef } from "react";
import { Send, Square, RefreshCw } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const LP_PREFIX = "vard-ai:lastPrompt:";

export function ChatWindow({
  initialPrompt,
  threadId = "default",
}: {
  initialPrompt?: string;
  threadId?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const [lastPrompt, setLastPrompt] = useState("");
  const seededRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const storageKey = `${LP_PREFIX}${threadId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setLastPrompt(saved);
    } catch {}
  }, [storageKey]);

  const stopGeneration = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setProgress(null);
    setWasCancelled(true);
  };

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [...m, { role: "user", content: t }]);
    setLastPrompt(t);
    try {
      window.localStorage.setItem(storageKey, t);
    } catch {}
    setInput("");
    setWasCancelled(false);
    setProgress(0);
    const start = Date.now();
    startRef.current = start;
    const duration = 2400;
    const tick = () => {
      const pct = Math.min(100, Math.round(((Date.now() - startRef.current) / duration) * 100));
      setProgress(pct);
      if (pct < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              "This is a placeholder response. Enable Lovable Cloud + Lovable AI to power real generation.",
          },
        ]);
        setTimeout(() => setProgress(null), 400);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (initialPrompt && !seededRef.current) {
      seededRef.current = true;
      send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && progress !== null) {
        e.preventDefault();
        stopGeneration();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [progress]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progress]);

  return (
    <div className="flex flex-col h-screen max-w-3xl w-full mx-auto">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && progress === null && (
          <div className="text-center text-muted-foreground text-sm mt-16 space-y-3">
            <p>Start the conversation.</p>
            {lastPrompt && (
              <button
                onClick={() => send(lastPrompt)}
                type="button"
                aria-label="Regenerate last prompt"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium px-3 py-1.5 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate last prompt
              </button>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {progress !== null && (
          <div
            className="flex justify-start"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy="true"
            aria-label="Assistant is generating a response"
          >
            <div className="max-w-[85%] w-72 rounded-2xl px-4 py-3 bg-card border border-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span id="generation-label">Generating…</span>
                <span
                  className="tabular-nums font-medium text-foreground"
                  aria-describedby="generation-label"
                >
                  {progress}%
                </span>
              </div>
              <div
                className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Response generation progress"
              >
                <div
                  className="h-full bg-primary transition-[width] duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                onClick={stopGeneration}
                type="button"
                aria-label="Stop response generation"
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium py-1.5 transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop generating
              </button>
              <span className="sr-only">
                Response generation is {progress}% complete.
              </span>
            </div>
          </div>
        )}
        {wasCancelled && progress === null && (
          <div className="flex justify-start" role="status" aria-live="polite">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground mb-2">Generation stopped.</p>
              {lastPrompt && (
                <button
                  onClick={() => send(lastPrompt)}
                  type="button"
                  aria-label="Regenerate response for last prompt"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium px-3 py-1.5 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              )}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-4">
        <div className="bg-card border border-border rounded-2xl p-3 flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (progress !== null) {
                  stopGeneration();
                } else {
                  send(input);
                }
              }
            }}
            rows={1}
            disabled={progress !== null}
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground resize-none outline-none py-2 text-sm disabled:opacity-60"
            placeholder={progress !== null ? "Generating response…" : "Reply..."}
          />
          {progress !== null ? (
            <button
              onClick={stopGeneration}
              type="button"
              aria-label="Stop response generation"
              className="w-9 h-9 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:brightness-110 transition-all shrink-0"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              aria-label="Send"
              className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110 transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}