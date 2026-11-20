/**
 * The `vard` binary. `vard agent --stdio` is the desktop app's sidecar; anything else is the CLI.
 */
import { runStdio } from "./stdio";
import { runCli } from "./cli/main";

const args = process.argv.slice(2);

const run =
  args[0] === "agent" && args.includes("--stdio") ? runStdio().then(() => 0) : runCli(args);

run.then(
  (code) => process.exit(code ?? 0),
  (e) => {
    process.stderr.write(`vard: ${e?.stack ?? e}\n`);
    process.exit(1);
  },
);
