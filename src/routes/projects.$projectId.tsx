import { createFileRoute } from "@tanstack/react-router";
import { ProjectPage } from "@/features/agent/ProjectPage";

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (s: Record<string, unknown>): { task?: string } =>
    typeof s.task === "string" ? { task: s.task } : {},
  component: Page,
});

function Page() {
  const { projectId } = Route.useParams();
  const { task } = Route.useSearch();
  return <ProjectPage key={projectId} projectId={projectId} taskId={task} />;
}
