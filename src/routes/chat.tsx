import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ConversationList } from "@/components/shell/ConversationList";
import { requireAuth } from "@/lib/guard";

export const Route = createFileRoute("/chat")({
  beforeLoad: requireAuth,
  component: () => <AppShell list={<ConversationList />} />,
});
