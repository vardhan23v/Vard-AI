import { Children } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type Tone } from "./team-utils";

export function Pill({
  tone,
  children,
  spin,
}: {
  tone: Tone;
  children: React.ReactNode;
  spin?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap transition-colors duration-(--motion-base)",
        TONE_CLASS[tone],
      )}
    >
      {spin && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {/* Keyed by tone + label so a state change remounts and cross-fades the text. */}
      <span key={`${tone}:${labelOf(children)}`} className="animate-fade-in">
        {children}
      </span>
    </span>
  );
}

function labelOf(children: React.ReactNode): string {
  return Children.toArray(children)
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
}
