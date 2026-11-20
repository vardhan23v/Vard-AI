/**
 * Project memory: what Vard knows about a project between tasks.
 * See store.ts (storage), analyze.ts (project analysis), recall.ts (context selection),
 * reflect.ts (learning after tasks) and secrets.ts (what is never stored).
 */
export * from "./store";
export { analyzeProject, projectFiles, type Fact } from "./analyze";
export { recall, type Recall } from "./recall";
export {
  applyAuto,
  isTaskNarration,
  parseProposals,
  reflectPrompt,
  type Proposal,
} from "./reflect";
export { findSecret, isSensitivePath } from "./secrets";

import { analyzeProject } from "./analyze";
import type { MemoryStore } from "./store";

/** Runs (or re-runs) the project analysis into the store. */
export function analyze(store: MemoryStore) {
  store.replaceScan(analyzeProject(store.projectRoot, store.settings().exclude));
}

/** Analyzes the project the first time memory is used. */
export function ensureAnalyzed(store: MemoryStore) {
  const data = store.load();
  if (!data.analyzedAt) analyze(store);
}
