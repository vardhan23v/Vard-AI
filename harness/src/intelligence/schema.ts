/**
 * Code Intelligence types shared by the harness, CLI and app (through protocol.ts).
 * No Node imports here: the WebView typechecks this file.
 */
import { z } from "zod";

export const LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "cpp",
  "c",
  "json",
  "markdown",
] as const;
export const Lang = z.enum(LANGUAGES);
export type Lang = z.infer<typeof Lang>;

export const SymbolKind = z.enum([
  "class",
  "interface",
  "type",
  "enum",
  "function",
  "method",
  "variable",
  "struct",
  "trait",
  "module",
  "heading",
  "key",
]);
export type SymbolKind = z.infer<typeof SymbolKind>;

export const CodeSymbol = z.object({
  name: z.string(),
  kind: SymbolKind,
  path: z.string(),
  line: z.number(),
  endLine: z.number(),
  exported: z.boolean(),
  parent: z.string().optional(),
  signature: z.string().optional(),
});
export type CodeSymbol = z.infer<typeof CodeSymbol>;

export const IndexConfig = z.object({
  version: z.literal(1).default(1),
  /** Extra folders or globs to skip (relative to the project). */
  exclude: z.array(z.string().max(300)).max(200).default([]),
  maxFileBytes: z.number().int().min(10_000).max(10_000_000).default(1_000_000),
  maxFiles: z.number().int().min(100).max(500_000).default(50_000),
  /** Size the index may grow to before Vard warns and stops adding text. */
  maxIndexBytes: z.number().int().min(10_000_000).max(5_000_000_000).default(200_000_000),
  /** Re-index changed files automatically while the project is open. */
  watch: z.boolean().default(true),
  embeddings: z
    .object({
      provider: z.enum(["none", "ollama", "openai", "google"]).default("none"),
      model: z.string().max(200).optional(),
      /** Ollama only: where it runs. Must be this Mac. */
      baseUrl: z.string().max(300).optional(),
    })
    .default({ provider: "none" }),
});
export type IndexConfig = z.infer<typeof IndexConfig>;

export const IndexStatus = z.object({
  projectRoot: z.string(),
  state: z.enum(["missing", "indexing", "ready", "error"]),
  files: z.number(),
  symbols: z.number(),
  references: z.number(),
  imports: z.number(),
  failed: z.number(),
  skipped: z.number(),
  languages: z.record(z.string(), z.number()),
  bytes: z.number(),
  overCap: z.boolean(),
  indexedAt: z.number().optional(),
  durationMs: z.number().optional(),
  progress: z.object({ done: z.number(), total: z.number() }).optional(),
  embeddings: z.object({
    provider: z.string(),
    model: z.string().optional(),
    chunks: z.number(),
    embedded: z.number(),
  }),
  error: z.string().optional(),
});
export type IndexStatus = z.infer<typeof IndexStatus>;

export const SearchHit = z.object({
  path: z.string(),
  line: z.number(),
  endLine: z.number(),
  symbol: z.string().optional(),
  kind: z.string().optional(),
  score: z.number(),
  reasons: z.array(z.string()),
  snippet: z.string(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const GraphNode = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["file", "package", "symbol"]),
  lang: z.string().optional(),
  test: z.boolean().optional(),
  fanIn: z.number().optional(),
});
export const GraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(["imports", "calls", "tests", "depends"]),
});
export const GraphData = z.object({
  nodes: z.array(GraphNode),
  edges: z.array(GraphEdge),
  truncated: z.boolean(),
  focus: z.string().optional(),
});
export type GraphData = z.infer<typeof GraphData>;

export const ImpactReport = z.object({
  target: z.string(),
  resolved: z.object({ files: z.array(z.string()), symbols: z.array(CodeSymbol) }),
  direct: z.array(z.object({ path: z.string(), via: z.string() })),
  indirect: z.array(z.object({ path: z.string(), depth: z.number() })),
  referencing: z.array(
    z.object({ path: z.string(), line: z.number(), symbol: z.string().optional() }),
  ),
  publicApi: z.array(CodeSymbol),
  tests: z.array(z.string()),
  config: z.array(z.string()),
  verify: z.array(z.string()),
  risk: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ImpactReport = z.infer<typeof ImpactReport>;
