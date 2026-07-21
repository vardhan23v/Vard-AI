import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatWindow } from "@/components/chat/ChatWindow";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/dashboard/chat")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Chat — Vard AI" },
      { name: "description", content: "Chat with Vard AI to generate code and answers." },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { q } = Route.useSearch();
  return <ChatWindow initialPrompt={q} />;
}