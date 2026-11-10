import { createFileRoute } from "@tanstack/react-router";
import { FolderPlus } from "lucide-react";
import { StarField } from "@/components/StarField";
import { useAddProject } from "@/components/shell/ProjectList";

export const Route = createFileRoute("/projects/")({
  component: ProjectsHome,
});

function ProjectsHome() {
  const add = useAddProject();
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
      <StarField seed={3} />
      <div className="relative max-w-md">
        <h1 className="text-3xl">Point Vard at a codebase</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Add a git project folder. Vard plans the work, edits files and runs commands in an isolated worktree,
          asks before anything risky, and shows you the diff to merge.
        </p>
        <button
          onClick={add}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          <FolderPlus className="size-4" /> Add project folder
        </button>
      </div>
    </div>
  );
}
