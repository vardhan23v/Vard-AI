import { expect, test } from "bun:test";
import path from "node:path";
import { tmpDir } from "./helpers";

async function roundTrip(cmd: string[], lines: string[]): Promise<any[]> {
  const proc = Bun.spawn(cmd, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, VARD_TRACE_DIR: tmpDir("vard-traces-") },
  });
  for (const l of lines) proc.stdin.write(l + "\n");
  await proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

test("stdio entry answers ping with pong and reports bad requests", async () => {
  const main = path.join(import.meta.dir, "..", "src", "main.ts");
  const events = await roundTrip([process.execPath, main], ['{"id":"1","type":"ping"}', "not json", '{"id":"2","type":"nope"}']);
  expect(events.find((e) => e.id === "1")).toMatchObject({ type: "pong", id: "1" });
  expect(events.filter((e) => e.type === "error")).toHaveLength(2);
  expect(events.find((e) => e.id === "2")?.type).toBe("error");
});
