/**
 * Live browser state: status from the agent plus every session, action, report and dev-server event.
 * Kept in a module-level store (subscribed once, never torn down) so leaving the page doesn't lose
 * history; the agent's status request fills in sessions that started earlier.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  browser,
  isTauri,
  onBrowser,
  type BrowserReport,
  type BrowserSessionInfo,
  type DevServerInfo,
} from "@/lib/agent-client";

export type ActionLog = {
  at: number;
  sessionId: string;
  action: string;
  ok: boolean;
  detail?: string;
};

interface State {
  sessions: Record<string, BrowserSessionInfo>;
  servers: Record<string, DevServerInfo>;
  reports: Record<string, BrowserReport[]>;
  log: ActionLog[];
  install: { received: number; total: number } | null;
}

let state: State = { sessions: {}, servers: {}, reports: {}, log: [], install: null };
const listeners = new Set<() => void>();
const set = (patch: (s: State) => Partial<State>) => {
  state = { ...state, ...patch(state) };
  listeners.forEach((l) => l());
};

let started = false;
/** Starts collecting browser events (idempotent). Called by the app shell and the Browser page. */
export function startBrowserStore() {
  if (started || !isTauri()) return;
  started = true;
  onBrowser((e) => {
    if (e.type === "browser_session")
      set((s) => ({ sessions: { ...s.sessions, [e.session.id]: e.session } }));
    else if (e.type === "dev_server")
      set((s) => ({ servers: { ...s.servers, [e.server.id]: e.server } }));
    else if (e.type === "browser_report")
      set((s) => ({
        reports: {
          ...s.reports,
          [e.sessionId]: [...(s.reports[e.sessionId] ?? []), e.report].slice(-10),
        },
      }));
    else if (e.type === "browser_action")
      set((s) => ({
        log: [
          ...s.log,
          { at: e.ts, sessionId: e.sessionId, action: e.action, ok: e.ok, detail: e.detail },
        ].slice(-300),
      }));
    else if (e.type === "browser_install_progress")
      set(() => ({ install: { received: e.received, total: e.total } }));
  });
}

export function useBrowserState() {
  startBrowserStore();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["browser-status"],
    queryFn: () => browser.status(),
    enabled: isTauri(),
    retry: false,
  });
  const s = useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => state,
  );
  useEffect(() => {
    if (!status.data) return;
    set((cur) => ({
      sessions: {
        ...Object.fromEntries(status.data.sessions.map((x) => [x.id, x])),
        ...cur.sessions,
      },
      servers: {
        ...Object.fromEntries(status.data.devServers.map((x) => [x.id, x])),
        ...cur.servers,
      },
    }));
  }, [status.data]);
  return {
    status,
    sessions: Object.values(s.sessions).sort((a, b) => b.startedAt - a.startedAt),
    servers: Object.values(s.servers),
    reports: s.reports,
    log: s.log,
    install: s.install,
    refresh: () => void qc.invalidateQueries({ queryKey: ["browser-status"] }),
  };
}
