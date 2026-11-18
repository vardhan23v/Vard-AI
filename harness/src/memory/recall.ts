/**
 * Memory recall: the entries most useful for a task, within a character budget.
 *
 * Score = keyword/prefix overlap with the task + file-path mentions + a category weight
 * (how-to knowledge first) + a small bonus for verified and recent entries. The project
 * overview is always included. Superseded entries are history only and never recalled.
 */
import { CATEGORIES, type MemoryEntry, type MemoryStore, words } from "./store";

const STOP = new Set(
  "the and for with that this from into your you are was were will have has had not but all any can use using add make change update fix please should would could when then than them they their there what which while about after before its it's one".split(
    " ",
  ),
);

const CATEGORY_WEIGHT: Record<string, number> = {
  overview: 0,
  commands: 2,
  conventions: 2,
  architecture: 1.5,
  preferences: 2,
  fixes: 1,
  issues: 1,
  decisions: 1,
  details: 0.5,
};

const keywords = (s: string) => new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)));
const paths = (s: string) =>
  new Set((s.match(/[\w.-]+\/[\w./-]+|[\w-]+\.[a-z]{1,5}\b/gi) ?? []).map((p) => p.toLowerCase()));

function relevance(entry: MemoryEntry, want: Set<string>, wantPaths: Set<string>): number {
  let score = 0;
  for (const w of keywords(entry.text)) {
    if (want.has(w)) score += 1;
    else if (w.length >= 4)
      for (const x of want)
        if (x.length >= 4 && (x.startsWith(w) || w.startsWith(x))) {
          score += 0.6;
          break;
        }
  }
  for (const p of paths(entry.text))
    for (const q of wantPaths) if (p.includes(q) || q.includes(p)) score += 2;
  return score;
}

export type Recall = { text: string; ids: string[]; chars: number; total: number };

export function recall(store: MemoryStore, task: string, budgetChars?: number): Recall {
  const settings = store.settings();
  const budget = budgetChars ?? settings.maxContextChars;
  const live = store.active();
  if (!live.length) return { text: "", ids: [], chars: 0, total: 0 };
  const want = keywords(task);
  const wantPaths = paths(task);
  const newest = Math.max(...live.map((e) => Date.parse(e.updatedAt) || 0));
  const line = (e: MemoryEntry) =>
    `- ${e.text}${e.status === "inferred" ? " (inferred, unconfirmed)" : ""}`;

  const overview = live.filter((e) => e.category === "overview");
  const ranked = live
    .filter((e) => e.category !== "overview")
    .map((e) => {
      const ageDays = (newest - (Date.parse(e.updatedAt) || 0)) / 86_400_000;
      const score =
        relevance(e, want, wantPaths) * 3 +
        (CATEGORY_WEIGHT[e.category] ?? 0) +
        (e.status === "verified" ? 1 : 0) +
        Math.max(0, 1 - ageDays / 90);
      return { e, score };
    })
    .sort((a, b) => b.score - a.score);

  // Budget covers everything printed: lines, category headings and the "left out" note.
  const chosen = new Set<string>();
  const headed = new Set<string>();
  const reserve = 60;
  let used = 0;
  const take = (e: MemoryEntry) => {
    const heading = headed.has(e.category)
      ? 0
      : (CATEGORIES.find((c) => c.id === e.category)?.title.length ?? 10) + 5;
    const cost = line(e).length + 1 + heading;
    if (used + cost > budget - reserve) return false;
    used += cost;
    headed.add(e.category);
    chosen.add(e.id);
    return true;
  };
  for (const e of overview) if (!take(e)) break;
  for (const { e } of ranked) take(e);

  const out: string[] = [];
  for (const c of CATEGORIES) {
    const items = live.filter((e) => e.category === c.id && chosen.has(e.id));
    if (!items.length) continue;
    out.push(`## ${c.title}`, ...items.map(line), "");
  }
  const omitted = live.length - chosen.size;
  if (omitted > 0) out.push(`(${omitted} less related notes left out to save space)`);
  const text = out.join("\n").trim();
  return { text, ids: [...chosen], chars: text.length, total: live.length };
}
