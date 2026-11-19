/**
 * The task graph: validation (ids, dependencies, cycles, limits), duplicate detection, implicit
 * ordering of subtasks that touch the same files, and readiness.
 */
import { tokens } from "../skills/resolver";
import { type SubTask, type SubtaskState, type TaskGraph } from "./schema";

export function validateGraph(g: TaskGraph, opts: { maxSubtasks: number }): string[] {
  const errors: string[] = [];
  if (g.tasks.length > opts.maxSubtasks) errors.push(`too many subtasks: ${g.tasks.length} (limit ${opts.maxSubtasks})`);
  const ids = new Set<string>();
  for (const t of g.tasks) {
    if (ids.has(t.id)) errors.push(`duplicate subtask id "${t.id}"`);
    ids.add(t.id);
  }
  for (const t of g.tasks)
    for (const d of t.dependsOn) {
      if (d === t.id) errors.push(`"${t.id}" depends on itself`);
      else if (!ids.has(d)) errors.push(`"${t.id}" depends on unknown subtask "${d}"`);
    }
  const cycle = findCycle(g.tasks);
  if (cycle) errors.push(`dependency cycle: ${cycle.join(" → ")}`);
  return errors;
}

/** A cycle in the dependency graph (as a path of ids), or null. */
export function findCycle(tasks: Pick<SubTask, "id" | "dependsOn">[]): string[] | null {
  const deps = new Map(tasks.map((t) => [t.id, t.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const t of tasks) {
    const c = visit(t.id);
    if (c) return c;
  }
  return null;
}

function similarity(a: SubTask, b: SubTask): number {
  const ta = new Set(tokens(`${a.title} ${a.description}`));
  const tb = new Set(tokens(`${b.title} ${b.description}`));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / (ta.size + tb.size - inter);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Merges subtasks that are the same work (same role and the same title, or near-identical text).
 * Dependencies on a dropped subtask are redirected to the one kept.
 */
export function dedupeGraph(g: TaskGraph): { graph: TaskGraph; merged: { dropped: string; into: string }[] } {
  const kept: SubTask[] = [];
  const merged: { dropped: string; into: string }[] = [];
  for (const t of g.tasks) {
    const dup = kept.find((k) => k.role === t.role && (norm(k.title) === norm(t.title) || similarity(k, t) >= 0.85));
    if (dup) {
      merged.push({ dropped: t.id, into: dup.id });
      dup.files = [...new Set([...dup.files, ...t.files])];
      dup.dependsOn = [...new Set([...dup.dependsOn, ...t.dependsOn])];
    } else kept.push({ ...t, dependsOn: [...t.dependsOn], files: [...t.files] });
  }
  const map = new Map(merged.map((m) => [m.dropped, m.into]));
  for (const t of kept) t.dependsOn = [...new Set(t.dependsOn.map((d) => map.get(d) ?? d))].filter((d) => d !== t.id);
  return { graph: { ...g, tasks: kept }, merged };
}

/** True when two path patterns could name the same file. */
export function pathsOverlap(a: string, b: string): boolean {
  const ca = a.replace(/^\.\//, "").replace(/\/+$/, "");
  const cb = b.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (cb.startsWith(`${ca}/`) || ca.startsWith(`${cb}/`)) return true;
  const glob = (p: string) => /[*?[{]/.test(p);
  try {
    if (glob(ca) && new Bun.Glob(ca).match(cb)) return true;
    if (glob(cb) && new Bun.Glob(cb).match(ca)) return true;
  } catch {}
  if (glob(ca) && glob(cb)) {
    // Two globs: compare their fixed directory prefixes.
    const pre = (p: string) => p.slice(0, p.search(/[*?[{]/)).replace(/[^/]*$/, "");
    const pa = pre(ca);
    const pb = pre(cb);
    return pa.startsWith(pb) || pb.startsWith(pa);
  }
  return false;
}

/** All transitive dependencies of `id`. */
function ancestors(id: string, deps: Map<string, string[]>, seen = new Set<string>()): Set<string> {
  for (const d of deps.get(id) ?? []) if (!seen.has(d)) ancestors(d, deps, seen.add(d));
  return seen;
}

/**
 * Subtasks that expect to change the same files run one after the other: the later one (in plan
 * order) gets an implicit dependency on the earlier, unless they are already ordered.
 */
export function addFileEdges(tasks: SubTask[]): Map<string, string[]> {
  const deps = new Map(tasks.map((t) => [t.id, [...t.dependsOn]]));
  const implicit = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  for (let i = 0; i < tasks.length; i++)
    for (let j = i + 1; j < tasks.length; j++) {
      const a = tasks[i];
      const b = tasks[j];
      if (!a.files.some((fa) => b.files.some((fb) => pathsOverlap(fa, fb)))) continue;
      if (ancestors(b.id, deps).has(a.id) || ancestors(a.id, deps).has(b.id)) continue;
      deps.get(b.id)!.push(a.id);
      implicit.get(b.id)!.push(a.id);
    }
  return implicit;
}

const DONE_OK = new Set(["completed"]);
const DEAD = new Set(["failed", "cancelled", "skipped", "needs_attention", "blocked"]);

export const allDeps = (s: SubtaskState) => [...s.dependsOn, ...s.implicitDeps];

/** Pending subtasks whose dependencies all completed. */
export function readySubtasks(subs: SubtaskState[]): SubtaskState[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  return subs.filter((s) => s.status === "pending" && allDeps(s).every((d) => DONE_OK.has(byId.get(d)?.status ?? "")));
}

/** Marks pending subtasks whose dependencies can no longer complete as blocked. Returns those changed. */
export function propagateBlocked(subs: SubtaskState[]): SubtaskState[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  const changed: SubtaskState[] = [];
  let again = true;
  while (again) {
    again = false;
    for (const s of subs) {
      if (s.status !== "pending") continue;
      const dead = allDeps(s).filter((d) => DEAD.has(byId.get(d)?.status ?? ""));
      if (dead.length) {
        s.status = "blocked";
        s.blockedBy = dead;
        changed.push(s);
        again = true;
      }
    }
  }
  return changed;
}

/** Dependency layers for display: layer n holds subtasks whose dependencies are all in earlier layers. */
export function layers(subs: Pick<SubtaskState, "id" | "dependsOn" | "implicitDeps">[]): string[][] {
  const out: string[][] = [];
  const placed = new Set<string>();
  const ids = new Set(subs.map((s) => s.id));
  let rest = [...subs];
  while (rest.length) {
    const layer = rest.filter((s) => [...s.dependsOn, ...s.implicitDeps].every((d) => placed.has(d) || !ids.has(d)));
    if (!layer.length) {
      out.push(rest.map((s) => s.id));
      break;
    }
    out.push(layer.map((s) => s.id));
    for (const s of layer) placed.add(s.id);
    rest = rest.filter((s) => !placed.has(s.id));
  }
  return out;
}
