import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@/features/mcp/IntegrationsPage";

export const Route = createFileRoute("/integrations/")({
  component: IntegrationsPage,
});
