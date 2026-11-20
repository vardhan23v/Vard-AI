/** A select of the projects that have a folder on this Mac; picks the first one by default. */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-primary",
        className,
      )}
    >
      <option value="">{local.length ? "Choose a project" : "No project folders yet"}</option>
      {local.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
