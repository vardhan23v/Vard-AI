/**
 * Provider and model catalog shared by the desktop app (src/lib/models.ts) and the `vard` CLI.
 */
import type { ProviderId } from "./protocol";

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
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra", note: "Free" },
      { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 Super", note: "Free" },
      { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B", note: "Free" },
      { id: "cohere/north-mini-code:free", label: "North Mini Code", note: "Free" },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    needsKey: true,
    keyHint: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      // Free tier with per-minute and daily limits.
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Free tier" },
      { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", note: "Free tier" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", note: "Free tier, fastest" },
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

/** The provider config sent to the sidecar (the caller adds the API key). */
export function providerConfig({ provider, model }: ModelChoice) {
  const baseUrl = providerInfo(provider)?.baseUrl;
  return baseUrl ? { provider, model, baseUrl } : { provider, model };
}

/** Works with a free Groq key. */
export const DEFAULT_CHOICE: ModelChoice = { provider: "groq", model: "openai/gpt-oss-120b" };

export function modelLabel({ provider, model }: ModelChoice) {
  return providerInfo(provider)?.models.find((m) => m.id === model)?.label ?? model;
}
