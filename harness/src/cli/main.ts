/** The `vard` command line: argument parsing and routing. */
import { parseArgs } from "node:util";
import { VERSION } from "../server";
import { ask } from "./commands/ask";
import { keysCommand } from "./commands/keys";
import { memoryCommand } from "./commands/memory";
import { mcpCommand } from "./commands/mcp";
import { skillsCommand } from "./commands/skills";
import { codeCommand } from "./commands/code";
import { browserCommand } from "./commands/browser";
import { modelsCommand } from "./commands/models";
import { session } from "./commands/session";
import { runTask } from "./commands/task";
import { makeCtx, type Ctx } from "./context";
import type { KeyStore } from "./keys";
import { NonInteractivePrompter, TtyPrompter, TuiPrompter, type Prompter } from "./prompt";
import { useColor, type Writer } from "./render";
import type { SecretStore } from "../mcp";
import type { ModelFactory } from "../providers";

export const HELP = `vard ${VERSION}: chat and a coding agent in your terminal

Usage
  vard                      full-screen session in this folder (chat + /task)
  vard -c                   continue the last session
  vard --classic            line-by-line session instead of the full-screen one
  vard ask "<question>"     one answer; piped input is added as context
  vard run "<task>"         run the coding agent in this git repo
  vard memory [list|search|show|export|add|edit|rm|verify|analyze|rebuild|clear|config|path]
                            what Vard remembers about this project
  vard mcp [list|add|remove|enable|disable|test|tools|resources|prompts|secret|trust|untrust|import|permissions|revoke]
                            MCP servers (external tools); see vard mcp help
  vard skills [list|show|new|edit|import|validate|enable|disable|rm|trust|untrust|path]
                            reusable instructions the agent picks per task
  vard code [index|status|search|symbols|def|refs|callers|deps|dependents|outline|impact|arch|embeddings|clean]
                            the code index: search, dependencies, impact
  vard browser [status|install|test <url>|artifacts|clean|origins [--remove <origin>]]
                            the isolated test browser (--viewports mobile,tablet,desktop)
  vard keys [list|set|remove] <provider>   (set reads the key from stdin when piped:
                                            pbpaste | vard keys set openrouter)
  vard models [use <id>]

Options
  -m, --model <id>          model to use (see vard models)
  -p, --provider <name>     anthropic, openai, google, openrouter, groq or ollama
      --no-plan             (run) skip the plan approval step
      --verify "<cmd>"      (run) check command after edits, e.g. "bun test"
      --no-worktree         (run) edit files in place instead of on a branch
      --max-steps <n>       (run) step limit
      --no-memory           (run) don't read or learn project memory
      --team                (run) split the task across a team of agents
      --max-agents <n>      (run --team) agents at once (1-6, default 3)
      --retest-rounds <n>   (run --team) browser fix-and-retest rounds (0-3, default 2)
      --skill <name>        (run) use this skill (repeatable)
      --no-skills           (run) don't pick skills automatically
      --remember            (run, no terminal) save suggested memories
  -y, --yes                 (run, no terminal) approve the plan and commands
  -h, --help                this help
  -v, --version             version

Keys come from $GROQ_API_KEY / $OPENROUTER_API_KEY / $ANTHROPIC_API_KEY / $OPENAI_API_KEY / $GEMINI_API_KEY,
or the macOS Keychain shared with the Vard AI app.
`;

export type ParsedArgs = {
  command: "session" | "ask" | "run" | "keys" | "models" | "memory" | "mcp" | "skills" | "code" | "browser" | "help" | "version";
  rest: string[];
  flags: {
    model?: string;
    provider?: string;
    continue?: boolean;
    plan?: boolean;
    verify?: string;
    worktree?: boolean;
    maxSteps?: number;
    yes?: boolean;
    classic?: boolean;
    memory?: boolean;
    remember?: boolean;
    category?: string;
    search?: string;
    project?: boolean;
    url?: string;
    bearer?: boolean;
    name?: string;
    skill?: string[];
    skills?: boolean;
    description?: string;
    team?: boolean;
    maxAgents?: number;
    retestRounds?: number;
    remove?: string;
    force?: boolean;
    viewports?: string;
    days?: number;
  };
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      model: { type: "string", short: "m" },
      provider: { type: "string", short: "p" },
      continue: { type: "boolean", short: "c" },
      "no-plan": { type: "boolean" },
      plan: { type: "boolean" },
      verify: { type: "string" },
      "no-worktree": { type: "boolean" },
      "max-steps": { type: "string" },
      yes: { type: "boolean", short: "y" },
      classic: { type: "boolean" },
      "no-memory": { type: "boolean" },
      category: { type: "string" },
      search: { type: "string" },
      project: { type: "boolean" },
      remove: { type: "string" },
      url: { type: "string" },
      bearer: { type: "boolean" },
      name: { type: "string" },
      skill: { type: "string", multiple: true },
      "no-skills": { type: "boolean" },
      team: { type: "boolean" },
      force: { type: "boolean" },
      viewports: { type: "string" },
      days: { type: "string" },
      "max-agents": { type: "string" },
      "retest-rounds": { type: "string" },
      description: { type: "string" },
      remember: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const maxSteps = values["max-steps"] !== undefined ? Number(values["max-steps"]) : undefined;
  if (maxSteps !== undefined && (!Number.isInteger(maxSteps) || maxSteps < 1))
    throw new Error("--max-steps needs a positive whole number");
  const maxAgents = values["max-agents"] !== undefined ? Number(values["max-agents"]) : undefined;
  if (maxAgents !== undefined && (!Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 6))
    throw new Error("--max-agents needs a whole number from 1 to 6");
  const retestRounds = values["retest-rounds"] !== undefined ? Number(values["retest-rounds"]) : undefined;
  if (retestRounds !== undefined && (!Number.isInteger(retestRounds) || retestRounds < 0 || retestRounds > 3))
    throw new Error("--retest-rounds needs a whole number from 0 to 3");
  const flags: ParsedArgs["flags"] = {
    model: values.model,
    provider: values.provider,
    continue: values.continue,
    plan: values["no-plan"] ? false : values.plan ? true : undefined,
    verify: values.verify,
    worktree: values["no-worktree"] ? false : undefined,
    maxSteps,
    yes: values.yes,
    classic: values.classic,
    memory: values["no-memory"] ? false : undefined,
    remember: values.remember,
    category: values.category,
    search: values.search,
    project: values.project,
    url: values.url,
    bearer: values.bearer,
    name: values.name,
    skill: values.skill,
    skills: values["no-skills"] ? false : undefined,
    description: values.description,
    team: values.team,
    maxAgents,
    retestRounds,
    remove: values.remove,
    force: values.force,
    viewports: values.viewports,
    days: values.days !== undefined ? Number(values.days) : undefined,
  };
  if (values.help) return { command: "help", rest: [], flags };
  if (values.version) return { command: "version", rest: [], flags };
  const [first, ...rest] = positionals;
  if (first === undefined) return { command: "session", rest: [], flags };
  if (first === "ask" || first === "run" || first === "keys" || first === "models" || first === "memory" || first === "mcp" || first === "skills" || first === "code" || first === "browser")
    return { command: first, rest, flags };
  if (first === "help") return { command: "help", rest: [], flags };
  throw new Error(`Unknown command "${first}". To ask a question, use: vard ask "${positionals.join(" ")}"`);
}

