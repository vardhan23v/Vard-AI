/**
 * Structural parsing: tree-sitter for code (definitions, exports, parents, imports, references),
 * JSON.parse for JSON and heading structure for Markdown. A file that fails to parse returns an
 * error for that file only.
 */
import type { Node, Parser, Query, QueryCapture } from "@vscode/tree-sitter-wasm";
import { parserFor } from "./languages";
import type { Lang, SymbolKind } from "./schema";

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  line: number;
  endLine: number;
  exported: boolean;
  parent?: string;
  signature?: string;
  /** Byte range (for nesting; not stored). */
  start?: number;
  end?: number;
}
export interface ParsedRef {
  name: string;
  line: number;
  kind: "call" | "type";
}
export interface ParsedImport {
  source: string;
  names: string[];
  line: number;
}
export interface ParseResult {
  symbols: ParsedSymbol[];
  refs: ParsedRef[];
  imports: ParsedImport[];
  error?: string;
}

const MAX_REFS = 5_000;
const CONTAINERS: SymbolKind[] = ["class", "interface", "struct", "trait", "module", "enum"];

const parsers = new Map<Lang, Promise<{ parser: Parser; queries: Query[] } | null>>();
function cachedParser(l: Lang) {
  let p = parsers.get(l);
  if (!p) {
    p = parserFor(l);
    parsers.set(l, p);
  }
  return p;
}

const unquote = (s: string) => s.replace(/^[<"'`]|[>"'`]$/g, "");

function ancestor(n: Node, types: string[]): Node | null {
  for (let p = n.parent; p; p = p.parent) if (types.includes(p.type)) return p;
  return null;
}

function isExported(lang: Lang, def: Node, name: string): boolean {
  switch (lang) {
    case "typescript":
    case "tsx":
    case "javascript": {
      for (let p: Node | null = def; p; p = p.parent) {
        if (p.type === "export_statement") return true;
        if (["program", "statement_block", "class_body"].includes(p.type)) return false;
      }
      return false;
    }
    case "python":
      return !name.startsWith("_");
    case "rust":
      return def.children.some((c) => c?.type === "visibility_modifier");
    case "go":
      return /^[A-Z]/.test(name);
    case "java": {
      const mods = def.children.find((c) => c?.type === "modifiers");
      return !!mods && /\bpublic\b/.test(mods.text);
    }
    default:
      return !/^\s*static\b/.test(def.text);
  }
}

/** Keeps module- and class-level definitions; drops locals inside function bodies. */
function keepDef(lang: Lang, kind: string, def: Node): { keep: boolean; kind?: SymbolKind } {
  switch (lang) {
    case "typescript":
    case "tsx":
    case "javascript": {
      if (kind === "variable") {
        const decl = def.parent; // lexical_declaration / variable_declaration
        const top = decl?.parent?.type;
        if (top !== "program" && top !== "export_statement") return { keep: false };
        const value = def.childForFieldName("value");
        if (value && ["arrow_function", "function_expression", "function"].includes(value.type))
          return { keep: true, kind: "function" };
        return { keep: true, kind: "variable" };
      }
      if (kind === "function" && ancestor(def, ["statement_block"])) return { keep: false };
      return { keep: true };
    }
    case "python":
      if (kind === "function") {
        if (ancestor(def, ["function_definition"])) return { keep: false };
        if (ancestor(def, ["class_definition"])) return { keep: true, kind: "method" };
      }
      return { keep: true };
    case "rust":
      if (kind === "function" && ancestor(def, ["impl_item", "trait_item"]))
        return { keep: true, kind: "method" };
      if (kind === "function" && ancestor(def, ["function_item"])) return { keep: false };
      return { keep: true };
    case "go":
      if (kind === "type") {
        const t = def.childForFieldName("type")?.type;
        if (t === "struct_type") return { keep: true, kind: "struct" };
        if (t === "interface_type") return { keep: true, kind: "interface" };
      }
      return { keep: true };
    default:
      return { keep: true };
  }
}

function parentName(lang: Lang, def: Node): string | undefined {
  if (lang === "rust") {
    const impl = ancestor(def, ["impl_item"]);
    if (impl) return impl.childForFieldName("type")?.text;
  }
  if (lang === "go" && def.type === "method_declaration") {
    const recv = def.childForFieldName("receiver")?.text ?? "";
    return /\*?\s*([A-Za-z_]\w*)\s*\)?\s*$/.exec(recv.replace(/\)$/, ""))?.[1];
  }
  return undefined;
}

function importNames(stmt: Node | null): string[] {
  if (!stmt) return [];
  const names: string[] = [];
  const walk = (n: Node) => {
    if (n.type === "import_specifier") {
      const nm = n.childForFieldName("name");
      if (nm) names.push(nm.text);
      return;
    }
    if (n.type === "import_clause") {
      for (const c of n.children) if (c?.type === "identifier") names.push(c.text);
    }
    if (n.type === "namespace_import") return names.push("*") && undefined;
    for (const c of n.children) if (c) walk(c);
  };
  walk(stmt);
  return names;
}

