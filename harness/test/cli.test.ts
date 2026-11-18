import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { parseCliArgs, runCli } from "../src/cli/main";
import { KeyStore, type SecurityRunner } from "../src/cli/keys";
import { NonInteractivePrompter, ScriptedPrompter } from "../src/cli/prompt";
import { TokenPrinter, makeTheme } from "../src/cli/render";
import { scriptedModel, sh, tmpDir, tmpGitRepo, type Turn, withReflection } from "./helpers";

class Buf {
  text = "";
  isTTY = false;
  write(s: string) {
    this.text += s;
  }
}

function io(over: { turns?: Turn[]; answers?: string[]; cwd?: string; stdin?: string; env?: Record<string, string> } = {}) {
  const out = new Buf();
  const err = new Buf();
  const home = tmpDir("vard-home-");
  const prompter = new ScriptedPrompter(over.answers ?? []);
  const env = { VARD_HOME: home, OPENROUTER_API_KEY: "sk-or-test", GROQ_API_KEY: "gsk_test", ...over.env };
  const keys = new KeyStore(env, () => ({ code: 44, stdout: "", stderr: "" }), "darwin");
  return {
    out,
    err,
    home,
    prompter,
    opts: {
      stdout: out,
      stderr: err,
      stdinIsTTY: over.stdin === undefined,
      readStdin: async () => over.stdin ?? "",
      env,
      cwd: over.cwd ?? home,
      prompter,
      keys,
      modelFactory: () => scriptedModel(over.turns ?? []),
    },
  };
}

describe("argument parsing", () => {
  test("defaults to the interactive session", () => {
    expect(parseCliArgs([]).command).toBe("session");
    expect(parseCliArgs(["-c"]).flags.continue).toBe(true);
  });

  test("run flags", () => {
    const p = parseCliArgs(["run", "fix", "the", "bug", "--no-plan", "--verify", "bun test", "-m", "gpt-5", "--max-steps", "12"]);
    expect(p.command).toBe("run");
    expect(p.rest.join(" ")).toBe("fix the bug");
    expect(p.flags).toMatchObject({ plan: false, verify: "bun test", model: "gpt-5", maxSteps: 12 });
    expect(parseCliArgs(["run", "x", "--no-worktree"]).flags.worktree).toBe(false);
  });

  test("rejects unknown commands and bad flags", () => {
    expect(() => parseCliArgs(["hello"])).toThrow(/vard ask/);
    expect(() => parseCliArgs(["run", "x", "--bogus"])).toThrow();
    expect(() => parseCliArgs(["run", "x", "--max-steps", "0"])).toThrow(/positive/);
  });

  test("help and version", async () => {
    const h = io();
    expect(await runCli(["--version"], h.opts)).toBe(0);
    expect(h.out.text).toMatch(/^vard \d+\.\d+\.\d+/);
  });
});

