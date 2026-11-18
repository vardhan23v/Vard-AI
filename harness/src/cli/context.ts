/** Everything a command needs, injectable so tests can drive commands without a terminal. */
import path from "node:path";
import { PROVIDERS, providerConfig, providerInfo, type ModelChoice } from "../catalog";
import type { ProviderConfig, ProviderId } from "../protocol";
import type { ModelFactory } from "../providers";
import { Client } from "./client";
import { ConfigStore, vardHome } from "./config";
import { KeyStore } from "./keys";
import type { Prompter } from "./prompt";
import { makeTheme, Spinner, type Theme, type Writer } from "./render";

export interface Ctx {
  out: Writer;
  err: Writer;
  theme: Theme;
  spinner: Spinner;
  prompter: Prompter;
  keys: KeyStore;
  config: ConfigStore;
  client: Client;
  cwd: string;
  env: Record<string, string | undefined>;
  /** Text piped in on stdin, if any. */
  stdinText?: string;
}

export function makeCtx(o: {
  out: Writer;
  err: Writer;
  color: boolean;
  spinner: boolean;
  prompter: Prompter;
  cwd: string;
  env: Record<string, string | undefined>;
  keys?: KeyStore;
  modelFactory?: ModelFactory;
  stdinText?: string;
}): Ctx {
  const theme = makeTheme(o.color);
  const home = vardHome(o.env);
  return {
    out: o.out,
    err: o.err,
    theme,
    spinner: new Spinner(o.err, theme, o.spinner),
    prompter: o.prompter,
    keys: o.keys ?? new KeyStore(o.env),
    config: new ConfigStore(home),
    client: new Client({ modelFactory: o.modelFactory, traceDir: o.env.VARD_TRACE_DIR || path.join(home, "traces") }),
    cwd: o.cwd,
    env: o.env,
    stdinText: o.stdinText,
  };
}

/** Accepts "openrouter" as a friendly name for the OpenRouter (openai-compatible) provider. */
export function parseProvider(name: string): ProviderId {
  const n = name.toLowerCase();
  if (n === "openrouter") return "openai-compatible";
  if (n === "gemini") return "google";
  const p = PROVIDERS.find((x) => x.id === n);
  if (!p) throw new Error(`Unknown provider "${name}". Use one of: anthropic, openai, google, openrouter, groq, ollama.`);
  return p.id;
}

export function providerName(id: ProviderId) {
  return id === "openai-compatible" ? "openrouter" : id;
}

/**
 * Picks the model: `--model` (a catalog id, or any id for the chosen provider), `--provider`,
 * then the saved default.
 */
export function chooseModel(ctx: Ctx, flags: { model?: string; provider?: string }): ModelChoice {
  const saved = ctx.config.load();
  const provider = flags.provider ? parseProvider(flags.provider) : undefined;
  if (flags.model) {
    if (provider) return { provider, model: flags.model };
    const hit = PROVIDERS.find((p) => p.models.some((m) => m.id === flags.model));
    return { provider: hit?.id ?? saved.provider, model: flags.model };
  }
  if (provider) {
    const first = providerInfo(provider)!.models[0];
    return { provider, model: provider === saved.provider ? saved.model : first.id };
  }
  return { provider: saved.provider, model: saved.model };
}

/** The provider config with its key, or a friendly error saying how to add one. */
export function providerWithKey(ctx: Ctx, choice: ModelChoice): ProviderConfig {
  const cfg: ProviderConfig = providerConfig(choice);
  const info = providerInfo(choice.provider);
  if (!info?.needsKey) return cfg;
  const k = ctx.keys.resolve(choice.provider);
  if (!k && ctx.keys.denied.has(choice.provider))
    throw new Error(
      `macOS didn't allow access to your saved ${info.label} key. Run the command again and choose ` +
        `"Always Allow" when macOS asks about "security", or save it for the CLI with ` +
        `\`vard keys set ${providerName(choice.provider)}\`.`,
    );
  if (!k)
    throw new Error(
      `No ${info.label} API key. Add one with \`vard keys set ${providerName(choice.provider)}\`, ` +
        `in the Vard AI app (Settings → API keys), or set ${envHint(choice.provider)}.`,
    );
  return { ...cfg, apiKey: k.key };
}

function envHint(p: ProviderId) {
  return { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GEMINI_API_KEY", "openai-compatible": "OPENROUTER_API_KEY", groq: "GROQ_API_KEY", ollama: "" }[p];
}
