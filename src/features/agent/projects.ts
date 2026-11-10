/**
 * Projects and agent tasks.
 * Synced to Firestore: users/{uid}/projects/{projectId}/tasks/{taskId}
 * (name, settings, task summaries). Kept on this Mac only: each project's
 * folder path, because it differs per device.
 */
import { queryOptions } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, nowIso, requireUid } from "@/lib/firebase";

export type Project = {
  id: string;
  name: string;
  verify_command: string | null;
  command_allowlist: string[];
  created_at: string;
  updated_at: string;
};

export type AgentTask = {
  id: string;
  project_id: string;
  prompt: string;
  status: string;
  provider: string | null;
  model: string | null;
  branch: string | null;
  plan: string | null;
  summary: string | null;
  diff_stat: string | null;
  steps: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  updated_at: string;
};

const projectsCol = () => collection(db, "users", requireUid(), "projects");
const projectDoc = (id: string) => doc(db, "users", requireUid(), "projects", id);
const tasksCol = (projectId: string) => collection(projectDoc(projectId), "tasks");

// Task id → project id, so live task events can be synced to the right place.
const taskProject = new Map<string, string>();

// ---- local folder paths ----
const PATHS_KEY = "vard:project-paths";

function readPaths(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PATHS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const projectPath = (id: string): string | undefined => readPaths()[id];

export function setProjectPath(id: string, path: string) {
  try {
    localStorage.setItem(PATHS_KEY, JSON.stringify({ ...readPaths(), [id]: path }));
  } catch {
    // Without storage the folder must be picked again next launch.
  }
}

export async function pickFolder(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title: "Choose a project folder" });
  return typeof dir === "string" ? dir : null;
}

// ---- queries ----
export const projectsQuery = () =>
  queryOptions({
    queryKey: ["projects"],
    queryFn: async () => {
      const snap = await getDocs(query(projectsCol(), orderBy("updated_at", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Project);
    },
  });

export const tasksQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["tasks", projectId],
    queryFn: async () => {
      const snap = await getDocs(query(tasksCol(projectId), orderBy("created_at", "desc"), limit(100)));
      return snap.docs.map((d) => {
        taskProject.set(d.id, projectId);
        return { id: d.id, project_id: projectId, ...d.data() } as AgentTask;
      });
    },
  });

// ---- mutations ----
export async function createProject(path: string): Promise<Project> {
  const name = path.split("/").filter(Boolean).pop() ?? path;
  const now = nowIso();
  const data = { name, verify_command: null, command_allowlist: [], created_at: now, updated_at: now };
  const ref = await addDoc(projectsCol(), data);
  setProjectPath(ref.id, path);
  return { id: ref.id, ...data };
}

export async function updateProject(id: string, patch: Partial<Pick<Project, "name" | "verify_command" | "command_allowlist">>) {
  await updateDoc(projectDoc(id), { ...patch, updated_at: nowIso() });
}

export async function deleteProject(id: string) {
  const tasks = await getDocs(tasksCol(id));
  const batch = writeBatch(db);
  tasks.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  await deleteDoc(projectDoc(id));
}

export async function createTask(input: { project_id: string; prompt: string; provider: string; model: string }): Promise<AgentTask> {
  const now = nowIso();
  const { project_id, ...rest } = input;
  const data = {
    ...rest,
    status: "planning",
    branch: null,
    plan: null,
    summary: null,
    diff_stat: null,
    steps: null,
    input_tokens: null,
    output_tokens: null,
    created_at: now,
    updated_at: now,
  };
  const ref = await addDoc(tasksCol(project_id), data);
  taskProject.set(ref.id, project_id);
  return { id: ref.id, project_id, ...data };
}

export async function updateTask(id: string, patch: Partial<Omit<AgentTask, "id" | "project_id">>) {
  const projectId = taskProject.get(id);
  if (!projectId) return;
  try {
    await updateDoc(doc(tasksCol(projectId), id), { ...patch, updated_at: nowIso() });
  } catch (err) {
    console.warn("[vard] task not synced", err);
  }
}
