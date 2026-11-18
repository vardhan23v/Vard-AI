/** `vard memory [show|edit|rebuild|clear|path]`: the current project's memory. */
import { MemoryStore, type MemoryItem } from "../../memory";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

export const memoryFor = (cwd: string) => new MemoryStore(gitRoot(cwd) ?? cwd);

const SECTION_LABEL: Record<string, string> = {
  overview: "overview",
  conventions: "convention",
  decisions: "decision",
  issues: "issue",
};

export const itemLabel = (it: MemoryItem) => `${SECTION_LABEL[it.section] ?? it.section}: ${it.text}`;

export async function memoryCommand(ctx: Ctx, args: string[]): Promise<number> {
  const t = ctx.theme;
  const store = memoryFor(ctx.cwd);
  const sub = args[0] ?? "show";
  switch (sub) {
    case "path":
      ctx.out.write(store.path + "\n");
      return 0;
    case "show": {
      const text = store.read();
      if (!text.trim()) {
        ctx.out.write(t.muted("No memory for this project yet. It starts with your first task, or run: vard memory rebuild\n"));
        return 0;
      }
      ctx.out.write(text.endsWith("\n") ? text : text + "\n");
      ctx.out.write(t.muted(`\n${store.entries().length} entries · ${store.path}\n`));
      return 0;
    }
    case "rebuild":
      store.rebuildOverview();
      ctx.out.write(`${t.sage("✓")} Rebuilt the project overview in ${store.path}\n`);
      return 0;
    case "edit": {
      if (!store.exists()) store.rebuildOverview();
      if (!ctx.prompter.interactive) {
        ctx.err.write("vard memory edit needs a terminal.\n");
        return 1;
      }
      const edited = await ctx.prompter.editText(store.read());
      store.write(edited);
      ctx.out.write(`${t.sage("✓")} Saved (${store.entries().length} entries)\n`);
      return 0;
    }
    case "clear": {
      if (!store.exists()) return 0;
      const a = await ctx.prompter.choose(`Delete this project's memory (${store.entries().length} entries)? [y/N]`, [
        { key: "n", label: "keep" },
        { key: "y", label: "delete" },
      ]);
      if (a === "y") {
        store.clear();
        ctx.out.write("Deleted.\n");
      }
      return 0;
    }
    default:
      ctx.err.write("Usage: vard memory [show | edit | rebuild | clear | path]\n");
      return 1;
  }
}

/**
 * After a task: offer the suggested memories. Interactive runs ask; scripts save only with
 * --remember. Returns how many were saved.
 */
export async function offerMemories(ctx: Ctx, items: MemoryItem[], opts: { remember?: boolean }): Promise<number> {
  if (!items.length) return 0;
  const t = ctx.theme;
  const store = memoryFor(ctx.cwd);
  ctx.out.write(`\n${t.star(t.bold("Remember for next time?"))}\n`);
  items.forEach((it, i) => ctx.out.write(`  ${t.muted(String(i + 1) + ".")} ${itemLabel(it)}\n`));
  let chosen: MemoryItem[] = [];
  if (!ctx.prompter.interactive) chosen = opts.remember ? items : [];
  else {
    const a = await ctx.prompter.choose(`${t.muted("[y] save all  [c] choose  [n] none")}`, [
      { key: "y", label: "all" },
      { key: "c", label: "choose" },
      { key: "n", label: "none" },
    ]);
    if (a === "y") chosen = items;
    else if (a === "c")
      for (const it of items) {
        const k = await ctx.prompter.choose(`  ${itemLabel(it)} ${t.muted("[y/n]")}`, [
          { key: "y", label: "save" },
          { key: "n", label: "skip" },
        ]);
        if (k === "y") chosen.push(it);
      }
  }
  if (!chosen.length) {
    if (!ctx.prompter.interactive) ctx.out.write(t.muted("Not saved (pass --remember to save suggestions in scripts).\n"));
    return 0;
  }
  store.ensure();
  const added = store.add(chosen);
  ctx.out.write(`${t.sage("✓")} Saved ${added.length} to ${store.path}\n`);
  return added.length;
}
