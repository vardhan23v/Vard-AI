import { Loader2 } from "lucide-react";
import type { McpServerStatus } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

const LABEL: Record<McpServerStatus["state"], string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  error: "Error",
  needs_trust: "Needs trust",
  needs_auth: "Sign-in needed",
  disabled: "Disabled",
};

export function StateBadge({ state }: { state: McpServerStatus["state"] }) {
  const tone =
    state === "connected"
      ? "border-diff-add/50 text-diff-add"
      : state === "error"
        ? "border-destructive/50 text-destructive"
        : state === "needs_trust" || state === "needs_auth"
          ? "border-primary/60 text-primary"
          : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-normal",
        tone,
      )}
    >
      {state === "connecting" && <Loader2 className="size-3 animate-spin" />}
      {state === "connected" && <span className="size-1.5 rounded-full bg-diff-add" aria-hidden />}
      {LABEL[state]}
    </span>
  );
}
