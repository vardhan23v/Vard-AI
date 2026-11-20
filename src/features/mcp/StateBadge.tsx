import { Pill, type Tone } from "@/components/Pill";
import type { McpServerStatus } from "@/lib/agent-client";

const LABEL: Record<McpServerStatus["state"], string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  error: "Error",
  needs_trust: "Needs trust",
  needs_auth: "Sign-in needed",
  disabled: "Disabled",
};

const TONE: Record<McpServerStatus["state"], Tone> = {
  connected: "ok",
  connecting: "muted",
  disconnected: "muted",
  error: "bad",
  needs_trust: "attention",
  needs_auth: "attention",
  disabled: "muted",
};

export function StateBadge({ state }: { state: McpServerStatus["state"] }) {
  return (
    <Pill tone={TONE[state]} spin={state === "connecting"} dot={state === "connected"}>
      {LABEL[state]}
    </Pill>
  );
}
