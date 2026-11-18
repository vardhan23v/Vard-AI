/**
 * Project memory store: `<project>/.vard/memory.json`.
 *
 * Local and per project (always the user's main checkout, never a task worktree; `.vard/` is
 * git-ignored). Entries are small facts in fixed categories with metadata: verified or inferred,
 * where they came from, when they were created and updated, and what replaced them.
 * Every write goes through the secret guard and duplicate detection.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { findSecret } from "./secrets";

export {
  CATEGORIES,
  Category,
  categoryTitle,
  MemoryEntry,
  MemoryFile,
  MemorySettings,
} from "./schema";
import {
  CATEGORIES,
  Category,
  categoryTitle,
  MemoryEntry,
  MemoryFile,
  MemorySettings,
} from "./schema";

export class MemoryError extends Error {}

export type NewEntry = {
  category: Category;
  text: string;
  status?: MemoryEntry["status"];
  source?: MemoryEntry["source"];
  taskId?: string;
  /** Id of the entry this one replaces (it becomes history). */
  replaces?: string;
};

const now = () => new Date().toISOString();
const newEntryId = () => `m_${crypto.randomBytes(5).toString("hex")}`;

// ---------- text comparison ----------

const codeSpans = (s: string) => new Set((s.match(/`[^`]+`/g) ?? []).map((c) => c.toLowerCase()));

/** Lowercased words without code spans, dates or punctuation. */
export function words(text: string): string[] {
  return text
    .replace(/`[^`]*`/g, " ")
    .replace(/\(\d{4}-\d{2}-\d{2}\)/g, " ")
    .toLowerCase()
    .replace(/[*_"'.,:;!?()[\]{}<>]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function overlap(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}

/** Same fact in different words (or identical). */
export function isDuplicate(a: string, b: string): boolean {
  const ca = codeSpans(a);
  const cb = codeSpans(b);
  const codesDiffer = ca.size > 0 && cb.size > 0 && ![...ca].some((c) => cb.has(c));
  if (codesDiffer) return false;
  return overlap(words(a + " " + [...ca].join(" ")), words(b + " " + [...cb].join(" "))) >= 0.8;
}

/** About the same thing but with different specifics, e.g. "Tests run with `bun test`" vs `npm test`. */
export function contradicts(a: string, b: string): boolean {
  const ca = codeSpans(a);
  const cb = codeSpans(b);
  if (!ca.size || !cb.size || [...ca].some((c) => cb.has(c))) return false;
  return overlap(words(a), words(b)) >= 0.6;
}

// ---------- store ----------

export class MemoryStore {
  constructor(readonly projectRoot: string) {}

  get path() {
    return path.join(this.projectRoot, ".vard", "memory.json");
  }

  private get legacyPath() {
    return path.join(this.projectRoot, ".vard", "memory.md");
  }

  exists() {
    return fs.existsSync(this.path) || fs.existsSync(this.legacyPath);
  }

  load(): MemoryFile {
    let raw: string | null = null;
    try {
      raw = fs.readFileSync(this.path, "utf8");
    } catch {
      // Nothing to read or move: fall through.
    }
    if (raw === null) return this.migrateLegacy() ?? MemoryFile.parse({ version: 1 });
    try {
      return MemoryFile.parse(JSON.parse(raw));
    } catch {
      // Keep the damaged file for the user instead of overwriting it; start fresh.
      const keep = `${this.path}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(this.path, keep);
      } catch {
        // Nothing to read or move: fall through.
      }
      return MemoryFile.parse({ version: 1 });
    }
  }

  save(data: MemoryFile) {
    ensureVardDir(this.projectRoot);
    const tmp = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    fs.renameSync(tmp, this.path);
  }

  /** The earlier Markdown format (.vard/memory.md): each bullet becomes a verified entry. */
  private migrateLegacy(): MemoryFile | null {
    let md: string;
    try {
      md = fs.readFileSync(this.legacyPath, "utf8");
    } catch {
      return null;
    }
    const map: Record<string, Category> = {
      "project overview": "overview",
      conventions: "conventions",
      decisions: "decisions",
      "known issues and fixes": "issues",
    };
    const data = MemoryFile.parse({ version: 1 });
    let cat: Category | null = null;
    for (const line of md.split("\n")) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) {
        cat = map[h[1].toLowerCase()] ?? "details";
        continue;
      }
      const b = line.match(/^\s*[-*]\s+(.+)$/);
      if (!b || !cat) continue;
      const date = b[1].match(/\((\d{4}-\d{2}-\d{2})\)\s*$/)?.[1];
      const text = b[1].replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "").trim();
      if (!text || findSecret(text)) continue;
      const at = date ? new Date(date).toISOString() : now();
      data.entries.push({
        id: newEntryId(),
        category: cat,
        text: text.slice(0, 600),
        status: "verified",
        source: cat === "overview" ? "scan" : "user",
        createdAt: at,
        updatedAt: at,
      });
    }
    this.save(data);
    try {
      fs.renameSync(this.legacyPath, `${this.legacyPath}.bak`);
    } catch {
      // Nothing to read or move: fall through.
    }
    return data;
  }

  // ---- reads ----

  settings(): MemorySettings {
    return this.load().settings;
  }

  /** Entries, newest first within each category order. Superseded ones only on request. */
  list(
    filter: {
      category?: Category;
      status?: MemoryEntry["status"];
      query?: string;
      history?: boolean;
    } = {},
  ) {
    const q = filter.query?.trim().toLowerCase();
    return this.load()
      .entries.filter((e) => (filter.history ? true : !e.supersededBy))
      .filter((e) => !filter.category || e.category === filter.category)
      .filter((e) => !filter.status || e.status === filter.status)
      .filter(
        (e) =>
          !q ||
          e.text.toLowerCase().includes(q) ||
          categoryTitle(e.category).toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          CATEGORIES.findIndex((c) => c.id === a.category) -
            CATEGORIES.findIndex((c) => c.id === b.category) ||
          b.updatedAt.localeCompare(a.updatedAt),
      );
  }

  active() {
    return this.list();
  }

  get(id: string) {
    return this.load().entries.find((e) => e.id === id);
  }

  // ---- writes ----

  private guard(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) throw new MemoryError("A memory can't be empty.");
    if (clean.length > 600)
      throw new MemoryError("Keep a memory under 600 characters (one fact per note).");
    const secret = findSecret(clean);
    if (secret)
      throw new MemoryError(
        `Not saved: it contains what looks like ${secret}. Memory never stores credentials.`,
      );
    return clean;
  }

  /**
   * Adds an entry. Returns { entry } or { duplicateOf } when the same fact is already there.
   * With `replaces`, the old entry is kept as history (supersededBy).
   */
  add(input: NewEntry): { entry?: MemoryEntry; duplicateOf?: MemoryEntry } {
    const text = this.guard(input.text);
    const data = this.load();
    const live = data.entries.filter((e) => !e.supersededBy);
    const dup = live.find((e) => e.id !== input.replaces && isDuplicate(e.text, text));
    if (dup) return { duplicateOf: dup };
    const at = now();
    const entry: MemoryEntry = {
      id: newEntryId(),
      category: input.category,
      text,
      status: input.status ?? "verified",
      source: input.source ?? "user",
      ...(input.taskId ? { taskId: input.taskId } : {}),
      createdAt: at,
      updatedAt: at,
    };
    if (input.replaces) {
      const old = data.entries.find((e) => e.id === input.replaces && !e.supersededBy);
      if (old) {
        old.supersededBy = entry.id;
        old.updatedAt = at;
      }
    }
    data.entries.push(entry);
    this.save(data);
    return { entry };
  }

  /** Edits an entry. A user edit makes it verified. */
  update(
    id: string,
    patch: { text?: string; category?: Category; status?: MemoryEntry["status"] },
  ) {
    const data = this.load();
    const e = data.entries.find((x) => x.id === id);
    if (!e) throw new MemoryError("That memory no longer exists.");
    if (patch.text !== undefined) {
      const text = this.guard(patch.text);
      if (text !== e.text) {
        e.text = text;
        e.source = e.source === "scan" ? "user" : e.source;
      }
    }
    if (patch.category) e.category = patch.category;
    e.status = patch.status ?? "verified";
    e.updatedAt = now();
    this.save(data);
    return e;
  }

  verify(id: string) {
    return this.update(id, { status: "verified" });
  }

  /** Deletes an entry. History entries that pointed at it become live again. */
  remove(id: string): boolean {
    const data = this.load();
    const before = data.entries.length;
    data.entries = data.entries.filter((e) => e.id !== id);
    for (const e of data.entries) if (e.supersededBy === id) delete e.supersededBy;
    if (data.entries.length === before) return false;
    this.save(data);
    return true;
  }

  /** Deletes every entry; settings are kept. */
  clear() {
    const data = this.load();
    data.entries = [];
    delete data.analyzedAt;
    this.save(data);
  }

  setSettings(patch: Partial<MemorySettings>) {
    const data = this.load();
    data.settings = MemorySettings.parse({ ...data.settings, ...patch });
    this.save(data);
    return data.settings;
  }

  /** Replaces the scan-derived entries; user and task entries are kept. */
  replaceScan(facts: { category: Category; text: string }[]) {
    const data = this.load();
    const at = now();
    const kept = data.entries.filter((e) => e.source !== "scan");
    const fresh: MemoryEntry[] = [];
    for (const f of facts) {
      const text = f.text.replace(/\s+/g, " ").trim().slice(0, 600);
      if (!text || findSecret(text)) continue;
      fresh.push({
        id: newEntryId(),
        category: f.category,
        text,
        status: "verified",
        source: "scan",
        createdAt: at,
        updatedAt: at,
      });
    }
    data.entries = [...fresh, ...kept];
    data.analyzedAt = at;
    this.save(data);
  }

  /** Readable Markdown of the live entries (for `vard memory show/export`). */
  toMarkdown(): string {
    const entries = this.list();
    const lines = ["# Project memory", ""];
    for (const c of CATEGORIES) {
      const items = entries.filter((e) => e.category === c.id);
      if (!items.length) continue;
      lines.push(`## ${c.title}`);
      for (const e of items)
        lines.push(`- ${e.text}${e.status === "inferred" ? " _(inferred)_" : ""}`);
      lines.push("");
    }
    return lines.join("\n").trimEnd() + "\n";
  }
}
