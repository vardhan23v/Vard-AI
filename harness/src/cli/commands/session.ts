/** `vard`: the interactive session. Plain lines chat; slash commands run tasks and settings. */
import fs from "node:fs";
import path from "node:path";
import { modelLabel, type ModelChoice } from "../../catalog";
import type { ChatTurn } from "../client";
import { chooseModel, providerName, type Ctx } from "../context";
import { colorDiff } from "../render";
import { streamReply } from "./ask";
import { memoryCommand } from "./memory";
import { reviewChanges, runTask } from "./task";
import { VERSION } from "../../server";

export type SessionFile = { file: string; messages: ChatTurn[] };

export function sessionsDir(ctx: Ctx) {
  return path.join(ctx.config.home, "sessions");
}

export function newSession(ctx: Ctx): SessionFile {
  const dir = sessionsDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return { file: path.join(dir, `${stamp}.jsonl`), messages: [] };
}

export function loadSession(file: string): SessionFile {
  const messages = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    })
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }) as ChatTurn);
  return { file, messages };
}

/** Saved conversations, newest first. */
export function listSessions(
  ctx: Ctx,
): { file: string; mtime: number; title: string; count: number }[] {
  const dir = sessionsDir(ctx);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const file = path.join(dir, f);
      const s = loadSession(file);
      const first = s.messages.find((m) => m.role === "user")?.content ?? "";
      return {
        file,
        mtime: fs.statSync(file).mtimeMs,
        title: first.replace(/\s+/g, " ").slice(0, 70),
        count: s.messages.length,
      };
    })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.mtime - a.mtime);
}

/** The most recently written session, if any. */
export function lastSession(ctx: Ctx): SessionFile | null {
  const last = listSessions(ctx)[0];
  return last ? loadSession(last.file) : null;
}

export function append(s: SessionFile, m: ChatTurn) {
  s.messages.push(m);
  fs.appendFileSync(s.file, JSON.stringify({ ...m, ts: Date.now() }) + "\n");
}

const HELP = `
  Type a message to chat. Commands:
  /task <what to do>   run the coding agent in this repo
  /diff                show the last kept task's changes
  /merge, /discard     merge or drop the last kept task
  /model [id]          show or switch the model (vard models lists them)
  /memory              what Vard remembers about this project
  /plan on|off         ask for a plan before the agent edits
  /clear               start a new conversation
  /help, /exit         this help, quit (or Ctrl+D)
  Ctrl+C stops a reply or task; press it twice to quit.
`;

export async function session(
  ctx: Ctx,
  opts: { continue?: boolean; model?: string; provider?: string },
) {
  const t = ctx.theme;
  let choice: ModelChoice = chooseModel(ctx, opts);
  let planFirst = ctx.config.load().planFirst;
  let s = (opts.continue && lastSession(ctx)) || newSession(ctx);
  let kept: { taskId: string; branch: string; path: string } | undefined;

  ctx.out.write(
    `${t.star("✦")} ${t.bold("Vard AI")} ${t.muted(`v${VERSION}`)}\n` +
      t.muted(`${modelLabel(choice)} (${providerName(choice.provider)}) · ${ctx.cwd}\n`) +
      t.muted(`Chat below, /task to run the agent, /help for more.\n`),
  );
  if (opts.continue && s.messages.length)
    ctx.out.write(t.muted(`Continuing a conversation of ${s.messages.length} messages.\n`));

  for (;;) {
    const line = await ctx.prompter.line(`\n${t.star("›")} `);
    if (line === null) break;
    const input = line.trim();
    if (!input) continue;
    try {
      if (!input.startsWith("/")) {
        append(s, { role: "user", content: input });
        ctx.out.write("\n");
        const r = await streamReply(ctx, choice, s.messages);
        if (r.text) append(s, { role: "assistant", content: r.text });
        else s.messages.pop(); // nothing came back: let the user retry without a dangling turn
        continue;
      }
      const [cmd, ...rest] = input.split(/\s+/);
      const arg = input.slice(cmd.length).trim();
      switch (cmd) {
        case "/exit":
        case "/quit":
          return 0;
        case "/help":
          ctx.out.write(HELP);
          break;
        case "/memory":
          await memoryCommand(ctx, rest.length ? rest : ["list"]);
          break;
        case "/clear":
          s = newSession(ctx);
          ctx.out.write(t.muted("New conversation.\n"));
          break;
        case "/model":
          if (!arg)
            ctx.out.write(`${choice.model} ${t.muted(`(${providerName(choice.provider)})`)}\n`);
          else {
            choice = chooseModel(ctx, { model: rest[0], provider: rest[1] });
            ctx.out.write(
              `${t.sage("✓")} Using ${modelLabel(choice)} ${t.muted(`(${providerName(choice.provider)})`)}\n`,
            );
          }
          break;
        case "/plan":
          if (arg === "on" || arg === "off") planFirst = arg === "on";
          ctx.out.write(`Plan first: ${planFirst ? "on" : "off"}\n`);
          break;
        case "/task":
        case "/run": {
          if (!arg) {
            ctx.out.write("Usage: /task <what the agent should do>\n");
            break;
          }
          if (kept) {
            ctx.out.write(
              t.muted(
                `(Leaving ${kept.branch} as it is; merge it later with git merge ${kept.branch}.)\n`,
              ),
            );
            kept = undefined;
          }
          const r = await runTask(ctx, arg, { ...choice, plan: planFirst });
          if (r.kept) kept = { taskId: r.taskId, ...r.kept };
          break;
        }
        case "/diff":
          if (!kept) ctx.out.write("No kept task. Run /task first.\n");
          else ctx.out.write(colorDiff((await ctx.client.diff(kept.taskId)).diff, t) + "\n");
          break;
        case "/merge":
        case "/discard":
          if (!kept) ctx.out.write("No kept task.\n");
          else if (cmd === "/merge") {
            await ctx.client.merge(kept.taskId);
            ctx.out.write(`${t.sage("✓")} Merged ${kept.branch}.\n`);
            kept = undefined;
          } else {
            await ctx.client.discard(kept.taskId);
            ctx.out.write(t.muted("Discarded.\n"));
            kept = undefined;
          }
          break;
        case "/review":
          if (kept) {
            const k = await reviewChanges(ctx, kept.taskId, kept);
            if (!k) kept = undefined;
          }
          break;
        default:
          ctx.out.write(`Unknown command ${cmd}. Type /help.\n`);
      }
    } catch (e) {
      ctx.spinner.stop();
      ctx.err.write(t.danger(`${(e as Error).message}\n`));
    }
  }
  return 0;
}
