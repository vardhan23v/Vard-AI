import { createFileRoute } from "@tanstack/react-router";
import { VisualBuilder } from "@/components/agents/VisualBuilder";

export const Route = createFileRoute("/dashboard/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Vard AI" },
      { name: "description", content: "Build and manage custom AI agents." },
    ],
  }),
  component: () => <VisualBuilder />,
});