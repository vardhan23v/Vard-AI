import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_CHOICE, providerInfo, type ModelChoice } from "../../harness/src/catalog";

export {
  PROVIDERS,
  DEFAULT_CHOICE,
  providerInfo,
  providerConfig,
  modelLabel,
  type ModelOption,
  type ProviderInfo,
  type ModelChoice,
} from "../../harness/src/catalog";

const STORAGE_KEY = "vard:model";

// Small external store so every picker stays in sync.
const listeners = new Set<() => void>();
let current: ModelChoice = read();

function read(): ModelChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as ModelChoice;
      // A model that has left the list (withdrawn or renamed) falls back to the default.
      if (providerInfo(v.provider)?.models.some((m) => m.id === v.model)) return v;
    }
  } catch {
    // Storage unavailable: use the default.
  }
  return DEFAULT_CHOICE;
}

export function setModelChoice(choice: ModelChoice) {
  current = choice;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Not persisted; still applies for this session.
  }
  for (const l of listeners) l();
}

export function useModelChoice(): [ModelChoice, (c: ModelChoice) => void] {
  const value = useSyncExternalStore(
    useCallback((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }, []),
    () => current,
  );
  return [value, setModelChoice];
}