describe("key resolution", () => {
  test("environment variable wins over the Keychain", () => {
    const calls: string[][] = [];
    const run: SecurityRunner = (args) => {
      calls.push(args);
      return { code: 0, stdout: "from-keychain\n", stderr: "" };
    };
    const ks = new KeyStore({ OPENROUTER_API_KEY: "from-env" }, run, "darwin");
    expect(ks.resolve("openai-compatible")).toEqual({ key: "from-env", source: "env", envVar: "OPENROUTER_API_KEY" });
    expect(calls).toHaveLength(0);
    expect(ks.resolve("anthropic")).toEqual({ key: "from-keychain", source: "keychain" });
    expect(calls[0]).toEqual(["find-generic-password", "-s", "ai.vard.desktop", "-a", "anthropic", "-w"]);
  });

  test("missing everywhere returns null; Gemini accepts either variable", () => {
    const none: SecurityRunner = () => ({ code: 44, stdout: "", stderr: "not found" });
    expect(new KeyStore({}, none, "darwin").resolve("openai")).toBeNull();
    expect(new KeyStore({ GOOGLE_GENERATIVE_AI_API_KEY: "g" }, none, "darwin").resolve("google")?.key).toBe("g");
    expect(new KeyStore({}, none, "linux").resolve("openai")).toBeNull();
  });

  test("set sends the key on stdin, never in argv", () => {
    const calls: { args: string[]; input?: string }[] = [];
    const run: SecurityRunner = (args, input) => {
      calls.push({ args, input });
      return { code: 0, stdout: "", stderr: "" };
    };
    new KeyStore({}, run, "darwin").set("openai-compatible", "sk-or-secret");
    const add = calls.find((c) => c.args[0] === "-i")!;
    expect(add.args).toEqual(["-i"]);
    expect(add.input).toContain('-w "sk-or-secret"');
    expect(add.input).toContain('-T "/usr/bin/security"');
    expect(calls.every((c) => !c.args.join(" ").includes("sk-or-secret"))).toBe(true);
    expect(() => new KeyStore({}, run, "darwin").set("openai", 'bad"key')).toThrow();
  });

  test("a Keychain item macOS won't release gets its own message", async () => {
    const h = io({ env: { GROQ_API_KEY: "" } });
    h.opts.keys = new KeyStore({}, () => ({ code: 128, stdout: "", stderr: "" }), "darwin");
    expect(await runCli(["ask", "hi"], h.opts)).toBe(1);
    expect(h.err.text).toContain("Always Allow");
  });

  test("keys set reads a piped key", async () => {
    const calls: { args: string[]; input?: string }[] = [];
    const h = io({ stdin: "sk-or-piped\n" });
    h.opts.keys = new KeyStore({}, (args, input) => (calls.push({ args, input }), { code: 0, stdout: "", stderr: "" }), "darwin");
    expect(await runCli(["keys", "set", "openrouter"], h.opts)).toBe(0);
    expect(calls.find((c) => c.args[0] === "-i")?.input).toContain('-w "sk-or-piped"');
    expect(h.out.text).not.toContain("sk-or-piped");
  });

  test("a missing key gives a helpful error", async () => {
    const h = io({ env: { GROQ_API_KEY: "" } });
    expect(await runCli(["ask", "hi"], h.opts)).toBe(1);
    expect(h.err.text).toContain("vard keys set groq");
    expect(h.err.text).toContain("GROQ_API_KEY");
  });
});

describe("ask", () => {
  test("streams the reply as plain text and includes piped stdin", async () => {
    let seen = "";
    const h = io({ stdin: "const x = 1;\n", turns: [{ text: "Looks fine." }] });
    h.opts.modelFactory = () => {
      const m = scriptedModel([{ text: "Looks fine." }]);
      const orig = m.doStream.bind(m);
      m.doStream = async (o: any) => {
        seen = JSON.stringify(o.prompt);
        return orig(o);
      };
      return m;
    };
    expect(await runCli(["ask", "review", "this"], h.opts)).toBe(0);
    expect(h.out.text).toBe("Looks fine.\n");
    expect(seen).toContain("review this");
    expect(seen).toContain("const x = 1;");
  });

  test("the code-fence tint never changes the text", () => {
    const b = new Buf();
    const p = new TokenPrinter(b, makeTheme(false));
    for (const c of ["Here:\n``", "`ts\nconst a", " = 1;\n```\ndone"]) p.write(c);
    p.end();
    expect(b.text).toBe("Here:\n```ts\nconst a = 1;\n```\ndone\n");
  });
});

