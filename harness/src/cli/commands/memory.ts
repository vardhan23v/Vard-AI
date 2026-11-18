/**
 * `vard memory …`: the current project's memory (<project>/.vard/memory.json).
 *
 *   list [--category c] [--search q]   entries with ids, status and age
 *   show | export                      readable Markdown
 *   add <category> <text…>             a note you know to be true (verified)
 *   edit <id> | rm <id> | verify <id>  one entry (ids can be shortened)
 *   analyze                            re-run the project analysis
 *   clear                              delete every entry (asks first)
 *   config [key value]                 settings: enabled, recall, autoUpdate, maxContextChars, exclude
 *   path                               where the file lives
 */
import {
  analyze,
  CATEGORIES,
  Category,
  categoryTitle,
  MemoryError,
  MemorySettings,
  MemoryStore,
  type MemoryEntry,
  type Proposal,
} from "../../memory";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

export const memoryFor = (cwd: string) => new MemoryStore(gitRoot(cwd) ?? cwd);

export const itemLabel = (it: { category: string; text: string }) =>
  `${categoryTitle(it.category as Category).toLowerCase()}: ${it.text}`;

export function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function findEntry(store: MemoryStore, id: string | undefined): MemoryEntry {
  if (!id) throw new MemoryError("Which entry? Run `vard memory list` to see ids.");
  const all = store.list({ history: true });
  const hits = all.filter(
    (e) => e.id === id || e.id.startsWith(id) || e.id.slice(2).startsWith(id),
  );
  if (hits.length === 1) return hits[0];
  if (!hits.length) throw new MemoryError(`No memory with id ${id}. Run \`vard memory list\`.`);
  throw new MemoryError(`${id} matches several entries; use more of the id.`);
}

function printList(ctx: Ctx, entries: MemoryEntry[]) {
  const t = ctx.theme;
  if (!entries.length) {
    ctx.out.write(t.muted("Nothing matches.\n"));
    return;
  }
  for (const c of CATEGORIES) {
    const items = entries.filter((e) => e.category === c.id);
    if (!items.length) continue;
    ctx.out.write(`\n${t.bold(c.title)}\n`);
    for (const e of items) {
      const badge = e.status === "verified" ? t.sage("verified") : t.star("inferred");
      ctx.out.write(`  ${t.muted(e.id.slice(2, 8))} ${e.text}\n`);
      ctx.out.write(
        `         ${badge} ${t.muted(`· ${e.source === "scan" ? "analysis" : e.source === "user" ? "you" : "task"} · ${ago(e.updatedAt)}`)}\n`,
      );
    }
  }
  ctx.out.write("\n");
}

export async function memoryCommand(
  ctx: Ctx,
  args: string[],
  flags: { category?: string; search?: string } = {},
): Promise<number> {
  const t = ctx.theme;
  const store = memoryFor(ctx.cwd);
  const [sub = "list", ...rest] = args;
  try {
    switch (sub) {
      case "path":
        ctx.out.write(store.path + "\n");
        return 0;
      case "list":
      case "ls":
      case "search": {
        const query = sub === "search" ? rest.join(" ") : flags.search;
        const category = flags.category ? Category.parse(flags.category) : undefined;
        if (!store.exists() && !query) {
          ctx.out.write(
            t.muted(
              "No memory for this project yet. It starts with your first task, or run: vard memory analyze\n",
            ),
          );
          return 0;
        }
        const entries = store.list({ category, query });
        printList(ctx, entries);
        const s = store.settings();
        ctx.out.write(
          t.muted(
            `${store.active().length} notes · updates after tasks: ${s.autoUpdate} · ${s.enabled ? "on" : "off"} · ${store.path}\n`,
          ),
        );
        return 0;
      }
      case "show":
      case "export":
        ctx.out.write(
          store.exists() ? store.toMarkdown() : t.muted("No memory for this project yet.\n"),
        );
        return 0;
      case "add": {
        const category = Category.safeParse(rest[0]);
        const text = rest.slice(1).join(" ");
        if (!category.success || !text) {
          ctx.err.write(
            `Usage: vard memory add <category> <text>\nCategories: ${CATEGORIES.map((c) => c.id).join(", ")}\n`,
          );
          return 1;
        }
        const r = store.add({ category: category.data, text, status: "verified", source: "user" });
        ctx.out.write(
          r.entry
            ? `${t.sage("✓")} Saved ${t.muted(r.entry.id.slice(2, 8))}\n`
            : t.muted(`Already known: ${r.duplicateOf!.text}\n`),
        );
        return 0;
      }
      case "edit": {
        const e = findEntry(store, rest[0]);
        if (!ctx.prompter.interactive) {
          ctx.err.write("vard memory edit needs a terminal.\n");
          return 1;
        }
        const text = (await ctx.prompter.editText(e.text + "\n")).trim();
        if (!text || text === e.text) {
          ctx.out.write(t.muted("No change.\n"));
          return 0;
        }
        store.update(e.id, { text, status: "verified" });
        ctx.out.write(`${t.sage("✓")} Updated\n`);
        return 0;
      }
      case "rm":
      case "delete": {
        const e = findEntry(store, rest[0]);
        store.remove(e.id);
        ctx.out.write(`Deleted: ${e.text}\n`);
        return 0;
      }
      case "verify": {
        const e = findEntry(store, rest[0]);
        store.verify(e.id);
        ctx.out.write(`${t.sage("✓")} Marked as verified: ${e.text}\n`);
        return 0;
      }
      case "analyze":
      case "rebuild": {
        analyze(store);
        const n = store.list().filter((e) => e.source === "scan").length;
        ctx.out.write(
          `${t.sage("✓")} Analyzed the project: ${n} facts (your own notes are kept)\n`,
        );
        return 0;
      }
      case "clear": {
        const n = store.active().length;
        if (!n) return 0;
        const a = await ctx.prompter.choose(
          `Delete all ${n} notes for this project? This can't be undone. [y/N]`,
          [
            { key: "n", label: "keep" },
            { key: "y", label: "delete" },
          ],
        );
        if (a === "y") {
          store.clear();
          ctx.out.write("Deleted.\n");
        }
        return 0;
      }
      case "config": {
        const [key, ...valueParts] = rest;
        if (!key) {
          const s = store.settings();
          for (const [k, v] of Object.entries(s))
            ctx.out.write(`${k.padEnd(16)} ${Array.isArray(v) ? v.join(", ") || "(none)" : v}\n`);
          return 0;
        }
        const value = valueParts.join(" ");
        const parsed: Record<string, unknown> = {};
        if (key === "enabled" || key === "recall") parsed[key] = /^(on|true|yes|1)$/i.test(value);
        else if (key === "autoUpdate") parsed[key] = value;
        else if (key === "maxContextChars") parsed[key] = Number(value);
        else if (key === "exclude") parsed[key] = value.split(/[,\s]+/).filter(Boolean);
        else {
          ctx.err.write(
            "Settings: enabled, recall, autoUpdate (off|ask|auto), maxContextChars, exclude\n",
          );
          return 1;
        }
        const ok = MemorySettings.partial().safeParse(parsed);
        if (!ok.success) {
          ctx.err.write(`Invalid value for ${key}.\n`);
          return 1;
        }
        store.setSettings(ok.data);
        ctx.out.write(`${t.sage("✓")} ${key} = ${value}\n`);
        return 0;
      }
      default:
        ctx.err.write(
          "Usage: vard memory [list | search <q> | show | add <category> <text> | edit <id> | rm <id> | verify <id> | analyze | clear | config [key value] | path]\n",
        );
        return 1;
    }
  } catch (e) {
    if (e instanceof MemoryError || (e as Error).name === "ZodError") {
      ctx.err.write(t.danger(`${(e as Error).message}\n`));
      return 1;
    }
    throw e;
  }
}