/** Runs a parsed command against a context. Returns the exit code. */
export async function dispatch(ctx: Ctx, p: ParsedArgs): Promise<number> {
  switch (p.command) {
    case "help":
      ctx.out.write(HELP);
      return 0;
    case "version":
      ctx.out.write(`vard ${VERSION}\n`);
      return 0;
    case "keys":
      return keysCommand(ctx, p.rest);
    case "memory":
      return memoryCommand(ctx, p.rest, p.flags);
    case "mcp":
      return mcpCommand(ctx, p.rest, p.flags);
    case "skills":
      return skillsCommand(ctx, p.rest, p.flags);
    case "code":
      return codeCommand(ctx, p.rest, p.flags);
    case "browser":
      return browserCommand(ctx, p.rest, p.flags);
    case "models":
      return modelsCommand(ctx, p.rest, p.flags);
    case "ask": {
      const q = p.rest.join(" ").trim();
      if (!q && !ctx.stdinText?.trim()) {
        ctx.err.write('Usage: vard ask "<question>"\n');
        return 1;
      }
      return ask(ctx, q || "Explain this.", p.flags);
    }
    case "run": {
      const task = p.rest.join(" ").trim();
      if (!task) {
        ctx.err.write('Usage: vard run "<what the agent should do>"\n');
        return 1;
      }
      return (await runTask(ctx, task, p.flags)).code;
    }
    case "session":
      if (!ctx.prompter.interactive) {
        ctx.err.write("The interactive session needs a terminal. Use vard ask or vard run in scripts.\n");
        return 1;
      }
      if (!p.flags.classic) {
        const { runTui } = await import("../tui/app");
        return runTui(ctx, p.flags);
      }
      return session(ctx, p.flags);
  }
}

export type CliIO = {
  stdout?: Writer & { isTTY?: boolean };
  stderr?: Writer & { isTTY?: boolean };
  stdinIsTTY?: boolean;
  readStdin?: () => Promise<string>;
  env?: Record<string, string | undefined>;
  cwd?: string;
  prompter?: Prompter;
  keys?: KeyStore;
  modelFactory?: ModelFactory;
  mcpSecrets?: SecretStore;
};

export async function runCli(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (e) {
    stderr.write(`vard: ${(e as Error).message}\nRun vard --help for usage.\n`);
    return 1;
  }
  const stdinIsTTY = io.stdinIsTTY ?? !!process.stdin.isTTY;
  // Piped input is context for `ask`; read it before any prompt touches stdin.
  let stdinText: string | undefined;
  if (!stdinIsTTY && (parsed.command === "ask" || (parsed.command === "keys" && parsed.rest[0] === "set") || (parsed.command === "mcp" && parsed.rest[0] === "secret")))
    stdinText = await (io.readStdin ?? (() => Bun.stdin.text()))();
  const interactive = stdinIsTTY && !!stdout.isTTY;
  // The full-screen UI owns the terminal itself; readline must not attach to stdin.
  const tui = parsed.command === "session" && !parsed.flags.classic;
  const prompter =
    io.prompter ??
    (interactive && !tui ? new TtyPrompter() : tui && interactive ? new TuiPrompter() : new NonInteractivePrompter(!!parsed.flags.yes));
  const ctx = makeCtx({
    out: stdout,
    err: stderr,
    color: useColor(!!stdout.isTTY, env),
    spinner: !!stderr.isTTY,
    prompter,
    cwd: io.cwd ?? process.cwd(),
    env,
    keys: io.keys,
    modelFactory: io.modelFactory,
    mcpSecrets: io.mcpSecrets,
    stdinText,
  });
  try {
    return await dispatch(ctx, parsed);
  } catch (e) {
    ctx.spinner.stop();
    stderr.write(`${ctx.theme.danger("vard:")} ${(e as Error).message}\n`);
    return 1;
  } finally {
    prompter.close();
    await ctx.client.shutdown();
  }
}
