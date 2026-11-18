/** `vard ask "…"`: one streamed answer. Piped stdin is added as context. */
import { modelLabel } from "../../catalog";
import type { ChatTurn } from "../client";
import { chooseModel, providerWithKey, type Ctx } from "../context";
import { explainError, TokenPrinter } from "../render";

export function withStdin(prompt: string, stdinText?: string) {
  if (!stdinText?.trim()) return prompt;
  return `${prompt}\n\n\`\`\`\n${stdinText.replace(/\s+$/, "")}\n\`\`\``;
}

/** Streams one reply to ctx.out. Shared by `ask` and the interactive session. */
export async function streamReply(ctx: Ctx, choice: ReturnType<typeof chooseModel>, messages: ChatTurn[]) {
  const provider = providerWithKey(ctx, choice);
  const printer = new TokenPrinter(ctx.out, ctx.theme);
  ctx.spinner.start(`${modelLabel(choice)} is thinking…`);
  const { result, cancel } = ctx.client.chat(provider, messages, {
    token: (t) => {
      ctx.spinner.stop();
      printer.write(t);
    },
    retry: (msg, delayMs) => {
      ctx.spinner.stop();
      ctx.err.write(ctx.theme.muted(`Rate-limited (${msg}); retrying in ${Math.ceil(delayMs / 1000)}s…\n`));
      ctx.spinner.start("Waiting to retry…");
    },
  });
  ctx.prompter.onInterrupt(() => cancel());
  try {
    const r = await result;
    ctx.spinner.stop();
    printer.end();
    if (r.status === "cancelled") ctx.err.write(ctx.theme.muted("(stopped)\n"));
    if (r.status === "error") ctx.err.write(ctx.theme.danger(`Error: ${explainError(r.error ?? "")}\n`));
    return r;
  } finally {
    ctx.prompter.onInterrupt(null);
  }
}

export async function ask(ctx: Ctx, prompt: string, flags: { model?: string; provider?: string }): Promise<number> {
  const choice = chooseModel(ctx, flags);
  const r = await streamReply(ctx, choice, [{ role: "user", content: withStdin(prompt, ctx.stdinText) }]);
  return r.status === "done" ? 0 : r.status === "cancelled" ? 130 : 1;
}
