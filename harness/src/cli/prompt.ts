/**
 * Questions on the terminal. One readline interface serves the whole process so Ctrl+C is
 * handled in one place: it calls the current interrupt handler (stop a reply or task) and a
 * second press within 2 s exits.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

export type Choice = { key: string; label: string };

export interface Prompter {
  readonly interactive: boolean;
  /** Read a line; null on EOF (Ctrl+D). */
  line(prompt: string): Promise<string | null>;
  /** Ask until one of the keys is typed. Keys are case-sensitive; Enter picks the first. */
  choose(question: string, choices: Choice[]): Promise<string>;
  secret(prompt: string): Promise<string>;
  editText(initial: string): Promise<string>;
  /** What Ctrl+C does right now; return false to fall through to "press again to exit". */
  onInterrupt(handler: (() => void) | null): void;
  close(): void;
}

export class TtyPrompter implements Prompter {
  readonly interactive = true;
  private rl: readline.Interface;
  private interrupt: (() => void) | null = null;
  private lastSigint = 0;
  private muted = false;

  constructor(
    private stdin: NodeJS.ReadStream = process.stdin,
    private stdout: NodeJS.WriteStream = process.stdout,
  ) {
    this.rl = readline.createInterface({ input: stdin, output: stdout, terminal: true, historySize: 200 });
    const write = (this.rl as any)._writeToOutput?.bind(this.rl);
    (this.rl as any)._writeToOutput = (s: string) => {
      if (!this.muted) write?.(s);
      else if (s.includes("\n")) write?.("\n");
    };
    this.rl.on("SIGINT", () => this.sigint());
    process.on("SIGINT", () => this.sigint());
  }

  private sigint() {
    const now = Date.now();
    if (this.interrupt && now - this.lastSigint > 2000) {
      this.lastSigint = now;
      this.interrupt();
      return;
    }
    if (now - this.lastSigint < 2000) {
      this.stdout.write("\n");
      process.exit(130);
    }
    this.lastSigint = now;
    this.stdout.write("\n(Press Ctrl+C again to exit)\n");
    // Abandon the current line; the pending question resolves to "".
    this.rl.write(null, { ctrl: true, name: "u" });
    this.rl.write("\n");
  }

  onInterrupt(handler: (() => void) | null) {
    this.interrupt = handler;
  }

  line(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      const onClose = () => resolve(null);
      this.rl.once("close", onClose);
      this.rl.question(prompt, (a) => {
        this.rl.off("close", onClose);
        resolve(a);
      });
    });
  }

  async choose(question: string, choices: Choice[]): Promise<string> {
    const keys = choices.map((c) => c.key);
    for (;;) {
      const a = await this.line(`${question} `);
      if (a === null) return choices.at(-1)!.key; // EOF: take the safest (last) option
      const t = a.trim();
      if (t === "") return keys[0];
      if (keys.includes(t)) return t;
      const ci = keys.filter((k) => k.toLowerCase() === t.toLowerCase());
      if (ci.length === 1) return ci[0];
      this.stdout.write(`Type one of: ${choices.map((c) => `${c.key} (${c.label})`).join(", ")}\n`);
    }
  }

  async secret(prompt: string): Promise<string> {
    this.stdout.write(prompt);
    this.muted = true;
    try {
      return ((await this.line("")) ?? "").trim();
    } finally {
      this.muted = false;
    }
  }

  async editText(initial: string): Promise<string> {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vard-")), "plan.md");
    fs.writeFileSync(file, initial);
    const editor = process.env.VISUAL || process.env.EDITOR || "vi";
    this.rl.pause();
    const raw = this.stdin.isRaw;
    if (raw) this.stdin.setRawMode(false);
    try {
      Bun.spawnSync(["/bin/sh", "-c", `${editor} "$1"`, "sh", file], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      return fs.readFileSync(file, "utf8");
    } finally {
      if (raw) this.stdin.setRawMode(true);
      this.rl.resume();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  }

  close() {
    this.rl.close();
  }
}

/**
 * For pipes and scripts: never blocks on input. With `yes`, plans are approved and commands
 * allowed once; without it, anything that needs a person is declined.
 */
export class NonInteractivePrompter implements Prompter {
  readonly interactive = false;
  constructor(private yes: boolean) {}
  async line() {
    return null;
  }
  async choose(_q: string, choices: Choice[]) {
    return this.yes ? choices[0].key : choices.at(-1)!.key;
  }
  async secret(): Promise<string> {
    throw new Error("This needs a terminal. Use an environment variable instead.");
  }
  async editText(initial: string) {
    return initial;
  }
  onInterrupt(handler: (() => void) | null) {
    process.removeAllListeners("SIGINT");
    if (handler) process.on("SIGINT", handler);
  }
  close() {}
}

/** Scripted answers, for tests. */
export class ScriptedPrompter implements Prompter {
  readonly interactive = true;
  asked: string[] = [];
  constructor(private answers: string[]) {}
  private next() {
    return this.answers.shift() ?? null;
  }
  async line(prompt: string) {
    this.asked.push(prompt);
    return this.next();
  }
  async choose(q: string, choices: Choice[]) {
    this.asked.push(q);
    const a = this.next();
    return a && choices.some((c) => c.key === a) ? a : choices[0].key;
  }
  async secret(prompt: string) {
    this.asked.push(prompt);
    return this.next() ?? "";
  }
  async editText(initial: string) {
    return this.next() ?? initial;
  }
  onInterrupt() {}
  close() {}
}
