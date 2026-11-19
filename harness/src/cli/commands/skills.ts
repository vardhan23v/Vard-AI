/**
 * `vard skills …`: manage skills from the terminal (same folders and state as the app).
 *
 *   list                       built-in, global and this project's skills
 *   show <name>                details and instructions
 *   new <name> [--project] [--description "…"]
 *   edit <name>                edit SKILL.md (in $EDITOR, or piped text)
 *   import <folder|SKILL.md> [--project]   imported skills start disabled
 *   validate <name|path>
 *   enable | disable <name>
 *   rm <name>                  delete a global or project skill
 *   trust | untrust            this project's .vard/skills
 *   path                       where skills live
 */
import fs from "node:fs";
import path from "node:path";
import { applySkillChange, SkillError, sourceLabel, validateSkillText, type SkillRecord } from "../../skills";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

export async function skillsCommand(ctx: Ctx, args: string[], flags: { project?: boolean; description?: string }): Promise<number> {
  const t = ctx.theme;
  const projectRoot = gitRoot(ctx.cwd) ?? ctx.cwd;
  const reg = ctx.client.server.skillRegistry(projectRoot);
  const scope = flags.project ? "project" : "global";
  const [sub = "list", name, ...rest] = args;
  const need = () => {
    if (!name) throw new SkillError("not_found", `Which skill? Run \`vard skills list\`.`);
    const r = reg.find(name);
    if (!r) throw new SkillError("not_found", `No skill "${name}". Run \`vard skills list\`.`);
    return r;
  };
  const state = (r: SkillRecord) =>
    r.errors.length
      ? t.danger("invalid")
      : r.shadowedBy
        ? t.muted(`shadowed by ${r.shadowedBy}`)
        : !r.trusted
          ? t.star("needs trust")
          : !r.enabled
            ? t.muted("disabled")
            : t.sage("on");
  try {
    switch (sub) {
      case "list":
      case "ls": {
        const usage = reg.usage();
        for (const src of ["builtin", "global", "project"] as const) {
          const list = reg.all().filter((r) => r.source === src);
          if (!list.length) continue;
          ctx.out.write(`${t.bold(sourceLabel(src)[0].toUpperCase() + sourceLabel(src).slice(1))}\n`);
          for (const r of list) {
            const n = usage.filter((u) => u.skillId === r.id).length;
            ctx.out.write(
              `  ${r.name.padEnd(26)} ${state(r)}  ${t.muted((r.frontmatter?.description ?? r.errors[0] ?? "").slice(0, 70))}${n ? t.muted(` · used ${n}×`) : ""}\n`,
            );
          }
        }
        if (reg.all().some((r) => r.source === "project" && !r.trusted))
          ctx.out.write(t.star("This project's skills aren't trusted yet. Review them, then: vard skills trust\n"));
        return 0;
      }
      case "show": {
        const r = need();
        const fm = r.frontmatter;
        ctx.out.write(`${t.bold(r.name)} ${t.muted(`${fm?.version ?? ""} · ${sourceLabel(r.source)}`)}  ${state(r)}\n`);
        if (fm) ctx.out.write(`${fm.description}\n`);
        if (r.dir) ctx.out.write(t.muted(`${r.dir}\n`));
        if (fm?.tags.length) ctx.out.write(t.muted(`tags: ${fm.tags.join(", ")}\n`));
        if (fm?.roles.length) ctx.out.write(t.muted(`roles: ${fm.roles.join(", ")}\n`));
        if (fm?.scripts.length) ctx.out.write(t.muted(`scripts (always ask before running): ${fm.scripts.map((s) => s.name).join(", ")}\n`));
        const res = [...r.resources.references, ...r.resources.assets];
        if (res.length) ctx.out.write(t.muted(`resources: ${res.join(", ")}\n`));
        for (const e of r.errors) ctx.out.write(t.danger(`✗ ${e}\n`));
        for (const w of r.warnings) ctx.out.write(t.star(`! ${w}\n`));
        ctx.out.write(`\n${r.body}\n`);
        return 0;
      }
      case "new":
      case "create": {
        if (!name) throw new SkillError("invalid", 'Usage: vard skills new <name> [--project] [--description "…"]');
        const id = applySkillChange(reg, { op: "create", scope, name, description: flags.description ?? `Instructions for ${name.replace(/-/g, " ")}.` }).id!;
        const r = reg.find(id)!;
        ctx.out.write(`${t.sage("✓")} Created ${t.bold(id)} at ${r.dir}\n${t.muted(`Edit it with: vard skills edit ${name}${scope === "project" ? " --project" : ""}`)}\n`);
        return 0;
      }
      case "edit": {
        const r = need();
        if (r.source === "builtin") throw new SkillError("invalid", "Built-in skills can't be edited. Create your own: vard skills new <name>");
        const text = ctx.stdinText?.trim() ? ctx.stdinText : ctx.prompter.interactive ? await ctx.prompter.editText(r.text) : "";
        if (!text.trim() || text === r.text) {
          ctx.out.write(t.muted("No changes.\n"));
          return 0;
        }
        applySkillChange(reg, { op: "save", scope: r.source as "global" | "project", name: r.name, text });
        ctx.out.write(`${t.sage("✓")} Saved ${r.id}\n`);
        return 0;
      }
      case "import": {
        if (!name) throw new SkillError("invalid", "Usage: vard skills import <folder or SKILL.md> [--project]");
        const id = applySkillChange(reg, { op: "import", scope, from: path.resolve(ctx.cwd, name) }).id!;
        ctx.out.write(`${t.sage("✓")} Imported ${t.bold(id)} ${t.muted("(disabled: review it, then vard skills enable " + id.split(":")[1] + ")")}\n`);
        return 0;
      }
      case "validate": {
        if (!name) throw new SkillError("invalid", "Usage: vard skills validate <name|path>");
        const p = path.resolve(ctx.cwd, name);
        let errors: string[];
        let warnings: string[];
        if (fs.existsSync(p)) {
          const file = fs.statSync(p).isDirectory() ? path.join(p, "SKILL.md") : p;
          const dir = path.dirname(file);
          const v = validateSkillText(fs.readFileSync(file, "utf8"), { dir, folderName: path.basename(dir) });
          ({ errors, warnings } = v);
        } else ({ errors, warnings } = need());
        for (const e of errors) ctx.out.write(t.danger(`✗ ${e}\n`));
        for (const w of warnings) ctx.out.write(t.star(`! ${w}\n`));
        if (!errors.length) ctx.out.write(`${t.sage("✓")} valid\n`);
        return errors.length ? 1 : 0;
      }
      case "enable":
      case "disable": {
        const r = need();
        reg.setEnabled(r.id, sub === "enable");
        ctx.out.write(`${t.sage("✓")} ${r.id} ${sub}d\n`);
        return 0;
      }
      case "rm":
      case "remove":
      case "delete": {
        const r = need();
        if (ctx.prompter.interactive) {
          const a = await ctx.prompter.choose(`Delete ${r.id} (${r.dir})? ${t.muted("[n] no  [y] yes")}`, [
            { key: "n", label: "no" },
            { key: "y", label: "yes" },
          ]);
          if (a !== "y") return 0;
        }
        applySkillChange(reg, { op: "delete", id: r.id });
        ctx.out.write(`${t.sage("✓")} Deleted ${r.id}\n`);
        return 0;
      }
      case "trust":
      case "untrust":
        if (!reg.all().some((r) => r.source === "project")) {
          ctx.out.write(t.muted(`This project has no skills in ${reg.projectDir}.\n`));
          return 0;
        }
        reg.setTrusted(sub === "trust");
        ctx.out.write(`${t.sage("✓")} This project's skills are ${sub === "trust" ? "trusted" : "no longer trusted"}.\n`);
        return 0;
      case "path":
        ctx.out.write(`global:  ${reg.globalDir}\nproject: ${reg.projectDir}\n`);
        return 0;
      default:
        ctx.err.write(`Unknown subcommand "${sub}". Try: vard skills list\n`);
        void rest;
        return 1;
    }
  } catch (e) {
    ctx.err.write(t.danger(`${(e as Error).message}\n`));
    return 1;
  }
}