describe("run", () => {
  const turns: Turn[] = [
    { calls: [{ name: "read_file", input: { path: "hello.txt" } }] },
    { text: "1. Change world to vard in hello.txt" },
    { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
    { calls: [{ name: "run_command", input: { command: "cat hello.txt" } }] },
    { text: "Changed hello.txt." },
  ];

  test("plans, asks for approval, edits on a branch and merges", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    // approve plan, allow the command once, view the diff, then merge
    const h = io({ cwd: repo, turns, answers: ["y", "a", "v", "m"] });
    const code = await runCli(["run", "say hello to vard"], h.opts);
    expect(h.err.text).toBe("");
    expect(code).toBe(0);
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello vard\n");
    expect(sh(repo, ["git", "log", "--oneline"]).split("\n").filter(Boolean).length).toBeGreaterThan(1);
    // the streamed plan and summary are shown once, not repeated
    expect(h.out.text.split("Change world to vard").length - 1).toBe(1);
    expect(h.out.text.split("Changed hello.txt.").length - 1).toBe(1);
    expect(h.out.text).toContain("▸ edit_file hello.txt");
    expect(h.out.text).toContain("+hello vard"); // the viewed diff
    expect(h.out.text).toContain("Merged vard/");
    expect(h.prompter.asked.length).toBe(4);
  });

  test("a rejected plan with no feedback stops the task (exit 1) and leaves the repo alone", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const h = io({ cwd: repo, turns: [{ text: "1. Delete everything" }], answers: ["n", ""] });
    const code = await runCli(["run", "do it"], h.opts);
    expect(code).toBe(1);
    expect(h.out.text).toContain("plan rejected");
    expect(h.out.text).toContain("No file changes");
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello world\n");
  });

  test("recovers when the provider rejects a malformed tool call", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const good = scriptedModel([
      { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
      { text: "Fixed." },
    ]);
    let calls = 0;
    const flaky = scriptedModel([]);
    flaky.doStream = async (o: any) => {
      if (calls++ === 0) throw new Error("Tool call validation failed: parameters for tool search did not match schema");
      return good.doStream(o);
    };
    const h = io({ cwd: repo, answers: ["m"] });
    h.opts.modelFactory = () => flaky;
    expect(await runCli(["run", "fix it", "--no-plan"], h.opts)).toBe(0);
    expect(fs.readFileSync(path.join(repo, "hello.txt"), "utf8")).toBe("hello vard\n");
  });

  test("offers the agent's suggested memories after the task and saves the chosen ones", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const h = io({ cwd: repo, answers: ["m", "c", "y", "n"] });
    h.opts.modelFactory = () =>
      withReflection(
        scriptedModel([
          { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
          { text: "Done." },
        ]),
        '[{"section":"conventions","text":"Greetings live in hello.txt"},{"section":"decisions","text":"Keep greetings lowercase always"}]',
      );
    expect(await runCli(["run", "fix it", "--no-plan"], h.opts)).toBe(0);
    expect(h.out.text).toContain("Remember for next time?");
    const mem = fs.readFileSync(path.join(repo, ".vard", "memory.md"), "utf8");
    expect(mem).toContain("Greetings live in hello.txt");
    expect(mem).not.toContain("lowercase");
    // memory command shows it
    const show = io({ cwd: repo });
    expect(await runCli(["memory"], show.opts)).toBe(0);
    expect(show.out.text).toContain("Greetings live in hello.txt");
  });

  test("scripts save suggestions only with --remember", async () => {
    const repo = tmpGitRepo({ "hello.txt": "hello world\n" });
    const make = () =>
      withReflection(
        scriptedModel([
          { calls: [{ name: "edit_file", input: { path: "hello.txt", old_string: "world", new_string: "vard" } }] },
          { text: "Done." },
        ]),
        '[{"section":"conventions","text":"Greetings live in hello.txt"}]',
      );
    const h = io({ cwd: repo });
    h.opts.prompter = new NonInteractivePrompter(true) as any;
    h.opts.modelFactory = make;
    await runCli(["run", "fix it", "--no-plan", "--yes"], h.opts);
    expect(fs.readFileSync(path.join(repo, ".vard", "memory.md"), "utf8")).not.toContain("hello.txt");
    const h2 = io({ cwd: repo });
    h2.opts.prompter = new NonInteractivePrompter(true) as any;
    h2.opts.modelFactory = make;
    await runCli(["run", "fix it again", "--no-plan", "--yes", "--remember"], h2.opts);
    expect(fs.readFileSync(path.join(repo, ".vard", "memory.md"), "utf8")).toContain("Greetings live in hello.txt");
  });

  test("outside a git repo it explains instead of editing in place", async () => {
    const dir = tmpDir("vard-plain-");
    const h = io({ cwd: dir });
    expect(await runCli(["run", "anything"], h.opts)).toBe(1);
    expect(h.err.text).toContain("isn't a git repository");
  });
});

describe("models and config", () => {
  test("models use saves the default", async () => {
    const h = io();
    expect(await runCli(["models", "use", "claude-sonnet-5-5"], h.opts)).toBe(0);
    const cfg = JSON.parse(fs.readFileSync(path.join(h.home, "cli.json"), "utf8"));
    expect(cfg).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
  });
});
