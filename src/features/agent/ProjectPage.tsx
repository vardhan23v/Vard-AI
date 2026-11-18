import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Brain, FolderSearch, Loader2, Pencil, Play, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { ModelPicker } from "@/features/chat/ModelPicker";
import { StarField } from "@/components/StarField";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { memory, send } from "@/lib/agent-client";
import { Markdown } from "@/features/chat/Markdown";
import { providerConfig, useModelChoice } from "@/lib/models";
import { cn } from "@/lib/utils";
import {
  createTask,
  pickFolder,
  projectLearns,
  projectPath,
  setProjectLearns,
  projectsQuery,
  setProjectPath,
  tasksQuery,
  updateProject,
  type Project,
} from "./projects";
import { startTaskStore, useTask } from "./store";
import { StatusBadge, TaskView } from "./TaskView";

export function ProjectPage({ projectId, taskId }: { projectId: string; taskId?: string }) {
  const { data: projects, isLoading } = useQuery(projectsQuery());
  const project = projects?.find((p) => p.id === projectId);
  const tasks = useQuery(tasksQuery(projectId));
  const [path, setPath] = useState(() => projectPath(projectId));

  useEffect(() => {
    startTaskStore();
    setPath(projectPath(projectId));
  }, [projectId]);

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-60" /></div>;
  if (!project) return <p className="p-6 text-sm text-muted-foreground">This project no longer exists.</p>;

  if (!path) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <FolderSearch className="size-6 text-muted-foreground" />
        <p className="max-w-sm text-sm text-muted-foreground">
          {project.name} was added on another Mac. Choose where its folder is on this one.
        </p>
        <button
          onClick={async () => {
            const dir = await pickFolder();
            if (dir) {
              setProjectPath(project.id, dir);
              setPath(dir);
            }
          }}
          className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Locate folder
        </button>
      </div>
    );
  }

  const selected = tasks.data?.find((t) => t.id === taskId);

  return (
    <div className="flex h-full">
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <ProjectHeader project={project} path={path} />
        <NewTask project={project} path={path} />
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <h2 className="px-2 pt-3 pb-1 font-sans text-xs font-medium text-muted-foreground">Tasks</h2>
          {tasks.isLoading && <Skeleton className="mx-2 h-12" />}
          {tasks.error && (
            <p className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <AlertCircle className="size-4" /> {tasks.error.message}
            </p>
          )}
          {tasks.data?.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">No tasks yet. Describe one above; several can run at once.</p>
          )}
          <ul className="space-y-1">
            {tasks.data?.map((t) => (
              <TaskRow key={t.id} projectId={projectId} id={t.id} prompt={t.prompt} status={t.status} active={t.id === taskId} />
            ))}
          </ul>
        </div>
      </div>
      <div className="relative min-w-0 flex-1">
        {selected ? (
          <TaskView key={selected.id} task={selected} />
        ) : (
          <div className="relative flex h-full items-center justify-center px-6">
            <StarField seed={11} />
            <p className="relative max-w-sm text-center text-sm text-muted-foreground">
              Each task runs in its own git worktree, so tasks can run side by side without touching your working copy. You review the diff before anything is merged.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ projectId, id, prompt, status, active }: { projectId: string; id: string; prompt: string; status: string; active: boolean }) {
  const live = useTask(id);
  const current = live?.worktree?.action === "merged" ? "merged" : (live?.done?.status ?? live?.state ?? status);
  const needsYou = !!live?.pending;
  return (
    <li>
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        search={{ task: id }}
        aria-current={active ? "page" : undefined}
        className={cn("block rounded-md px-2 py-2", active ? "bg-accent" : "hover:bg-accent/60")}
      >
        <p className="line-clamp-2 text-sm">{prompt}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusBadge status={current} />
          {needsYou && <span className="text-xs text-primary">Needs you</span>}
        </div>
      </Link>
    </li>
  );
}

function ProjectHeader({ project, path }: { project: Project; path: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [verify, setVerify] = useState(project.verify_command ?? "");
  const [allow, setAllow] = useState(project.command_allowlist.join("\n"));

  const save = async () => {
    await updateProject(project.id, {
      verify_command: verify.trim() || null,
      command_allowlist: allow.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    await qc.invalidateQueries({ queryKey: ["projects"] });
    setOpen(false);
    toast.success("Project settings saved");
  };

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-base">{project.name}</h1>
          <p className="truncate font-mono text-xs text-muted-foreground" title={path}>
            {path}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMemOpen((v) => !v)}
            aria-expanded={memOpen}
            aria-label="Project memory"
            title="Project memory"
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
              memOpen && "bg-accent text-foreground",
            )}
          >
            <Brain className="size-4" />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Project settings"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>
      {memOpen && <MemoryPanel project={project} path={path} />}
      {open && (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <label htmlFor="verify" className="text-xs text-muted-foreground">
              Verify command (runs after edits)
            </label>
            <input
              id="verify"
              value={verify}
              onChange={(e) => setVerify(e.target.value)}
              placeholder="bun test"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="allow" className="text-xs text-muted-foreground">
              Commands allowed without asking (one per line)
            </label>
            <textarea
              id="allow"
              rows={3}
              value={allow}
              onChange={(e) => setAllow(e.target.value)}
              placeholder={"bun test\nbun run lint"}
              className="mt-1 w-full rounded-md border border-input bg-background p-2 font-mono text-sm outline-none focus:border-primary"
            />
          </div>
          <button type="submit" className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Save
          </button>
        </form>
      )}
    </div>
  );
}

