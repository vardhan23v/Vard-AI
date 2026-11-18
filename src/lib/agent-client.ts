/**
 * Typed bridge between the WebView and the `vard-agent` sidecar.
 *
 * The WebView never talks to the sidecar or Keychain directly: it calls Tauri
 * commands in src-tauri/src/lib.rs, which inject API keys and relay JSON-lines.
 * Protocol types are shared with the harness (harness/src/protocol.ts).
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Event as AgentEvent, Request as AgentRequest } from "../../harness/src/protocol";

export type { AgentEvent, AgentRequest };
export type ProviderId =
  | "anthropic"
  | "openai"
  | "google"
  | "ollama"
  | "openai-compatible"
  | "groq";

/** Distributive Omit, so each request variant keeps its own fields. */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let seq = 0;
export const newId = (prefix = "r") =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

type Handler = (event: AgentEvent) => void;
const handlers = new Set<Handler>();
let unlisten: Promise<UnlistenFn> | null = null;

function ensureListening() {
  if (unlisten || !isTauri()) return;
  unlisten = listen<AgentEvent>("agent://event", ({ payload }) => {
    for (const h of handlers) h(payload);
  });
}

/** Subscribe to every sidecar event. Returns an unsubscribe function. */
export function onAgentEvent(handler: Handler): () => void {
  ensureListening();
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Send a request; returns the id its events will carry. */
export async function send(request: WithoutId<AgentRequest>, id = newId()): Promise<string> {
  if (!isTauri()) throw new Error("The agent is only available in the Vard AI desktop app.");
  ensureListening();
  await invoke("agent_send", { message: { ...request, id } });
  return id;
}

/** Health check: resolves with the sidecar version. */
export function ping(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = newId("ping");
    const timer = setTimeout(() => {
      off();
      reject(new Error("Agent did not respond"));
    }, timeoutMs);
    const off = onAgentEvent((e) => {
      if (e.id === id && e.type === "pong") {
        clearTimeout(timer);
        off();
        resolve(e.version);
      }
    });
    send({ type: "ping" }, id).catch((err) => {
      clearTimeout(timer);
      off();
      reject(err);
    });
  });
}

// ---- API keys (stored in the macOS Keychain by the shell) ----

export type KeyStatus = Record<ProviderId, string | null>;

export const keys = {
  status: () => invoke<KeyStatus>("api_key_status"),
  set: (provider: ProviderId, key: string) => invoke<void>("set_api_key", { provider, key }),
  remove: (provider: ProviderId) => invoke<void>("delete_api_key", { provider }),
};

export const restartAgent = () => invoke<void>("agent_restart");

/** The `vard` command-line tool (a link in /usr/local/bin to the binary inside the app). */
export type CliStatus = {
  link: string;
  bundled: string;
  installed: boolean;
  conflict: string | null;
};

export const cli = {
  status: () => invoke<CliStatus>("cli_status"),
  install: () => invoke<CliStatus>("install_cli"),
  uninstall: () => invoke<CliStatus>("uninstall_cli"),
};

// ---- project memory (<project>/.vard/memory.json, managed by the agent) ----

export type MemorySnapshot = Extract<AgentEvent, { type: "memory" }>;
export type MemoryEntry = MemorySnapshot["entries"][number];
export type MemorySettings = MemorySnapshot["settings"];
export type MemoryCategory = MemoryEntry["category"];
export type MemoryChange = Extract<AgentRequest, { type: "memory.update" }>["change"];

function memoryRequest(
  request: WithoutId<Extract<AgentRequest, { type: "memory.get" | "memory.update" }>>,
): Promise<MemorySnapshot> {
  return new Promise((resolve, reject) => {
    const id = newId("mem");
    const off = onAgentEvent((e) => {
      if (e.id !== id) return;
      off();
      if (e.type === "memory") resolve(e);
      else if (e.type === "error") reject(new Error(e.message));
    });
    send(request, id).catch((err) => {
      off();
      reject(err);
    });
  });
}

export const memory = {
  get: (projectRoot: string) => memoryRequest({ type: "memory.get", projectRoot }),
  update: (projectRoot: string, change: MemoryChange) =>
    memoryRequest({ type: "memory.update", projectRoot, change }),
};

export const MEMORY_CATEGORIES: { id: MemoryCategory; title: string }[] = [
  { id: "overview", title: "Project overview" },
  { id: "architecture", title: "Architecture and important files" },
  { id: "commands", title: "Commands" },
  { id: "conventions", title: "Conventions" },
  { id: "preferences", title: "Your preferences" },
  { id: "decisions", title: "Decisions" },
  { id: "fixes", title: "Solved bugs" },
  { id: "issues", title: "Known issues and limitations" },
  { id: "details", title: "Implementation details" },
];
