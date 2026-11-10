import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { ModelPicker } from "./ModelPicker";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder = "Message Vard",
  initial = "",
  autoFocus = true,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  initial?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && streaming) {
      onStop?.();
    }
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <form
      className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:outline-none"
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <ModelPicker />
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {streaming ? "Esc to stop" : "Enter to send · Shift+Enter for a new line"}
          </span>
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="inline-flex size-9 items-center justify-center rounded-full bg-foreground text-background hover:opacity-90"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
                !canSend && "opacity-40",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
