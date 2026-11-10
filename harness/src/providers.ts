/**
 * Build an AI SDK language model from a BYOK provider config. Keys arrive per request from the
 * shell (macOS Keychain); they are passed straight to the provider client and never stored.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import type { ProviderConfig } from "./protocol";

export type ModelFactory = (cfg: ProviderConfig) => LanguageModel;

const needKey = (cfg: ProviderConfig) => {
  if (!cfg.apiKey) throw new Error(`missing API key for provider '${cfg.provider}'`);
  return cfg.apiKey;
};

export const createModel: ModelFactory = (cfg) => {
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropic({ apiKey: needKey(cfg), baseURL: cfg.baseUrl })(cfg.model);
    case "openai":
      return createOpenAI({ apiKey: needKey(cfg), baseURL: cfg.baseUrl })(cfg.model);
    case "openai-compatible":
      if (!cfg.baseUrl) throw new Error("openai-compatible provider needs baseUrl");
      return createOpenAI({ apiKey: cfg.apiKey ?? "none", baseURL: cfg.baseUrl }).chat(cfg.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: needKey(cfg), baseURL: cfg.baseUrl })(cfg.model);
    case "ollama":
      return createOllama({ baseURL: cfg.baseUrl ?? "http://127.0.0.1:11434/api" })(cfg.model) as LanguageModel;
  }
};
