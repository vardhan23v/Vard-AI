/**
 * Every event of a task is appended to `~/.vard/traces/<task-id>.jsonl` so the UI timeline can
 * render it and runs can be replayed for debugging. Writes are synchronous to keep order exact.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const defaultTraceDir = () => path.join(os.homedir(), ".vard", "traces");

export class Tracer {
  readonly file: string;
  constructor(taskId: string, dir: string = defaultTraceDir()) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, `${taskId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`);
  }
  append(record: object) {
    try {
      fs.appendFileSync(this.file, JSON.stringify(record) + "\n");
    } catch {
      // Tracing must never break a task.
    }
  }
}

export function readTrace(file: string): any[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
