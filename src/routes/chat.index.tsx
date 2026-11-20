import { createFileRoute } from "@tanstack/react-router";
import { NewChat } from "@/features/chat/ChatThread";

export const Route = createFileRoute("/chat/")({
  // `draft` pre-fills the composer (e.g. an MCP prompt chosen in Integrations).
  validateSearch: (s: Record<string, unknown>): { draft?: string } =>
    typeof s.draft === "string" ? { draft: s.draft.slice(0, 20_000) } : {},
  component: NewChat,
});
