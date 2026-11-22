/** Agents: team runs across projects, and the role settings agents use. */
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw, Users } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
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
  const failed = [projects, ...taskLists].find((q) => q.error);
  const retry = () => {
    void projects.refetch();
    taskLists.forEach((q) => q.error && void q.refetch());
  };
  const runs = taskLists
    .flatMap((q) => q.data ?? [])
    .filter((t) => t.mode === "team")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const name = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <PageHeader
          icon={Users}
          title="Agents"
          description="Team runs split a task across specialist agents that work in parallel on their own branches. Start one from a project with the Team switch."
        />
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
            ) : failed ? (
              <EmptyState
                size="lg"
                seed={43}
                icon={<AlertTriangle className="size-8 text-destructive" aria-hidden />}
                title="Couldn't load team runs"
                text={failed.error instanceof Error ? failed.error.message : String(failed.error)}
              >
                <button
                  type="button"
                  onClick={retry}
                  className="press inline-flex min-h-10 items-center gap-1.5 rounded-md border border-input px-4 text-sm hover:bg-accent"
                >
                  <RotateCcw className="size-4" aria-hidden /> Try again
                </button>
              </EmptyState>
            ) : !runs.length ? (
              <EmptyState
                size="lg"
                seed={41}
                icon={<Users className="size-8 text-agent-foreground" aria-hidden />}
                title="No team runs yet"
                text="Open a project, describe a larger task, and turn on Team before starting it."
              >
                <Link
                  to="/projects"
                  className="press inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Go to projects
                </Link>
              </EmptyState>
            ) : (
              <ul className="stagger space-y-2">
                {runs.map((t) => {
                  const team = live.find((l) => l.taskId === t.id)?.team;
                  return (
                    <li key={t.id}>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: t.project_id }}
                        search={{ task: t.id }}
                        className="lift block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
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
