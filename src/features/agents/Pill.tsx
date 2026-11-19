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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        TONE_CLASS[tone],
      )}
    >
      {spin && <Loader2 className="size-3 animate-spin" aria-hidden />}
      {children}
    </span>
  );
}
