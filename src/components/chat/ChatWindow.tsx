import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatWindow({ initialPrompt }: { initialPrompt?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const seededRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { role: "user", content: t },
      {
        role: "assistant",
        content:
          "This is a placeholder response. Enable Lovable Cloud + Lovable AI to power real generation.",
      },
    ]);
    setInput("");
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
  }, [messages]);

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