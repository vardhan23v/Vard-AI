import { createFileRoute } from "@tanstack/react-router";
import { NewChat } from "@/features/chat/ChatThread";

export const Route = createFileRoute("/chat/")({
  component: NewChat,
});
