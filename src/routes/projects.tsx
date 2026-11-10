import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/AppShell";
import { ProjectList } from "@/components/shell/ProjectList";
import { requireAuth } from "@/lib/guard";

export const Route = createFileRoute("/projects")({
  beforeLoad: requireAuth,
  component: () => <AppShell list={<ProjectList />} />,
});
