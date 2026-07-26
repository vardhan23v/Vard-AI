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
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [wasCancelled, setWasCancelled] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastPrompt, setLastPrompt] = useState("");
  const seededRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const storageKey = `${LP_PREFIX}${threadId}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setLastPrompt(saved);
    } catch {}
  }, [storageKey]);

  const stopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || streaming) return;
    const nextMessages: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(nextMessages);
    setLastPrompt(t);
    try {
      window.localStorage.setItem(storageKey, t);
    } catch {}
    setInput("");
    setWasCancelled(false);
    setErrorMsg(null);
    setStreamingText("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let acc = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        throw new Error(err || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamingText(acc);
      }
      if (acc) {
        setMessages((m) => [...m, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        if (acc) setMessages((m) => [...m, { role: "assistant", content: acc }]);
        setWasCancelled(true);
      } else {
        setErrorMsg((e as Error).message || "Request failed");
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setStreamingText("");
    }
  };

  useEffect(() => {
    if (initialPrompt && !seededRef.current) {
      seededRef.current = true;
      void send(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && streaming) {
        e.preventDefault();
        stopGeneration();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [streaming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, streaming]);

  return (
    <div className="flex flex-col h-screen max-w-3xl w-full mx-auto">
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 && !streaming && (
          <div className="text-center text-muted-foreground text-sm mt-16 space-y-3">
            <p>Start the conversation.</p>
            {lastPrompt && (
              <button
                onClick={() => void send(lastPrompt)}
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
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {streaming && (
          <div
            className="flex justify-start"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy="true"
            aria-label="Assistant is generating a response"
          >
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-card border border-border text-sm leading-relaxed text-foreground">
              {streamingText ? (
                <div className="whitespace-pre-wrap">
                  {streamingText}
                  <span className="inline-block w-1.5 h-4 -mb-0.5 ml-0.5 bg-primary animate-pulse rounded-sm" />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span>Thinking…</span>
                </div>
              )}
              <button
                onClick={stopGeneration}
                type="button"
                aria-label="Stop response generation"
                className="mt-3 flex items-center gap-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-medium px-3 py-1.5 transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            </div>
          </div>
        )}
        {wasCancelled && !streaming && (
          <div className="flex justify-start" role="status" aria-live="polite">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-muted/50 border border-border">
              <p className="text-xs text-muted-foreground mb-2">Generation stopped.</p>
              {lastPrompt && (
                <button
                  onClick={() => void send(lastPrompt)}
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
        {errorMsg && !streaming && (
          <div className="flex justify-start" role="alert">
            <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-destructive/10 border border-destructive/30 text-destructive text-xs">
              {errorMsg}
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
                if (streaming) {
                  stopGeneration();
                } else {
                  void send(input);
                }
              }
            }}
            rows={1}
            disabled={streaming}
            className="flex-1 bg-transparent text-foreground placeholder-muted-foreground resize-none outline-none py-2 text-sm disabled:opacity-60"
            placeholder={streaming ? "Generating response…" : "Reply..."}
          />
          {streaming ? (
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
              onClick={() => void send(input)}
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