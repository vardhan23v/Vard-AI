/**
 * vard-agent: stdio entry point. Reads one JSON request per line from stdin and writes one JSON
 * event per line to stdout. Diagnostics go to stderr so stdout stays a clean protocol stream.
 */
import { serializeEvent } from "./protocol";
import { Server } from "./server";

const server = new Server({
  write: (e) => process.stdout.write(serializeEvent(e) + "\n"),
  traceDir: process.env.VARD_TRACE_DIR || undefined,
});

async function main() {
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

main().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(`vard-agent fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  },
);
