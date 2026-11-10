/**
 * Live smoke test against a real provider (OpenRouter free models only).
 *
 *   VARD_LIVE_KEY="$(security find-generic-password -s ai.vard.desktop -a openai-compatible -w)" \
 *     bun scripts/live-smoke.ts [model]
 *
 * The key is read from the environment only. It is never written to disk, and it is
 * scrubbed from everything this script prints.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const key = process.env.VARD_LIVE_KEY;
if (!key) throw new Error("set VARD_LIVE_KEY");
const model = process.argv[2] ?? "xingchen-agi/xing4.0-29b-a4b:free";
if (!model.endsWith(":free")) throw new Error("only :free model ids are allowed");
const provider = { provider: "openai-compatible", baseUrl: "https://openrouter.ai/api/v1", model, apiKey: key };
const scrub = (s: string) => s.split(key).join("***");

const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vard-live-")));
const git = (...a: string[]) => Bun.spawnSync(["git", ...a], { cwd: repo });
git("init", "-q", "-b", "main");
git("config", "user.email", "t@example.com");
git("config", "user.name", "T");
fs.writeFileSync(path.join(repo, "hello.txt"), "hello world\n");
git("add", "-A");
git("commit", "-q", "-m", "init");

const proc = Bun.spawn([process.execPath, path.join(import.meta.dir, "..", "src", "main.ts")], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
  env: { ...process.env, VARD_LIVE_KEY: "", VARD_TRACE_DIR: path.join(repo, ".traces") },
});
const send = (o: object) => proc.stdin.write(JSON.stringify(o) + "\n");

const tokens: Record<string, number> = {};
let pendingDone = 2;
const timeout = setTimeout(() => {
  console.log("TIMEOUT");
  proc.kill();
}, 600_000);

send({ id: "chat1", type: "chat.send", provider, messages: [{ role: "user", content: "Reply with exactly: pong" }] });
send({
  id: "task1",
  type: "task.start",
  taskId: "live1",
  projectRoot: repo,
  prompt: "In hello.txt, change the word 'world' to 'vard'. Use edit_file. Then finish with a one-line summary.",
  provider,
  planFirst: false,
  useWorktree: true,
  maxSteps: 8,
});

const decoder = new TextDecoder();
let buf = "";
for await (const chunk of proc.stdout) {
  buf += decoder.decode(chunk, { stream: true });
  let nl: number;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    const e = JSON.parse(line);
    if (e.type === "token") {
      tokens[e.id] = (tokens[e.id] ?? 0) + 1;
      continue;
    }
    console.log(scrub(JSON.stringify(e)).slice(0, 400));
    if (e.type === "approval_request")
      send({ id: `a-${e.approvalId}`, type: "task.approve", taskId: e.taskId, approvalId: e.approvalId, decision: "allow_once" });
    if (e.type === "done" || (e.type === "error" && e.id === "chat1")) pendingDone--;
    if (pendingDone === 0) proc.stdin.end();
  }
}
clearTimeout(timeout);
console.log("token events:", JSON.stringify(tokens));
const wt = path.join(repo, ".vard/worktrees/live1/hello.txt");
console.log("worktree hello.txt:", fs.existsSync(wt) ? JSON.stringify(fs.readFileSync(wt, "utf8")) : "(missing)");
