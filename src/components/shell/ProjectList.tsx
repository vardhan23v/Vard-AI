import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { FolderGit2, FolderPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createProject, deleteProject, pickFolder, projectsQuery } from "@/features/agent/projects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { isTauri } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

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
      toast.error("Project not added", { description: err instanceof Error ? err.message : String(err) });
    }
  };
}

export function ProjectList() {
  const { data, isLoading, error, refetch } = useQuery(projectsQuery());
  const params = useParams({ strict: false }) as { projectId?: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const add = useAddProject();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-1 pb-2">
        <h2 className="font-sans text-sm font-semibold">Projects</h2>
        <button
          onClick={add}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Add project folder"
          title="Add project folder"
        >
          <FolderPlus className="size-4" />
        </button>
      </div>
      <nav aria-label="Projects" className="flex-1 overflow-y-auto px-2 pb-3">
        {isLoading && <Skeleton className="mx-1 h-7" />}
        {error && (
          <div className="px-2 text-sm text-muted-foreground">
            <p>Couldn't load projects. {error.message}</p>
            <button onClick={() => refetch()} className="mt-2 text-primary underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {data?.length === 0 && <p className="px-2 text-sm text-muted-foreground">No projects yet.</p>}
        <ul>
          {data?.map((p) => {
            const active = params.projectId === p.id;
            return (
              <li key={p.id} className="group relative">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm",
                    active ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute top-1/2 right-1 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`Options for ${p.name}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={async () => {
                        if (!window.confirm(`Remove ${p.name} from Vard? Its task history is deleted; your folder is not touched.`)) return;
                        await deleteProject(p.id);
                        await qc.invalidateQueries({ queryKey: ["projects"] });
                        if (active) void navigate({ to: "/projects" });
                      }}
                    >
                      <Trash2 className="size-4" /> Remove project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
