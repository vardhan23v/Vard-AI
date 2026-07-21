import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Mic, ChevronDown, Monitor, ArrowRight } from "lucide-react";

export function ChatPrompt() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    navigate({ to: "/dashboard/chat", search: { q } as never });
  };

  return (
    <div className="w-full bg-card border border-border rounded-2xl p-4 flex flex-col shadow-lg focus-within:border-muted-foreground/50 focus-within:ring-1 focus-within:ring-muted-foreground/30 transition-all mb-6">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="w-full bg-transparent text-base text-foreground placeholder-muted-foreground resize-none outline-none min-h-[80px] py-2"
        placeholder="Ask anything..."
      />
      <div className="flex items-center justify-between mt-2 pt-2">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            <span>Attach</span>
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-secondary text-secondary-foreground text-sm font-medium transition-colors">
            <Monitor className="w-4 h-4" />
            <span>Project</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-secondary text-secondary-foreground text-sm font-medium transition-colors">
            <span>Model</span>
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            aria-label="Voice input"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary text-secondary-foreground transition-colors"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={submit}
            aria-label="Send"
            className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:brightness-110 transition-all"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}