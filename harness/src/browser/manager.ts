/**
 * The browser process and its sessions. One headless Chromium is launched lazily (never the
 * user's own profile: Playwright gives each launch a temporary profile, removed on close). Each
 * task or team agent gets its own session (an isolated context). If the browser crashes, the
 * next action relaunches it and restores the session's page once. Idle sessions close after a
 * while; everything closes when the task ends or Vard shuts down.
 */
import { chromium, type Browser } from "playwright-core";
import { runDir } from "./artifacts";
import { BrowserError } from "./errors";
import { detectBrowser } from "./install";
import { VIEWPORTS, type BrowserSessionInfo, type Viewport, type ViewportName } from "./schema";
import { BrowserSession } from "./session";

const MAX_SESSIONS = 6;
const IDLE_MS = 15 * 60_000;

export interface BrowserManagerOptions {
  onSession?: (s: BrowserSessionInfo) => void;
  onAction?: (s: BrowserSessionInfo, action: string, ok: boolean, detail?: string) => void;
  onReport?: (s: BrowserSessionInfo, r: import("./schema").BrowserReport) => void;
  /** Origins allowed per project (from the policy file). */
  projectOrigins?: (projectRoot: string) => string[];
  env?: NodeJS.ProcessEnv;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  readonly sessions = new Map<string, BrowserSession>();
  private creating = new Map<string, Promise<BrowserSession>>();
  private recovering = new Map<string, Promise<void>>();
  private idle = new Map<string, ReturnType<typeof setTimeout>>();
  private seq = 0;
  launches = 0;

  constructor(private o: BrowserManagerOptions = {}) {}

  report(s: BrowserSession, r: import("./schema").BrowserReport) {
    this.o.onReport?.(this.info(s), r);
  }

  info(s: BrowserSession): BrowserSessionInfo {
    const p = s.pages[s.active];
    return {
      id: s.id,
      taskId: s.info.taskId,
      agentId: s.info.agentId,
      state: s.state,
      url: s.lastUrl,
      title: undefined,
      viewport: { name: s.viewportName, width: s.viewport.width, height: s.viewport.height },
      tabs: s.pages.filter((x) => !x.isClosed()).length || (p ? 1 : 0),
      consoleErrors: s.console.filter((c) => c.type === "error" || c.type === "pageerror").length,
      networkErrors: s.network.length,
      screenshots: s.screenshots.slice(-30),
      artifactsDir: s.artifactsDir,
      startedAt: s.startedAt,
      lastAction: s.lastAction,
      recentConsole: s.console.filter((c) => c.type !== "info").slice(-30),
      recentNetwork: s.network.slice(-30),
    };
  }

  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  /** Sends a session's state right away (opened, closed, crashed). */
  private flush(s: BrowserSession) {
    clearTimeout(this.pending.get(s.id));
    this.pending.delete(s.id);
    this.o.onSession?.(this.info(s));
  }

  /** Session updates are batched (a chatty page logs a lot). */
  private changed(s: BrowserSession) {
    if (this.pending.has(s.id)) return;
    this.pending.set(
      s.id,
      setTimeout(() => {
        this.pending.delete(s.id);
        this.o.onSession?.(this.info(s));
      }, 250),
    );
  }

  private async launch(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.launching ??= (async () => {
      const found = detectBrowser(this.o.env);
      if (!found.installed || !found.executable)
        throw new BrowserError("not_installed", "No Chromium found. Install one in Vard (Browser → Install) or run: vard browser install");
      const b = await chromium.launch({
        executablePath: found.executable,
        headless: true,
        timeout: 30_000,
        args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-sync", "--disable-background-networking", "--mute-audio"],
      });
      this.launches++;
      b.on("disconnected", () => {
        this.browser = null;
        for (const s of this.sessions.values()) if (s.state !== "closed") s.state = "crashed";
      });
      this.browser = b;
      return b;
    })().finally(() => (this.launching = null));
    return this.launching;
  }

  /** The session for a task/agent (key), created on first use. */
  async session(key: string, o: { projectRoot: string; taskId?: string; agentId?: string; run?: string }): Promise<BrowserSession> {
    const s = this.sessions.get(key);
    if (s && s.state !== "closed") {
      if (s.state === "crashed") await this.recover(s);
      this.touch(key);
      return s;
    }
    // One creation at a time per key: concurrent callers share it.
    let p = this.creating.get(key);
    if (!p) {
      p = this.create(key, o).finally(() => this.creating.delete(key));
      this.creating.set(key, p);
    }
    return p;
  }

