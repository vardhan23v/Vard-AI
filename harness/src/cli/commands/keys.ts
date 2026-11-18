/** `vard keys [list|set|remove] <provider>` */
import { PROVIDERS, providerInfo } from "../../catalog";
import { parseProvider, providerName, type Ctx } from "../context";
import { mask } from "../keys";

export async function keysCommand(ctx: Ctx, args: string[]): Promise<number> {
  const t = ctx.theme;
  const [sub = "list", name] = args;
  if (sub === "list") {
    for (const p of PROVIDERS.filter((x) => x.needsKey)) {
      const k = ctx.keys.resolve(p.id);
      const where = k ? (k.source === "env" ? `from $${k.envVar}` : "from Keychain") : "";
      const mark = k ? t.sage("✓") : t.muted("○");
      const detail = k ? `${mask(k.key)} ${t.muted(where)}` : t.muted("no key");
      ctx.out.write(`${mark} ${providerName(p.id).padEnd(11)} ${detail}\n`);
    }
    return 0;
  }
  if (sub !== "set" && sub !== "remove") {
    ctx.err.write("Usage: vard keys [list | set <provider> | remove <provider>]\n");
    return 1;
  }
  if (!name) {
    ctx.err.write(`Which provider? e.g. vard keys ${sub} openrouter\n`);
    return 1;
  }
  const id = parseProvider(name);
  const info = providerInfo(id)!;
  if (!info.needsKey) {
    ctx.out.write(`${info.label} doesn't need a key.\n`);
    return 0;
  }
  if (sub === "remove") {
    const ok = ctx.keys.remove(id);
    ctx.out.write(ok ? `Removed the ${info.label} key from your Keychain.\n` : `No ${info.label} key in your Keychain.\n`);
    return 0;
  }
  let key = ctx.stdinText?.trim() ?? "";
  if (!key) {
    if (info.keyUrl) ctx.out.write(t.muted(`Get a key at ${info.keyUrl}\n`));
    key = await ctx.prompter.secret(`Paste your ${info.label} API key (hidden): `);
  }
  if (!key) {
    ctx.err.write("No key entered; nothing changed.\n");
    return 1;
  }
  const prefix = info.keyHint.replace("…", "");
  if (prefix && !key.startsWith(prefix)) {
    ctx.err.write(
      t.danger(`That doesn't look like a ${info.label} key`) +
        ` (they start with ${prefix}; got ${key.slice(0, 6)}…). Nothing changed.\n`,
    );
    return 1;
  }
  const r = ctx.keys.set(id, key);
  if (r.code !== 0 && /already exists/i.test(r.stderr + r.stdout)) {
    ctx.err.write(
      t.danger(`macOS wouldn't let the CLI replace the key the app saved.`) +
        ` In the Vard AI app, open Settings → API keys and click Remove next to ${info.label}, then run this again.\n`,
    );
    return 1;
  }
  if (r.code !== 0) {
    ctx.err.write(t.danger(`Couldn't save the key: ${r.stderr.trim() || `security exited ${r.code}`}\n`));
    return 1;
  }
  ctx.out.write(`${t.sage("✓")} Saved the ${info.label} key to your Keychain. The Vard AI app uses it too.\n`);
  return 0;
}
