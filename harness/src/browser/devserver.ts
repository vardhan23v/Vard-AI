/**
 * Development servers started for browser testing. The command always goes through Vard's
 * command policy and approval (dev_server_start is an exec tool); here it runs in the agent's own
 * folder (its worktree), on a free port, with a clean environment (no API keys from Vard), until
 * ready. Its process tree is killed when the task ends.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { findSecret } from "../memory/secrets";
import { killTree } from "../util";
import type { DevServerInfo } from "./schema";

const MAX_LOG = 200;

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.unref();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

/** Suggests how to start a project's dev server on `port` (from package.json), or null. */
export function detectDevCommand(
  dir: string,
  port: number,
): { command: string; framework: string } | null {
  let pkg: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const pm =
    fs.existsSync(path.join(dir, "bun.lock")) || fs.existsSync(path.join(dir, "bun.lockb"))
      ? "bun"
      : fs.existsSync(path.join(dir, "pnpm-lock.yaml"))
        ? "pnpm"
        : fs.existsSync(path.join(dir, "yarn.lock"))
          ? "yarn"
          : "npm";
  const script = pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start" : null;
  if (!script) return null;
  const runner = `${pm} run ${script}`;
  const body = pkg.scripts![script];
  const sep = pm === "npm" ? " --" : "";
  if (deps.vite || /\bvite\b/.test(body))
    return {
      command: `${runner}${sep} --port ${port} --strictPort --host 127.0.0.1`,
      framework: "vite",
    };
  if (deps.next || /\bnext\b/.test(body))
    return { command: `${runner}${sep} -p ${port} -H 127.0.0.1`, framework: "next" };
  if (deps.astro || /\bastro\b/.test(body))
    return { command: `${runner}${sep} --port ${port} --host 127.0.0.1`, framework: "astro" };
  if (deps["react-scripts"])
    return { command: `PORT=${port} BROWSER=none ${runner}`, framework: "create-react-app" };
  return { command: `PORT=${port} ${runner}`, framework: "node" };
}

/** Environment for dev servers: the user's environment minus anything that looks like a credential. */
function devEnv(port: number, binDirs: string[] = []): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (
      /(KEY|TOKEN|SECRET|PASSW|PWD$|CREDENTIAL|PRIVATE|_PAT$|AUTH|COOKIE|SESSION|DATABASE_URL|_DSN$|_URI$|CONNECTION_STRING)/i.test(
        k,
      ) &&
      k !== "PATH"
    )
      continue;
    env[k] = v;
  }
  // Worktrees have no node_modules of their own; the project's bin folder (and Node's normal lookup
  // up the folder tree) lets `vite`, `next` etc. run there.
  const PATH = [...binDirs.filter((d) => fs.existsSync(d)), env.PATH ?? ""]
    .filter(Boolean)
    .join(":");
  return {
    ...env,
    PATH,
    PORT: String(port),
    BROWSER: "none",
    HOST: "127.0.0.1",
    FORCE_COLOR: "0",
    CI: "1",
  };
}

const redactLine = (l: string) =>
  findSecret(l)
    ? "[line hidden: looks like it contains a secret]"
    : l.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 300);

interface Running {
  info: DevServerInfo;
  proc: ReturnType<typeof Bun.spawn>;
  guard?: ReturnType<typeof Bun.spawn>;
}

/**
 * Ends a dev server's process group once the Vard process that started it is gone. The app stops
 * its sidecar with SIGKILL (restart and quit), so `stop()` never runs then, and a detached group
 * would otherwise keep running. The watcher notices by being re-parented away from Vard, which
 * also holds if Vard lingers as a zombie or its pid is reused.
 */
export function startGuard(
  pgid: number,
  ownerPid = process.pid,
): ReturnType<typeof Bun.spawn> | undefined {
  try {
    const script = `while [ "$(ps -o ppid= -p $$ | tr -d ' ')" = "${ownerPid}" ]; do sleep 1; done; kill -9 -${pgid} 2>/dev/null`;
    const guard = Bun.spawn(["/bin/sh", "-c", script], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    });
    guard.unref();
    return guard;
  } catch {
    return undefined; // Best effort: normal stops still work without it.
  }
}

