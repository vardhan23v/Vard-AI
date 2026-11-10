import { useCallback, useSyncExternalStore } from "react";
import type { ProviderId } from "./agent-client";

export type ModelOption = { id: string; label: string; note?: string };
export type ProviderInfo = {
  id: ProviderId;
  label: string;
  needsKey: boolean;
  keyHint: string;
  keyUrl?: string;
  /** Fixed endpoint for OpenAI-compatible gateways. */
  baseUrl?: string;
  models: ModelOption[];
};

/**
 * Suggested models per provider. Any model id the provider accepts can also be
 * typed in by hand, so this list does not need to be exhaustive.
 */
export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    needsKey: true,
    keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Most capable" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Balanced" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    needsKey: true,
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    needsKey: true,
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "openai-compatible",
    label: "OpenRouter",
    needsKey: true,
    keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      // Free models (":free"). Which ones answer depends on the account's
      // privacy settings at openrouter.ai/settings/privacy.
      { id: "xingchen-agi/xing4.0-29b-a4b:free", label: "Xing 4.0 29B", note: "Free" },
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", note: "Free" },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", note: "Free" },
      { id: "cohere/north-mini-code:free", label: "North Mini Code", note: "Free" },
    ],
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    needsKey: false,
    keyHint: "No key needed",
    models: [
      { id: "llama3.3", label: "Llama 3.3" },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
    ],
  },
];

export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id);

export type ModelChoice = { provider: ProviderId; model: string };

/** The provider config sent to the sidecar (the shell adds the API key). */
export function providerConfig({ provider, model }: ModelChoice) {
  const baseUrl = providerInfo(provider)?.baseUrl;
  return baseUrl ? { provider, model, baseUrl } : { provider, model };
}

// Default to a free OpenRouter model so the app works out of the box for testing.
const DEFAULT_CHOICE: ModelChoice = { provider: "openai-compatible", model: "xingchen-agi/xing4.0-29b-a4b:free" };
const STORAGE_KEY = "vard:model";

// Small external store so every picker stays in sync.
const listeners = new Set<() => void>();
let current: ModelChoice = read();

function read(): ModelChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as ModelChoice;
      if (v.provider && v.model) return v;
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

export function modelLabel({ provider, model }: ModelChoice) {
  return providerInfo(provider)?.models.find((m) => m.id === model)?.label ?? model;
}
