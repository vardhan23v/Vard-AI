/**
 * Terminal output in the Starry Night palette (24-bit ANSI). Colour is off when stdout isn't a
 * TTY or NO_COLOR is set, so piped output stays plain text.
 */
export interface Writer {
  write(s: string): void;
}

export type Theme = ReturnType<typeof makeTheme>;

export function makeTheme(color: boolean) {
  const rgb = (r: number, g: number, b: number) => (s: string) =>
    color ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s;
  const sgr = (on: number, off: number) => (s: string) =>
    color ? `\x1b[${on}m${s}\x1b[${off}m` : s;
  return {
    color,
    star: rgb(0xc2, 0xb7, 0x5d),
    cerulean: rgb(0x5e, 0x7b, 0xa6),
    sage: rgb(0xb2, 0xb5, 0x80),
    danger: rgb(0xff, 0x9b, 0x8f),
    ink2: rgb(0xb5, 0xb8, 0x85),
    muted: rgb(0x8a, 0x97, 0x92),
    bold: sgr(1, 22),
    dim: sgr(2, 22),
  };
}

export function colorEnabled(isTTY: boolean, env: Record<string, string | undefined>) {
  return isTTY && !env.NO_COLOR && env.TERM !== "dumb";
}

/**
 * Prints streamed model text. Lines inside ``` fences are tinted so code stands out; everything
 * else passes through untouched. Works on arbitrary chunk boundaries.
 */
export class TokenPrinter {
  private line = "";
  private inFence = false;
  wrote = false;
  constructor(
    private out: Writer,
    private theme: Theme,
  ) {}

  write(chunk: string) {
    const parts = chunk.split("\n");
    parts.forEach((part, i) => {
      if (part) this.out.write(this.inFence ? this.theme.sage(part) : part);
      this.line += part;
      if (i < parts.length - 1) {
        this.out.write("\n");
        if (this.line.trimStart().startsWith("```")) this.inFence = !this.inFence;
        this.line = "";
      }
    });
    if (chunk) this.wrote = true;
  }

  /** End the stream on a fresh line. */
  end() {
    if (this.line) this.out.write("\n");
    this.line = "";
    this.inFence = false;
  }
}

/** A one-line spinner on stderr; a no-op when stderr isn't a TTY. */
export class Spinner {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private label = "";
  constructor(
    private err: Writer,
    private theme: Theme,
    private enabled: boolean,
  ) {}

  start(label: string) {
    this.label = label;
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.draw(), 90);
    this.draw();
  }

  private draw() {
    const frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
    this.err.write(
      `\r\x1b[2K${this.theme.star(frames[this.frame++ % frames.length])} ${this.theme.muted(this.label)}`,
    );
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.err.write("\r\x1b[2K");
  }
}

/** Colour a unified diff. */
export function colorDiff(diff: string, theme: Theme): string {
  return diff
    .split("\n")
    .map((l) => {
      if (l.startsWith("+++") || l.startsWith("---")) return theme.bold(l);
      if (l.startsWith("+")) return theme.sage(l);
      if (l.startsWith("-")) return theme.danger(l);
      if (l.startsWith("@@")) return theme.cerulean(l);
      if (l.startsWith("diff ")) return theme.star(l);
      return l;
    })
    .join("\n");
}

/** A short human summary of a tool call's input, e.g. the path or command. */
export function describeToolInput(tool: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const pick = i.command ?? i.path ?? i.pattern ?? i.query;
  if (typeof pick === "string") return pick.length > 100 ? pick.slice(0, 97) + "…" : pick;
  if (tool === "todo_write") return "";
  const s = JSON.stringify(input);
  return s && s !== "{}" ? (s.length > 100 ? s.slice(0, 97) + "…" : s) : "";
}

export function indent(text: string, pad = "  "): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

/** Adds a next step to provider errors people hit often. */
export function explainError(message: string): string {
  if (/ZDR|data policy|guardrail/i.test(message))
    return `${message}\nYour OpenRouter privacy settings block this model. Allow it at https://openrouter.ai/settings/privacy (turn off "ZDR endpoints only" or allow providers that may train or log), or pick another model with vard models.`;
  if (/no longer available|not a valid model|model not found/i.test(message))
    return `${message}\nPick another model with: vard models`;
  if (/HTTP 401|Missing Authentication|invalid api key|unauthorized/i.test(message))
    return `${message}\nThe saved key was rejected. Replace it with: vard keys set <provider>`;
  return message;
}
