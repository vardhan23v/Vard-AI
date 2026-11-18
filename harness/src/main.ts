/** Sidecar-only entry point (kept for tests and scripts). The shipped binary uses bin.ts. */
import { runStdio } from "./stdio";

runStdio().then(
  () => process.exit(0),
  (e) => {
    process.stderr.write(`vard-agent fatal: ${e?.stack ?? e}\n`);
    process.exit(1);
  },
);
