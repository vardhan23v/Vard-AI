import { createFileRoute } from "@tanstack/react-router";
import { ChatThread } from "@/features/chat/ChatThread";

export const Route = createFileRoute("/chat/$conversationId")({
  validateSearch: (s: Record<string, unknown>): { reply?: boolean } => (s.reply ? { reply: true } : {}),
  component: ConversationPage,
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { reply } = Route.useSearch();
  // Keyed so switching chats resets streaming state.
  return <ChatThread key={conversationId} conversationId={conversationId} reply={reply} />;
}
