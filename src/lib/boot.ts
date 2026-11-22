/**
 * Startup support: a boot log, an IndexedDB warm-up, and the flags Firebase reads to pick storage.
 *
 * WebKit (Tauri's engine on macOS) can hang the first IndexedDB open after a cold start. Firebase
 * keeps the signed-in session there, so a hang left the window blank until a relaunch. We open a
 * throwaway database first, with a timeout, and fall back to other storage if it never answers.
 * Everything here is loaded before Firebase and the router (see main.tsx).
 */
import { invoke } from "@tauri-apps/api/core";

const t0 = performance.now();
const lines: string[] = [];
const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const debugBuild = import.meta.env.DEV || import.meta.env.TAURI_ENV_DEBUG === "true";

/** Where the desktop app writes this log (shown on the slow-start screen). */
export const BOOT_LOG_PATH = "~/Library/Logs/ai.vard.desktop/frontend.log";

/** Records one line in memory and, in the desktop app, in the boot log file. Never throws. */
export function bootLog(message: string) {
  const line = `+${Math.round(performance.now() - t0)}ms ${message}`;
  lines.push(line);
  if (lines.length > 200) lines.shift();
  if (inTauri()) invoke("log_frontend", { line }).catch(() => {});
}

/** The lines logged since this window opened, for the slow-start screen. */
export const bootLines = () => [...lines];

let marked = new Set<string>();
/** Logs a named startup step once. */
export function mark(step: string) {
  if (marked.has(step)) return;
  marked.add(step);
  bootLog(`mark ${step}`);
}

/**
 * Records uncaught errors, which otherwise vanish in a release build, and how this page was
 * loaded and left, so the log tells a reload from a new launch.
 */
export function installErrorLogging() {
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  bootLog(`page ${nav?.type ?? "unknown"} ${location.pathname}`);
  window.addEventListener("beforeunload", () => bootLog("page beforeunload"));
  window.addEventListener("pagehide", (e) => bootLog(`page hide persisted=${e.persisted}`));
  document.addEventListener("visibilitychange", () =>
    bootLog(`page visibility ${document.visibilityState}`),
  );
  window.addEventListener("error", (e) => {
    bootLog(`error ${e.message} at ${e.filename?.split("/").pop() ?? "?"}:${e.lineno ?? 0}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    bootLog(
      `unhandled ${r instanceof Error ? `${r.name}: ${r.message}` : String(r).slice(0, 300)}`,
    );
  });
}

/** Storage Firebase should use, decided before it initialises. */
export const storage = { indexedDB: true };

function probe(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), ms);
    try {
      if (debugBuild && localStorage.getItem("vard-debug-block-idb") === "1") return; // Simulate the hang.
      const req = indexedDB.open("vard-startup-probe");
      req.onsuccess = () => {
        req.result.close();
        finish(true);
      };
      req.onerror = () => finish(false);
      req.onblocked = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

/**
 * Opens a throwaway IndexedDB database (twice at most) so the real ones open promptly. Sets
 * `storage.indexedDB` to false if it never answers, so Firebase avoids IndexedDB this run.
 */
export async function warmUpStorage(): Promise<void> {
  for (const ms of [2500, 2500]) {
    if (await probe(ms)) {
      mark("indexeddb-ready");
      return;
    }
    bootLog(`indexeddb did not answer within ${ms}ms`);
  }
  storage.indexedDB = false;
  bootLog("indexeddb unavailable: using local storage for the session and an in-memory data cache");
}

/** Debug builds only: makes the auth wait hang, to test the slow-start screen. */
export const debugHangAuth = () => {
  try {
    return debugBuild && localStorage.getItem("vard-debug-hang-auth") === "1";
  } catch {
    return false;
  }
};

// Reset between hot reloads in development.
if (import.meta.hot) import.meta.hot.dispose(() => (marked = new Set()));