  private async create(key: string, o: { projectRoot: string; taskId?: string; agentId?: string; run?: string }): Promise<BrowserSession> {
    let s: BrowserSession | undefined;
    if ([...this.sessions.values()].filter((x) => x.state !== "closed").length >= MAX_SESSIONS)
      throw new BrowserError("launch", `At most ${MAX_SESSIONS} browser sessions can be open; close one first.`);
    const id = `b${++this.seq}-${Date.now().toString(36)}`;
    s = new BrowserSession(
      id,
      runDir(o.projectRoot, o.run ?? o.taskId ?? "browser"),
      { taskId: o.taskId, agentId: o.agentId, projectOrigins: () => this.o.projectOrigins?.(o.projectRoot) ?? [] },
      () => this.changed(s!),
    );
    await s.open(await this.launch());
    // Registered only once its page exists, so nobody gets a half-open session.
    this.sessions.set(key, s);
    this.prune();
    this.flush(s);
    this.touch(key);
    return s;
  }

  /** Keeps the most recent 20 closed sessions (for the UI's history); older ones are dropped. */
  private prune() {
    const closed = [...this.sessions].filter(([, x]) => x.state === "closed").sort((a, b) => a[1].startedAt - b[1].startedAt);
    for (const [k] of closed.slice(0, Math.max(0, closed.length - 20))) this.sessions.delete(k);
  }

  find(id: string): BrowserSession | undefined {
    return [...this.sessions.values()].find((s) => s.id === id);
  }

  private touch(key: string) {
    clearTimeout(this.idle.get(key));
    this.idle.set(
      key,
      setTimeout(() => void this.close(key), IDLE_MS),
    );
  }

  /** Relaunches the browser (if needed) and reopens the session's page. */
  async recover(s: BrowserSession) {
    let p = this.recovering.get(s.id);
    if (!p) {
      p = (async () => {
        await s.context?.close().catch(() => {});
        await s.open(await this.launch());
      })().finally(() => this.recovering.delete(s.id));
      this.recovering.set(s.id, p);
    }
    return p;
  }

  /**
   * Runs one action, recovering once from a crashed or closed browser, and reports it. Every action
   * has a timeout and honours the agent's AbortSignal.
   */
  async act<T>(s: BrowserSession, label: string, fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const attempt = async () => {
      if (signal?.aborted) throw new BrowserError("closed", "cancelled");
      if (s.state === "crashed" || !this.browser?.isConnected()) await this.recover(s);
      s.state = "busy";
      s.lastAction = label;
      const abort = new Promise<never>((_, j) => signal?.addEventListener("abort", () => j(new BrowserError("closed", "cancelled")), { once: true }));
      try {
        return await Promise.race([fn(), abort]);
      } finally {
        if (s.state === "busy") s.state = "ready";
      }
    };
    try {
      const r = await attempt();
      this.o.onAction?.(this.info(s), label, true);
      return r;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      if (!signal?.aborted && /Target page, context or browser has been closed|Browser has been closed|browser has disconnected|Target closed/i.test(msg)) {
        s.state = "crashed";
        const r = await attempt();
        this.o.onAction?.(this.info(s), `${label} (after restarting the browser)`, true);
        return r;
      }
      this.o.onAction?.(this.info(s), label, false, msg.split("\n")[0].slice(0, 300));
      throw e;
    }
  }

  /** Changes the viewport. Mobile emulation needs a new context; the page is reopened. */
  async setViewport(s: BrowserSession, v: ViewportName | Viewport) {
    const next: Viewport = typeof v === "string" ? { ...VIEWPORTS[v] } : v;
    const name = typeof v === "string" ? v : `${v.width}×${v.height}`;
    const needsContext = next.isMobile !== s.viewport.isMobile || next.deviceScaleFactor !== s.viewport.deviceScaleFactor || next.hasTouch !== s.viewport.hasTouch;
    s.viewport = next;
    s.viewportName = name;
    if (needsContext) {
      await s.context.close().catch(() => {});
      await s.open(await this.launch());
    } else await s.page().setViewportSize({ width: next.width, height: next.height });
    this.o.onSession?.(this.info(s));
  }

  async close(key: string) {
    clearTimeout(this.idle.get(key));
    this.idle.delete(key);
    const s = this.sessions.get(key);
    if (s) {
      await s.close();
      this.flush(s);
    }
  }

  /** Closes every session belonging to a task (its team agents included). */
  async closeTask(taskId: string) {
    for (const [k, s] of this.sessions) if (s.info.taskId === taskId && s.state !== "closed") await this.close(k);
  }

  list(): BrowserSessionInfo[] {
    return [...this.sessions.values()].map((s) => this.info(s));
  }

  get running() {
    return !!this.browser?.isConnected();
  }

  /** For tests: kill the browser process outright. */
  async crashForTest() {
    const proc = (this.browser as unknown as { _connection?: unknown }) && this.browser;
    if (proc) await proc.close().catch(() => {});
  }

  async closeAll() {
    for (const k of [...this.sessions.keys()]) await this.close(k);
    for (const t of this.idle.values()) clearTimeout(t);
    this.idle.clear();
    await this.browser?.close().catch(() => {});
    this.browser = null;
  }
}
