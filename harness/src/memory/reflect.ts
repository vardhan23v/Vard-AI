/**
 * Learning after a task: ask the model which durable facts are worth keeping, then decide what
 * happens to them according to the project's `autoUpdate` setting.
 *
 *  - "ask":  everything is a proposal; the user approves (and approved notes are verified).
 *  - "auto": saved right away as *inferred* (never verified) and reported as added; a note that
 *            would replace a *verified* entry still needs approval.
 *  - "off":  the caller doesn't reflect at all.
 */
import { z } from "zod";
import { findSecret } from "./secrets";
import { Category, contradicts, isDuplicate, type MemoryEntry, type MemoryStore } from "./store";

export type Proposal = {
  id: string;
  category: Category;
  text: string;
  /** Entry this note would replace (a contradiction or an update). */
  replaces?: string;
  replacesText?: string;
  /** Saved already (auto mode); `id` is then the new entry's id. */
  autoSaved?: boolean;
};

const Item = z.object({
  category: Category.exclude(["overview"]),
  text: z.string().min(8).max(300),
  replaces: z.string().optional(),
});

export function reflectPrompt(input: {
  prompt: string;
  summary: string;
  tools: string[];
  diffStat?: string;
  verify?: string;
  existing: MemoryEntry[];
}): string {
  const existing = input.existing
    .slice(0, 80)
    .map((e) => `[${e.id}] (${e.category}${e.status === "inferred" ? ", inferred" : ""}) ${e.text}`)
    .join("\n");
  return `You just finished a coding task in this project. Decide what is worth remembering for FUTURE tasks in the same project.

Task: ${input.prompt}
Result: ${input.summary || "(no summary)"}
${input.verify ? `Verification: ${input.verify}\n` : ""}${input.diffStat ? `Files changed:\n${input.diffStat}\n` : ""}Steps taken:
${input.tools.slice(-40).join("\n") || "(none)"}

Project memory so far (id, category, text):
${existing || "(empty)"}

Reply with ONLY a JSON array (no prose) of 0 to 5 items:
[{"category": "conventions", "text": "Tests sit next to the code as *.test.ts and run with \`bun test\`"}]
If a note corrects or updates an existing one, add "replaces": "<its id>".

Categories: "architecture" (important files, modules, entry points), "commands" (build/test/run commands), "conventions" (how code is written, named, tested), "preferences" (what the user asked for or prefers in this project), "decisions" (choices made and why), "fixes" (a bug and how it was solved), "issues" (known problems or limitations), "details" (non-obvious implementation details).
Rules: only facts you actually observed in this task; no guesses; nothing already in memory; nothing about this one task only (like "added multiply()"); never include secrets, keys, tokens or passwords; one fact per item, under 200 characters. If nothing is worth keeping, reply [].`;
}

/**
 * Notes that only describe what this task did ("Added divide() to math.ts", "math.test.ts now
 * imports divide") instead of a reusable fact. Models produce these despite the instructions.
 */
export function isTaskNarration(text: string, category: string): boolean {
  if (
    /^(added|implemented|created|wrote|introduced|modified|changed|updated|extended|appended|inserted|refactored)\b/i.test(
      text,
    )
  )
    return true;
  if (category !== "fixes" && /^fixed\b/i.test(text)) return true;
  return /\bnow (imports|includes|has|contains|exports|returns|handles)\b/i.test(text);
}

/** Parses the model's reply into clean, de-duplicated proposals. Malformed replies give []. */
export function parseProposals(reply: string, existing: MemoryEntry[], idPrefix = "p"): Proposal[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const live = existing.filter((e) => !e.supersededBy);
  const out: Proposal[] = [];
  for (const r of raw.slice(0, 8)) {
    const p = Item.safeParse(r);
    if (!p.success) continue;
    const text = p.data.text.replace(/\s+/g, " ").trim();
    if (findSecret(text)) continue;
    if (isTaskNarration(text, p.data.category)) continue;
    if (live.some((e) => isDuplicate(e.text, text)) || out.some((o) => isDuplicate(o.text, text)))
      continue;
    let replaces =
      p.data.replaces && live.some((e) => e.id === p.data.replaces) ? p.data.replaces : undefined;
    // Same subject with different specifics (e.g. another test command) is an update, not a new fact.
    replaces ??= live.find((e) => e.category === p.data.category && contradicts(e.text, text))?.id;
    const old = replaces ? live.find((e) => e.id === replaces) : undefined;
    out.push({
      id: `${idPrefix}${out.length}`,
      category: p.data.category,
      text,
      ...(old ? { replaces: old.id, replacesText: old.text } : {}),
    });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Applies proposals under `autoUpdate: "auto"`: saves what may be saved as inferred, and
 * returns the list for the UI (saved ones marked autoSaved, the rest still proposals).
 */
export function applyAuto(store: MemoryStore, proposals: Proposal[], taskId: string): Proposal[] {
  return proposals.map((p) => {
    const target = p.replaces ? store.get(p.replaces) : undefined;
    if (target?.status === "verified") return p; // never overwrite a verified fact without asking
    try {
      const r = store.add({
        category: p.category,
        text: p.text,
        status: "inferred",
        source: "task",
        taskId,
        replaces: p.replaces,
      });
      return r.entry ? { ...p, id: r.entry.id, autoSaved: true } : p;
    } catch {
      return p;
    }
  });
}
