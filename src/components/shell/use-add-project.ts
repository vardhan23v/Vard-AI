/** Pick a folder and add it as a project, then open it. */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { createProject, pickFolder } from "@/features/agent/projects";
import { isTauri } from "@/lib/agent-client";

export function useAddProject() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    if (!isTauri()) {
      toast.error("Projects need the Vard AI desktop app");
      return;
    }
    const dir = await pickFolder();
    if (!dir) return;
    try {
      const p = await createProject(dir);
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    } catch (err) {
      toast.error("Project not added", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
