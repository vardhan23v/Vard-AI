import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { requireAuth } from "@/lib/guard";

export const Route = createFileRoute("/integrations")({
  beforeLoad: requireAuth,
  component: () => <AppShell />,
});
