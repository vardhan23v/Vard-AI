/** A select of the projects that have a folder on this Mac; picks the first one by default. */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { projectPath, projectsQuery } from "./projects";

export function ProjectPicker({
  value,
  onChange,
  className,
  label = "Project",
}: {
  value: string;
  onChange: (projectId: string) => void;
  className?: string;
  label?: string;
}) {
  const projects = useQuery(projectsQuery());
  const local = projects.data?.filter((p) => projectPath(p.id)) ?? [];
  useEffect(() => {
    if (!value && local.length) onChange(local[0].id);
    // Only when the list first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data]);
  if (projects.isLoading)
    return (
      <Skeleton className={cn("h-9 w-44", className)} role="status" aria-label="Loading projects" />
    );
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("w-auto min-w-44", className)}>
        <SelectValue placeholder={local.length ? "Choose a project" : "No project folders yet"} />
      </SelectTrigger>
      <SelectContent>
        {local.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
