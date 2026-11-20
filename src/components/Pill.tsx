import { Children, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "./pill-tones";

export type { Tone };

/**
 * A small rounded status badge. `spin` adds a spinner, `dot` a solid dot in the tone's colour;
 * `size="xs"` is the compact variant used inside dense rows.
 */
export function Pill({
  tone,
  children,
  spin,
  dot,
  size = "sm",
  title,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  spin?: boolean;
  dot?: boolean;
  size?: "sm" | "xs";
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-normal whitespace-nowrap transition-colors duration-(--motion-base)",
        size === "xs" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs",
        TONE_CLASS[tone],
        className,
      )}
    >
      {spin && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {/* Keyed by tone + label so a state change remounts and cross-fades the text. */}
      <span
        key={`${tone}:${labelOf(children)}`}
        className="inline-flex animate-fade-in items-center gap-1"
      >
        {children}
      </span>
    </span>
  );
}

function labelOf(children: ReactNode): string {
  return Children.toArray(children)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
}