/** What Vard remembers about this project (.vard/memory.md in the project folder). */
function MemoryPanel({ project, path }: { project: Project; path: string }) {
  const qc = useQueryClient();
  const key = ["memory", path];
  const q = useQuery({ queryKey: key, queryFn: () => memory.get(path), retry: false });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [learn, setLearn] = useState(() => projectLearns(project.id));

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: key });
      toast.success(done);
    } catch (e) {
      toast.error("Memory", { description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const shown = (q.data?.text ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/^# Project memory\s*/, "").trim();

  return (
    <section aria-label="Project memory" className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Project memory</h2>
          <p className="text-xs text-muted-foreground">
            {q.data ? `${q.data.entries} notes · ` : ""}Vard reads this before every task here. It stays on this Mac.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!editing && (
            <button
              onClick={() => {
                setDraft(q.data?.text ?? "");
                setEditing(true);
              }}
              disabled={!q.data}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
          <button
            onClick={() => void run(() => memory.rebuild(path), "Project overview rebuilt")}
            disabled={busy}
            title="Scan the project again and replace the Project overview"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" /> Rebuild overview
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : q.error ? (
        <p className="text-sm text-destructive">{String(q.error)}</p>
      ) : editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => memory.set(path, draft), "Memory saved").then(() => setEditing(false));
          }}
        >
          <label htmlFor="memory-text" className="sr-only">
            Project memory (Markdown)
          </label>
          <textarea
            id="memory-text"
            rows={14}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-md border border-input bg-background p-2 font-mono text-xs outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-md px-3 text-sm hover:bg-accent">
              Cancel
            </button>
          </div>
        </form>
      ) : shown ? (
        <div className="max-h-72 overflow-y-auto rounded-md bg-background p-3">
          <Markdown text={shown} className="text-sm" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Vard scans the project on its first task, and you can save what it learns after each one.
        </p>
      )}

      <label className="flex min-h-9 items-center justify-between gap-3 text-sm">
        <span>
          Suggest memories after tasks
          <span className="block text-xs text-muted-foreground">You choose what's saved; nothing is kept automatically.</span>
        </span>
        <Switch
          checked={learn}
          onCheckedChange={(v) => {
            setLearn(v);
            setProjectLearns(project.id, v);
          }}
        />
      </label>
    </section>
  );
}

function NewTask({ project, path }: { project: Project; path: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [choice] = useModelChoice();
  const [prompt, setPrompt] = useState("");
  const [planFirst, setPlanFirst] = useState(true);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    try {
      const task = await createTask({ project_id: project.id, prompt: text, provider: choice.provider, model: choice.model });
      startTaskStore();
      await send(
        {
          type: "task.start",
          taskId: task.id,
          projectRoot: path,
          prompt: text,
          provider: providerConfig(choice),
          planFirst,
          useWorktree: true,
          allowlist: project.command_allowlist,
          verifyCommand: project.verify_command ?? undefined,
          useMemory: true,
          learn: projectLearns(project.id),
        },
        `task-${task.id}`,
      );
      setPrompt("");
      await qc.invalidateQueries({ queryKey: ["tasks", project.id] });
      await navigate({ to: "/projects/$projectId", params: { projectId: project.id }, search: { task: task.id } });
    } catch (err) {
      toast.error("Task not started", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="border-b border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <label htmlFor="task-prompt" className="sr-only">
        Describe a task
      </label>
      <textarea
        id="task-prompt"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.metaKey) {
            e.preventDefault();
            void start();
          }
        }}
        placeholder="Describe a task, e.g. “Add input validation to the signup form and a test for it”"
        className="w-full resize-none rounded-lg border border-border bg-card p-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-input"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <ModelPicker />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={planFirst} onCheckedChange={setPlanFirst} aria-label="Plan first" /> Plan first
        </label>
      </div>
      <button
        type="submit"
        disabled={!prompt.trim() || busy}
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        <Play className="size-4" /> Start task <span className="text-xs opacity-70">⌘↵</span>
      </button>
    </form>
  );
}
