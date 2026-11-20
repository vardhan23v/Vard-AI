/** `vard models` lists models; `vard models use <id>` sets the default. */
import { PROVIDERS, type ModelChoice } from "../../catalog";
import { chooseModel, providerName, type Ctx } from "../context";

export async function modelsCommand(
  ctx: Ctx,
  args: string[],
  flags: { provider?: string },
): Promise<number> {
  const t = ctx.theme;
  const cfg = ctx.config.load();
  if (args[0] === "use") {
    if (!args[1]) {
      ctx.err.write("Usage: vard models use <model-id> [--provider <name>]\n");
      return 1;
    }
    const choice = chooseModel(ctx, { model: args[1], provider: flags.provider });
    ctx.config.save({ ...cfg, ...choice });
    ctx.out.write(
      `${t.sage("✓")} Default model: ${choice.model} ${t.muted(`(${providerName(choice.provider)})`)}\n`,
    );
    return 0;
  }
  const flat: ModelChoice[] = [];
  for (const p of PROVIDERS) {
    const hasKey = !p.needsKey || !!ctx.keys.resolve(p.id);
    ctx.out.write(
      `\n${t.bold(p.label)} ${t.muted(providerName(p.id))}${hasKey ? "" : t.muted("  · no key")}\n`,
    );
    for (const m of p.models) {
      flat.push({ provider: p.id, model: m.id });
      const current = cfg.provider === p.id && cfg.model === m.id;
      const num = t.muted(String(flat.length).padStart(2));
      ctx.out.write(
        `  ${num} ${current ? t.star("●") : " "} ${m.id}${m.note ? t.muted(`  ${m.note}`) : ""}\n`,
      );
    }
  }
  ctx.out.write("\n");
  if (!ctx.prompter.interactive) return 0;
  const a = (
    await ctx.prompter.line(`Number to make the default (Enter to keep ${cfg.model}): `)
  )?.trim();
  const n = Number(a);
  if (a && Number.isInteger(n) && flat[n - 1]) {
    ctx.config.save({ ...cfg, ...flat[n - 1] });
    ctx.out.write(`${t.sage("✓")} Default model: ${flat[n - 1].model}\n`);
  }
  return 0;
}