function parseTree(lang: Lang, text: string, parser: Parser, queries: Query[]): ParseResult {
  const tree = parser.parse(text);
  if (!tree) return { symbols: [], refs: [], imports: [], error: "parser returned nothing" };
  const root = tree.rootNode;
  const symbols: ParsedSymbol[] = [];
  const refs: ParsedRef[] = [];
  const imports: ParsedImport[] = [];
  const seen = new Set<string>();
  try {
    for (const q of queries) {
      for (const m of q.matches(root)) {
        const def = m.captures.find((c: QueryCapture) => c.name.startsWith("def."));
        const name = m.captures.find((c: QueryCapture) => c.name === "name");
        if (def && name) {
          const k = keepDef(lang, def.name.slice(4), def.node);
          if (!k.keep) continue;
          const kind = (k.kind ?? def.name.slice(4)) as SymbolKind;
          const key = `${name.node.text}:${def.node.startPosition.row}:${kind}`;
          if (seen.has(key)) continue;
          seen.add(key);
          symbols.push({
            name: name.node.text,
            kind,
            line: def.node.startPosition.row + 1,
            endLine: def.node.endPosition.row + 1,
            exported: isExported(lang, def.node, name.node.text),
            parent: parentName(lang, def.node),
            signature: def.node.text.split("\n")[0].trim().slice(0, 160),
            start: def.node.startIndex,
            end: def.node.endIndex,
          });
          continue;
        }
        for (const c of m.captures) {
          if (c.name === "import") {
            const stmt = ["typescript", "tsx", "javascript"].includes(lang) ? c.node.parent : null;
            imports.push({
              source: unquote(c.node.text.trim()),
              names: importNames(stmt),
              line: c.node.startPosition.row + 1,
            });
          } else if (c.name.startsWith("ref.") && refs.length < MAX_REFS) {
            refs.push({
              name: c.node.text,
              line: c.node.startPosition.row + 1,
              kind: c.name === "ref.call" ? "call" : "type",
            });
          }
        }
      }
    }
    // Rust `mod foo;` (no body) is a file dependency.
    if (lang === "rust")
      for (const s of symbols)
        if (s.kind === "module" && /;\s*$/.test(s.signature ?? ""))
          imports.push({ source: `mod:${s.name}`, names: [], line: s.line });
  } finally {
    tree.delete();
  }
  // Parents by range: the nearest enclosing container.
  const containers = symbols
    .filter((s) => CONTAINERS.includes(s.kind))
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
  for (const s of symbols) {
    if (s.parent) continue;
    const p = containers.find(
      (c) =>
        c !== s &&
        (c.start ?? 0) <= (s.start ?? 0) &&
        (c.end ?? 0) >= (s.end ?? 0) &&
        c.end! - c.start! > s.end! - s.start!,
    );
    if (p) {
      s.parent = p.name;
      if (s.kind === "function" && ["class", "interface", "struct", "trait"].includes(p.kind))
        s.kind = "method";
    }
  }
  const dedup = new Set<string>();
  for (const s of symbols) {
    delete s.start;
    delete s.end;
  }
  return {
    symbols: symbols.sort((a, b) => a.line - b.line),
    refs: refs.filter((r) => {
      const k = `${r.name}:${r.line}:${r.kind}`;
      if (dedup.has(k)) return false;
      dedup.add(k);
      return r.name.length > 1;
    }),
    imports,
  };
}

function parseMarkdown(text: string): ParseResult {
  const symbols: ParsedSymbol[] = [];
  const lines = text.split("\n");
  let fence = false;
  const open: { level: number; s: ParsedSymbol }[] = [];
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (!m) return;
    const level = m[1].length;
    while (open.length && open[open.length - 1].level >= level) open.pop()!.s.endLine = i;
    const s: ParsedSymbol = {
      name: m[2],
      kind: "heading",
      line: i + 1,
      endLine: lines.length,
      exported: true,
      parent: open.at(-1)?.s.name,
    };
    symbols.push(s);
    open.push({ level, s });
  });
  return { symbols, refs: [], imports: [] };
}

function parseJson(text: string, file: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // JSON with comments (tsconfig) is common; strip comments and trailing commas once.
    try {
      data = JSON.parse(
        text.replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, "$1").replace(/,\s*([}\]])/g, "$1"),
      );
    } catch {
      return {
        symbols: [],
        refs: [],
        imports: [],
        error: `invalid JSON: ${(e as Error).message.slice(0, 120)}`,
      };
    }
  }
  const symbols: ParsedSymbol[] = [];
  const imports: ParsedImport[] = [];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const lines = text.split("\n");
    for (const key of Object.keys(data).slice(0, 200)) {
      const idx = lines.findIndex((l) => l.includes(`"${key}"`));
      symbols.push({
        name: key,
        kind: "key",
        line: idx + 1 || 1,
        endLine: idx + 1 || 1,
        exported: true,
      });
    }
    if (/(^|\/)package\.json$/.test(file)) {
      const pkg = data as Record<string, Record<string, string>>;
      for (const k of ["dependencies", "devDependencies", "peerDependencies"])
        for (const dep of Object.keys(pkg[k] ?? {}))
          imports.push({ source: `pkg:${dep}`, names: [k], line: 1 });
    }
  }
  return { symbols, refs: [], imports };
}

export async function parseSource(lang: Lang, text: string, file = ""): Promise<ParseResult> {
  try {
    if (lang === "markdown") return parseMarkdown(text);
    if (lang === "json") return parseJson(text, file);
    const p = await cachedParser(lang);
    if (!p) return { symbols: [], refs: [], imports: [] };
    return parseTree(lang, text, p.parser, p.queries);
  } catch (e) {
    return {
      symbols: [],
      refs: [],
      imports: [],
      error: `parse failed: ${(e as Error)?.message ?? e}`,
    };
  }
}
