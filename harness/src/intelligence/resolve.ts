/**
 * Import resolution: turns an import string into a project file (or an external package).
 * Supported: relative and tsconfig `paths`/`baseUrl` imports for TS/JS (with index files and
 * .js → .ts), Python modules and packages, Rust `mod`/`crate::` paths, Go packages within the
 * module, Java imports, and C/C++ quoted includes. Anything else is reported as external.
 */
import fs from "node:fs";
import path from "node:path";
import type { Lang } from "./schema";

export interface Resolver {
  resolve(from: string, lang: Lang, source: string): { targets: string[]; pkg?: string };
}

const JS_EXT = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];

function readJsonc(file: string): any {
  try {
    const t = fs.readFileSync(file, "utf8");
    return JSON.parse(t.replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, "$1").replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

export function createResolver(root: string, files: Set<string>): Resolver {
  const has = (p: string) => files.has(p);
  const norm = (p: string) => path.posix.normalize(p).replace(/^\.\//, "");
  const byBase = new Map<string, string[]>();
  for (const f of files) {
    const b = path.posix.basename(f);
    (byBase.get(b) ?? byBase.set(b, []).get(b)!).push(f);
  }

  // tsconfig paths, per tsconfig directory (nearest wins).
  const tsconfigs = [...files].filter((f) => /(^|\/)tsconfig(\.[\w-]+)?\.json$/.test(f) && path.posix.basename(f) === "tsconfig.json");
  const tsOpts = tsconfigs.map((f) => {
    const dir = path.posix.dirname(f) === "." ? "" : path.posix.dirname(f);
    const c = readJsonc(path.join(root, f))?.compilerOptions ?? {};
    const base = c.baseUrl ? norm(path.posix.join(dir, c.baseUrl)) : dir;
    return { dir, base: base === "." ? "" : base, paths: (c.paths ?? {}) as Record<string, string[]> };
  });
  const nearestTs = (from: string) =>
    tsOpts.filter((t) => !t.dir || from.startsWith(`${t.dir}/`)).sort((a, b) => b.dir.length - a.dir.length)[0];

  const goMod = [...files].filter((f) => path.posix.basename(f) === "go.mod").map((f) => {
    const mod = /^module\s+(\S+)/m.exec(fs.readFileSync(path.join(root, f), "utf8"))?.[1];
    return { dir: path.posix.dirname(f) === "." ? "" : path.posix.dirname(f), mod };
  });

  const tryJs = (p: string): string | undefined => {
    const c = norm(p);
    if (has(c)) return c;
    const noJs = c.replace(/\.(m|c)?js$/, "");
    for (const e of JS_EXT) if (has(noJs + e)) return noJs + e;
    for (const e of JS_EXT) if (has(`${c}/index${e}`)) return `${c}/index${e}`;
    return undefined;
  };

  const pkgName = (s: string) => (s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0]);

  return {
    resolve(from, lang, source) {
      const dir = path.posix.dirname(from) === "." ? "" : path.posix.dirname(from);
      if (source.startsWith("pkg:")) return { targets: [], pkg: source.slice(4) };
      switch (lang) {
        case "typescript":
        case "tsx":
        case "javascript": {
          if (source.startsWith(".")) {
            const t = tryJs(path.posix.join(dir, source));
            return { targets: t ? [t] : [] };
          }
          const ts = nearestTs(from);
          if (ts) {
            for (const [pattern, subs] of Object.entries(ts.paths)) {
              const star = pattern.indexOf("*");
              const prefix = star === -1 ? pattern : pattern.slice(0, star);
              const suffix = star === -1 ? "" : pattern.slice(star + 1);
              if (star === -1 ? source !== pattern : !(source.startsWith(prefix) && source.endsWith(suffix))) continue;
              const mid = star === -1 ? "" : source.slice(prefix.length, source.length - suffix.length);
              for (const sub of subs) {
                const t = tryJs(path.posix.join(ts.base, sub.replace("*", mid)));
                if (t) return { targets: [t] };
              }
            }
            if (ts.base) {
              const t = tryJs(path.posix.join(ts.base, source));
              if (t) return { targets: [t] };
            }
          }
          if (/^(node:|bun:)/.test(source)) return { targets: [], pkg: source };
          return { targets: [], pkg: pkgName(source) };
        }
        case "python": {
          const m = /^(\.*)(.*)$/.exec(source)!;
          const dots = m[1].length;
          const parts = m[2] ? m[2].split(".") : [];
          let bases: string[];
          if (dots) {
            let d = dir;
            for (let i = 1; i < dots; i++) d = path.posix.dirname(d) === "." ? "" : path.posix.dirname(d);
            bases = [d];
          } else bases = ["", "src", dir];
          for (const b of bases) {
            const p = path.posix.join(b, ...parts);
            for (const c of [`${p}.py`, `${p}/__init__.py`]) if (has(norm(c))) return { targets: [norm(c)] };
          }
          return dots ? { targets: [] } : { targets: [], pkg: parts[0] };
        }
        case "rust": {
          if (source.startsWith("mod:")) {
            const name = source.slice(4);
            const base = /(^|\/)(main|lib|mod)\.rs$/.test(from) ? dir : from.replace(/\.rs$/, "");
            for (const c of [`${base}/${name}.rs`, `${base}/${name}/mod.rs`]) if (has(norm(c))) return { targets: [norm(c)] };
            return { targets: [] };
          }
          const segs = source.replace(/\{.*$/, "").split("::").filter(Boolean);
          if (segs[0] === "crate" || segs[0] === "super" || segs[0] === "self") {
            const srcDir = from.includes("src/") ? from.slice(0, from.indexOf("src/") + 3) : dir;
            const start = segs[0] === "crate" ? srcDir : segs[0] === "super" ? path.posix.dirname(dir) : dir;
            const rest = segs.slice(1);
            for (let n = rest.length; n > 0; n--) {
              const p = path.posix.join(start, ...rest.slice(0, n));
              for (const c of [`${p}.rs`, `${p}/mod.rs`]) if (has(norm(c))) return { targets: [norm(c)] };
            }
            return { targets: [] };
          }
          return { targets: [], pkg: segs[0] };
        }
        case "go": {
          for (const g of goMod) {
            if (g.mod && (source === g.mod || source.startsWith(`${g.mod}/`))) {
              const d = norm(path.posix.join(g.dir, source.slice(g.mod.length))).replace(/^\/+/, "");
              const targets = [...files].filter((f) => path.posix.dirname(f) === (d || ".") && f.endsWith(".go") && !f.endsWith("_test.go"));
              return { targets };
            }
          }
          return { targets: [], pkg: source };
        }
        case "java": {
          const rel = `${source.replace(/\.\*$/, "").replace(/\./g, "/")}.java`;
          const hit = [...(byBase.get(path.posix.basename(rel)) ?? [])].find((f) => f.endsWith(rel));
          return hit ? { targets: [hit] } : { targets: [], pkg: source.split(".").slice(0, 2).join(".") };
        }
        case "c":
        case "cpp": {
          const local = norm(path.posix.join(dir, source));
          if (has(local)) return { targets: [local] };
          const cands = (byBase.get(path.posix.basename(source)) ?? []).filter((f) => f.endsWith(source));
          return cands.length ? { targets: [cands[0]] } : { targets: [], pkg: source };
        }
        default:
          return { targets: [] };
      }
    },
  };
}

const TEST_RE = /(^|\/)(__tests__|tests?|spec)\/|[._-](test|spec)\.[a-z]+$|_test\.go$|(^|\/)test_[^/]+\.py$/i;
export const isTestFile = (p: string) => TEST_RE.test(p);
