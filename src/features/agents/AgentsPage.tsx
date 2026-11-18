/** Agents: team runs across projects, and the role settings agents use. */
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { StarField } from "@/components/StarField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { projectsQuery, tasksQuery } from "@/features/agent/projects";
import { StatusBadge } from "@/features/agent/TaskView";
import { useLiveTasks } from "@/features/agent/store";
import { isTauri } from "@/lib/agent-client";
import { Pill } from "./Pill";
import { RolesEditor } from "./RolesEditor";
import { fmtTokens, PHASE_LABEL } from "./team-utils";

export function AgentsPage() {
  const projects = useQuery(projectsQuery());
  const taskLists = useQueries({ queries: (projects.data ?? []).map((p) => tasksQuery(p.id)) });
  const live = useLiveTasks();
  const loading = projects.isLoading || taskLists.some((q) => q.isLoading);
  const runs = taskLists
    .flatMap((q) => q.data ?? [])
    .filter((t) => t.mode === "team")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const name = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-6">
        <header>
          <h1 className="flex items-center gap-2 text-2xl">
            <Users className="size-6 text-agent-foreground" aria-hidden /> Agents
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Team runs split a task across specialist agents that work in parallel on their own
            branches. Start one from a project with the Team switch.
          </p>
        </header>
        <Tabs defaultValue="runs">
          <TabsList>
            <TabsTrigger value="runs">Team runs</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="pt-4">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : !runs.length ? (
              <div className="relative overflow-hidden rounded-xl border border-dashed border-border p-10 text-center">
                <StarField seed={41} />
                <div className="relative space-y-2">
                  <p className="text-lg">No team runs yet</p>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    Open a project, describe a larger task, and turn on Team before starting it.
                  </p>
                  <Link
                    to="/projects"
                    className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  >
                    Go to projects
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {runs.map((t) => {
                  const team = live.find((l) => l.taskId === t.id)?.team;
                  return (
                    <li key={t.id}>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: t.project_id }}
                        search={{ task: t.id }}
                        className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="line-clamp-1 text-sm font-medium">{t.prompt}</span>
                          {team ? (
                            <Pill tone="live">{PHASE_LABEL[team.phase]}</Pill>
                          ) : (
                            <StatusBadge status={t.status} />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {name(t.project_id)} · {new Date(t.created_at).toLocaleString()}
                          {team && (
                            <>
                              {" "}
                              · {team.subtasks.filter((s) => s.status === "completed").length}/
                              {team.subtasks.length} subtasks · {team.agents.length} agents ·{" "}
                              {fmtTokens(team.usage.totalTokens)} tokens
                            </>
                          )}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="roles" className="pt-4">
            {isTauri() ? (
              <RolesEditor />
            ) : (
              <p className="text-sm text-muted-foreground">
                Roles are managed by the agent in the desktop app.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
