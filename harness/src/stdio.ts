/**
 * Sidecar mode: reads one JSON request per line from stdin and writes one JSON event per line to
 * stdout. Diagnostics go to stderr so stdout stays a clean protocol stream. The desktop app runs
 * this as `vard agent --stdio`.
 */
import { serializeEvent } from "./protocol";
import { Server } from "./server";

export async function runStdio(): Promise<void> {
  const server = new Server({
    write: (e) => process.stdout.write(serializeEvent(e) + "\n"),
    traceDir: process.env.VARD_TRACE_DIR || undefined,
  });
  // Asked to stop (not killed): close browsers, dev servers and MCP servers, then exit.
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void server.shutdown().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", stop);
  process.on("SIGHUP", stop);
  const decoder = new TextDecoder();
  let buf = "";
  const inflight = new Set<Promise<void>>();
  const dispatch = (line: string) => {
    // Don't await: long requests (tasks) must not block approvals/cancels behind them.
    const p = server.handleLine(line).finally(() => inflight.delete(p));
    inflight.add(p);
  };
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      dispatch(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  if (buf.trim()) dispatch(buf);
  // stdin closed: the shell went away. Let in-flight requests register, then cancel everything.
  await Promise.allSettled([...inflight]);
  await server.shutdown();
}