/**
 * After a task: report what was saved automatically, and offer the rest. Interactive runs ask;
 * scripts save only with --remember. Accepted notes are saved as verified. Returns how many.
 */
export async function offerMemories(
  ctx: Ctx,
  items: Proposal[],
  opts: { remember?: boolean; taskId?: string },
): Promise<number> {
  if (!items.length) return 0;
  const t = ctx.theme;
  const store = memoryFor(ctx.cwd);
  const auto = items.filter((i) => i.autoSaved);
  const pending = items.filter((i) => !i.autoSaved);
  if (auto.length) {
    ctx.out.write(
      `\n${t.star(t.bold("Added to project memory"))} ${t.muted("(inferred; verify or remove with vard memory)")}\n`,
    );
    for (const it of auto) ctx.out.write(`  ${t.muted(it.id.slice(2, 8))} ${itemLabel(it)}\n`);
  }
  if (!pending.length) return 0;
  ctx.out.write(`\n${t.star(t.bold("Remember for next time?"))}\n`);
  pending.forEach((it, i) =>
    ctx.out.write(
      `  ${t.muted(String(i + 1) + ".")} ${itemLabel(it)}${it.replacesText ? t.muted(`\n      updates: ${it.replacesText}`) : ""}\n`,
    ),
  );
  let chosen: Proposal[] = [];
  if (!ctx.prompter.interactive) chosen = opts.remember ? pending : [];
  else {
    const a = await ctx.prompter.choose(`${t.muted("[y] save all  [c] choose  [n] none")}`, [
      { key: "y", label: "all" },
      { key: "c", label: "choose" },
      { key: "n", label: "none" },
    ]);
    if (a === "y") chosen = pending;
    else if (a === "c")
      for (const it of pending) {
        const k = await ctx.prompter.choose(`  ${itemLabel(it)} ${t.muted("[y/n]")}`, [
          { key: "y", label: "save" },
          { key: "n", label: "skip" },
        ]);
        if (k === "y") chosen.push(it);
      }
  }
  if (!chosen.length) {
    if (!ctx.prompter.interactive)
      ctx.out.write(t.muted("Not saved (pass --remember to save suggestions in scripts).\n"));
    return 0;
  }
  let saved = 0;
  for (const it of chosen) {
    try {
      const r = store.add({
        category: it.category,
        text: it.text,
        status: "verified",
        source: "task",
        taskId: opts.taskId,
        replaces: it.replaces,
      });
      if (r.entry) saved++;
    } catch (e) {
      ctx.err.write(t.danger(`${(e as Error).message}\n`));
    }
  }
  ctx.out.write(`${t.sage("✓")} Saved ${saved} to ${store.path}\n`);
  return saved;
}
