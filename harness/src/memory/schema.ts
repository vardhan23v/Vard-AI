/**
 * Project memory data shapes. No Node or Bun imports: the desktop app's WebView shares these
 * types through harness/src/protocol.ts.
 */
import { z } from "zod";

export const CATEGORIES = [
  { id: "overview", title: "Project overview" },
  { id: "architecture", title: "Architecture and important files" },
  { id: "commands", title: "Commands" },
  { id: "conventions", title: "Conventions" },
  { id: "preferences", title: "Your preferences" },
  { id: "decisions", title: "Decisions" },
  { id: "fixes", title: "Solved bugs" },
  { id: "issues", title: "Known issues and limitations" },
  { id: "details", title: "Implementation details" },
] as const;

export const Category = z.enum([
  "overview",
  "architecture",
  "commands",
  "conventions",
  "preferences",
  "decisions",
  "fixes",
  "issues",
  "details",
]);
export type Category = z.infer<typeof Category>;
export const categoryTitle = (c: Category) => CATEGORIES.find((x) => x.id === c)?.title ?? c;

export const MemorySettings = z.object({
  /** Memory on or off for this project. */
  enabled: z.boolean().default(true),
  /** Put relevant memory into the agent's context before tasks. */
  recall: z.boolean().default(true),
  /** After a task: "ask" proposes notes for approval, "auto" saves them as inferred, "off" does nothing. */
  autoUpdate: z.enum(["off", "ask", "auto"]).default("ask"),
  /** Upper bound on memory text in the agent's context. */
  maxContextChars: z.number().int().min(1000).max(40_000).default(6000),
  /** Globs (relative to the project) the analysis must skip, on top of .gitignore. */
  exclude: z.array(z.string().min(1).max(200)).max(100).default([]),
});
export type MemorySettings = z.infer<typeof MemorySettings>;

export const MemoryEntry = z.object({
  id: z.string(),
  category: Category,
  text: z.string().min(1).max(600),
  status: z.enum(["verified", "inferred"]),
  source: z.enum(["scan", "user", "task"]),
  taskId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Set when a newer entry replaced this one; superseded entries are kept as history only. */
  supersededBy: z.string().optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntry>;

export const MemoryFile = z.object({
  version: z.literal(1),
  settings: MemorySettings.default(() => MemorySettings.parse({})),
  analyzedAt: z.string().optional(),
  entries: z.array(MemoryEntry).default([]),
});
export type MemoryFile = z.infer<typeof MemoryFile>;
