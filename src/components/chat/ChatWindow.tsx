import { useState, useEffect, useRef } from "react";
import { Send, Square } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatWindow({ initialPrompt }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [wasCancelled, setWasCancelled] = useState(false);
  const seededRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

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
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, progress]);

  return (
    <div className="flex flex-col h-screen max-w-3xl w-full mx-auto">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-sm mt-16">
            Start the conversation.
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
              <span className="sr-only">
                Response generation is {progress}% complete.
              </span>
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
                send(input);
              }
            }}
            rows={1}
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground resize-none outline-none py-2 text-sm"
            placeholder="Reply..."
          />
          <button
            onClick={() => send(input)}
            aria-label="Send"
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110 transition-all shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}