export class DevServers {
  private servers = new Map<string, Running>();
  private seq = 0;

  private notify: (s: DevServerInfo) => void;
  constructor(onChange?: (s: DevServerInfo) => void) {
    // Send a snapshot: the live object keeps changing.
    this.notify = (s) => onChange?.({ ...s, log: s.log.slice(-50) });
  }

  list(taskId?: string): DevServerInfo[] {
    return [...this.servers.values()]
      .map((s) => s.info)
      .filter((s) => !taskId || s.taskId === taskId);
  }

  /** Starts `command` in `cwd` and waits until `url` answers (or the process exits, or time runs out). */
  async start(o: {
    command: string;
    cwd: string;
    port: number;
    taskId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    binDirs?: string[];
  }): Promise<DevServerInfo> {
    const id = `dev${++this.seq}`;
    const url = `http://127.0.0.1:${o.port}`;
    // Something already listening there would answer the readiness probe instead of this server.
    if (!(await portFree(o.port))) {
      const info: DevServerInfo = {
        id,
        taskId: o.taskId,
        command: o.command,
        cwd: o.cwd,
        url,
        port: o.port,
        state: "failed",
        log: [],
        error: `port ${o.port} is already in use; pick another (dev_server_detect suggests a free one)`,
      };
      this.notify(info);
      return info;
    }
    const info: DevServerInfo = {
      id,
      taskId: o.taskId,
      command: o.command,
      cwd: o.cwd,
      url,
      port: o.port,
      state: "starting",
      log: [],
    };
    // Its own process group, so stopping it also stops anything it forked.
    const proc = Bun.spawn(["/bin/sh", "-c", o.command], {
      cwd: o.cwd,
      env: devEnv(o.port, o.binDirs),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
      detached: true,
    });
    this.servers.set(id, { info, proc, guard: startGuard(proc.pid) });
    this.notify(info);
    let announced: string | undefined;
    const pump = async (stream: ReadableStream<Uint8Array>) => {
      const dec = new TextDecoder();
      let buf = "";
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          info.log.push(redactLine(l));
          if (info.log.length > MAX_LOG) info.log.splice(0, info.log.length - MAX_LOG);
          const m = /(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):\d+)/.exec(
            l.replace(/\x1b\[[0-9;]*m/g, ""),
          );
          if (m && !announced) announced = m[1].replace("localhost", "127.0.0.1");
        }
      }
    };
    void pump(proc.stdout as ReadableStream<Uint8Array>).catch(() => {});
    void pump(proc.stderr as ReadableStream<Uint8Array>).catch(() => {});
    const deadline = Date.now() + (o.timeoutMs ?? 120_000);
    let exited = false;
    void proc.exited.then(() => (exited = true));
    while (Date.now() < deadline) {
      if (o.signal?.aborted) {
        this.stop(id);
        throw new Error("cancelled");
      }
      if (exited) {
        info.state = "failed";
        info.error = `the command exited (code ${proc.exitCode}) before the server was ready`;
        this.stop(id, "failed");
        return info;
      }
      for (const candidate of [url, announced].filter(Boolean) as string[]) {
        try {
          const r = await fetch(candidate, {
            signal: AbortSignal.timeout(2_000),
            redirect: "manual",
          });
          if (r.status > 0) {
            info.url = candidate;
            info.state = "ready";
            this.notify(info);
            return info;
          }
        } catch {}
      }
      await Bun.sleep(400);
    }
    info.state = "failed";
    info.error = "timed out waiting for the server to answer";
    this.stop(id, "failed");
    return info;
  }

  stop(id: string, state: "stopped" | "failed" = "stopped") {
    const s = this.servers.get(id);
    if (!s) return false;
    try {
      process.kill(-s.proc.pid, "SIGKILL"); // the whole process group
    } catch {}
    killTree(s.proc.pid);
    s.guard?.kill();
    if (s.info.state !== "failed") s.info.state = state;
    this.notify(s.info);
    this.servers.delete(id);
    return true;
  }

  stopTask(taskId: string) {
    for (const s of this.list(taskId)) this.stop(s.id);
  }

  stopAll() {
    for (const id of [...this.servers.keys()]) this.stop(id);
  }
}
