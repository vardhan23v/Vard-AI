/**
 * `vard code …`: the code index for the current repo.
 *
 *   index [--force]          build or update the index
 *   status                   files, symbols, languages, size
 *   search <query>           hybrid search (keyword, symbol, path, dependency; vectors if set up)
 *   symbols <text>           definitions whose name contains the text
 *   def <name> | refs <name> | callers <name>
 *   deps <path> | dependents <path> | outline <path>
 *   impact <path|symbol>     change impact report
 *   arch                     architecture summary
 *   embeddings <none|ollama|openai|google> [model]
 *   clean                    delete the index
 */
import { analyzeImpact, architecture, CodeGraph, deleteIndex, loadIndexConfig, renderArchitecture, renderImpact, saveIndexConfig, searchCode, updateEmbeddings } from "../../intelligence";
import type { Ctx } from "../context";
import { gitRoot } from "./task";

export async function codeCommand(ctx: Ctx, args: string[], flags: { force?: boolean }): Promise<number> {
  const t = ctx.theme;
  const root = gitRoot(ctx.cwd) ?? ctx.cwd;
  const intel = ctx.client.server.intel;
  const ix = intel.get(root);
  const [sub = "status", ...rest] = args;
  const arg = rest.join(" ").trim();
  const need = (what: string) => {
    if (!arg) throw new Error(`Usage: vard code ${sub} <${what}>`);
    return arg;
  };
  const ensure = async () => {
    if (ix.exists()) return;
    ctx.out.write(t.muted("Indexing this project first…\n"));
    await intel.build(root);
  };
  // Optional embeddings with the user's key.
  const emb = loadIndexConfig(root).embeddings;
  if (emb.provider === "openai" || emb.provider === "google") intel.setEmbeddingKey(root, ctx.keys.resolve(emb.provider === "google" ? "google" : "openai")?.key);
  try {
    switch (sub) {
      case "index": {
        let last = 0;
        const r = await ix.build({
          force: flags.force,
          onProgress: (d, n) => {
            if ((ctx.err as { isTTY?: boolean }).isTTY && Date.now() - last > 200) {
              last = Date.now();
              ctx.err.write(`\r${t.muted(`indexing ${d}/${n}`)}   `);
            }
          },
        });
        if ((ctx.err as { isTTY?: boolean }).isTTY) ctx.err.write("\r\x1b[2K");
        const p = intel.embeddings(root);
        if (p) {
          const e = await updateEmbeddings(ix, p);
          ctx.out.write(t.muted(`embedded ${e.embedded} chunks${e.skipped ? `, skipped ${e.skipped} (empty or secret-looking)` : ""}\n`));
        }
        const s = ix.status();
        ctx.out.write(
          `${t.sage("✓")} ${s.files} files, ${s.symbols} symbols ${t.muted(`(+${r.added} ~${r.updated} -${r.removed}, ${r.unchanged} unchanged, ${r.failed} failed to parse, ${(r.durationMs / 1000).toFixed(1)}s)`)}\n`,
        );
        return 0;
      }
      case "status": {
        const s = ix.status();
        ctx.out.write(
          `${t.bold(s.state)} · ${s.files} files · ${s.symbols} symbols · ${s.references} references · ${s.imports} imports · ${(s.bytes / 1e6).toFixed(1)} MB${s.overCap ? t.danger(" (over the size cap)") : ""}\n`,
        );
        if (Object.keys(s.languages).length) ctx.out.write(t.muted(`${Object.entries(s.languages).map(([l, n]) => `${l} ${n}`).join(" · ")}\n`));
        if (s.indexedAt) ctx.out.write(t.muted(`updated ${new Date(s.indexedAt).toLocaleString()} · embeddings: ${s.embeddings.provider}${s.embeddings.embedded ? ` (${s.embeddings.embedded} chunks)` : ""}\n`));
        if (s.state === "missing") ctx.out.write(t.muted("Build it with: vard code index\n"));
        return 0;
      }
      case "clean":
        ix.close();
        deleteIndex(root);
        ctx.out.write(`${t.sage("✓")} Index deleted.\n`);
        return 0;
      case "embeddings": {
        const [provider = "none", model] = rest;
        if (!["none", "ollama", "openai", "google"].includes(provider)) throw new Error("Use: none, ollama, openai or google");
        saveIndexConfig(root, { embeddings: { provider: provider as "none", ...(model ? { model } : {}) } });
        ctx.out.write(`${t.sage("✓")} Embeddings: ${provider}${model ? ` (${model})` : ""}. Run vard code index to embed.\n`);
        return 0;
      }
    }
    await ensure();
    const g = new CodeGraph(ix);
    const line = (s: string) => ctx.out.write(`${s}\n`);
    switch (sub) {
      case "search": {
        const hits = await searchCode(ix, need("query"), { limit: 15, embeddings: intel.embeddings(root) });
        if (!hits.length) line(t.muted("No matches."));
        for (const h of hits) {
          line(`${t.bold(`${h.path}:${h.line}`)}${h.symbol ? ` ${t.cerulean(`${h.kind ?? ""} ${h.symbol}`)}` : ""} ${t.muted(h.reasons.join(", "))}`);
          if (h.snippet) line(t.muted(h.snippet.split("\n").map((l) => `  ${l}`).join("\n")));
        }
        return 0;
      }
      case "symbols":
      case "def": {
        const s = sub === "def" ? g.definitions(need("name")) : g.symbolSearch(need("text"), 40);
        if (!s.length) line(t.muted("Nothing found."));
        for (const x of s) line(`${t.bold(`${x.path}:${x.line}`)} ${x.kind} ${x.parent ? `${x.parent}.` : ""}${x.name}${x.exported ? t.muted(" exported") : ""}`);
        return 0;
      }
      case "refs":
      case "callers": {
        const r = sub === "callers" ? g.callers(need("name")) : g.references(need("name"));
        if (r[0]?.ambiguous) line(t.muted("Several definitions share this name; matches are by name."));
        if (!r.length) line(t.muted("Nothing found."));
        for (const x of r) line(`${t.bold(`${x.path}:${x.line}`)} ${t.muted(x.kind)}${x.in ? ` in ${x.in}` : ""}`);
        return 0;
      }
      case "deps": {
        const d = g.dependencies(need("path"));
        for (const f of d.files) line(f);
        if (d.packages.length) line(t.muted(`packages: ${d.packages.join(", ")}`));
        return 0;
      }
      case "dependents":
        for (const f of g.dependentsDeep([need("path")], 2)) line(`${f.path}${f.depth > 1 ? t.muted(` (via ${f.depth} hops)`) : ""}`);
        return 0;
      case "outline":
        for (const x of g.outline(need("path"))) line(`${String(x.line).padStart(5)} ${x.parent ? "  " : ""}${x.kind} ${x.name}${x.exported ? t.muted(" exported") : ""}`);
        return 0;
      case "impact":
        line(renderImpact(analyzeImpact(ix, need("path or symbol"))));
        return 0;
      case "arch":
        line(renderArchitecture(architecture(ix), 8_000));
        return 0;
      default:
        ctx.err.write(`Unknown subcommand "${sub}". Try: vard code status\n`);
        return 1;
    }
  } catch (e) {
    ctx.err.write(t.danger(`${(e as Error).message}\n`));
    return 1;
  } finally {
    ix.close();
  }
}
