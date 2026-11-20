/**
 * A short "where to look" list for one piece of work (a team subtask): files and top symbols from
 * the code index, as references (path:line + symbol). Never file contents.
 */
import type { EmbeddingProvider } from "./embeddings";
import type { CodeIndex } from "./indexer";
import { searchCode } from "./search";

export interface RelevantCodeOptions {
  /** Files the planner expects the work to touch (listed first). */
  files?: string[];
  embeddings?: EmbeddingProvider | null;
  maxEntries?: number;
  maxChars?: number;
  signal?: AbortSignal;
}

/** Returns "- path:line kind symbol (why)" lines, or "" when the index has nothing useful. */
export async function relevantCode(ix: CodeIndex, query: string, o: RelevantCodeOptions = {}): Promise<string> {
  if (!ix.exists()) return "";
  const maxEntries = o.maxEntries ?? 8;
  const maxChars = o.maxChars ?? 1_200;
  const hits = await searchCode(ix, query, { limit: 20, embeddings: o.embeddings, signal: o.signal }).catch(() => []);
  const lines: string[] = [];
  const seen = new Set<string>();
  const perFile = new Map<string, number>();
  let size = 0;
  const push = (key: string, line: string) => {
    if (seen.has(key) || lines.length >= maxEntries || size + line.length + 1 > maxChars) return;
    seen.add(key);
    lines.push(line);
    size += line.length + 1;
  };
  const ref = (h: (typeof hits)[number]) => `${h.path}:${h.line}${h.symbol ? ` ${h.kind ? `${h.kind} ` : ""}${h.symbol}` : ""}`;
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 200);
  for (const f of (o.files ?? []).map(clean)) {
    const h = hits.find((x) => x.path === f && x.symbol) ?? hits.find((x) => x.path === f);
    push(`${f}:${h?.symbol ?? ""}`, `- ${h ? ref(h) : f} (planned)`);
    perFile.set(f, 1);
  }
  // Symbols first (at most two per file), then files that matched without a symbol.
  for (const named of [true, false])
    for (const h of hits) {
      if (!!h.symbol !== named) continue;
      const n = perFile.get(h.path) ?? 0;
      if (n >= (named ? 2 : 1)) continue;
      const key = `${h.path}:${h.symbol ?? h.line}`;
      if (seen.has(key)) continue;
      perFile.set(h.path, n + 1);
      push(key, `- ${ref(h)}${h.reasons.length ? ` (${h.reasons.slice(0, 2).join(", ")})` : ""}`);
    }
  return lines.join("\n");
}
