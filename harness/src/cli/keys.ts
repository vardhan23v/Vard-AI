/**
 * API keys for the CLI. An environment variable wins; otherwise the key comes from the same
 * macOS Keychain item the desktop app saves (service `ai.vard.desktop`, account = provider id).
 */
import fs from "node:fs";
import type { ProviderId } from "../protocol";

export const KEYCHAIN_SERVICE = "ai.vard.desktop";
export const APP_PATH = "/Applications/Vard AI.app";

export const ENV_VARS: Record<ProviderId, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  "openai-compatible": ["OPENROUTER_API_KEY"],
  groq: ["GROQ_API_KEY"],
  ollama: [],
};

export type RunResult = { code: number; stdout: string; stderr: string };
/** Runs `/usr/bin/security`, optionally feeding it `input` on stdin. */
export type SecurityRunner = (args: string[], input?: string) => RunResult;

export const securityRunner: SecurityRunner = (args, input) => {
  const r = Bun.spawnSync(["/usr/bin/security", ...args], {
    stdin: input !== undefined ? new TextEncoder().encode(input) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: r.exitCode ?? 1,
    stdout: r.stdout?.toString() ?? "",
    stderr: r.stderr?.toString() ?? "",
  };
};

export type ResolvedKey = { key: string; source: "env" | "keychain"; envVar?: string };

export function mask(key: string) {
  return key.length <= 8 ? "••••" : `${key.slice(0, 5)}…${key.slice(-4)}`;
}

export class KeyStore {
  /** Providers whose Keychain item exists but couldn't be read (access denied or prompt dismissed). */
  readonly denied = new Set<ProviderId>();
  constructor(
    private env: Record<string, string | undefined> = process.env,
    private run: SecurityRunner = securityRunner,
    private platform: string = process.platform,
  ) {}

  resolve(provider: ProviderId): ResolvedKey | null {
    for (const v of ENV_VARS[provider]) {
      const key = this.env[v]?.trim();
      if (key) return { key, source: "env", envVar: v };
    }
    if (this.platform !== "darwin" || provider === "ollama") return null;
    const r = this.run(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", provider, "-w"]);
    const key = r.code === 0 ? r.stdout.trim() : "";
    // 44 = no such item. Anything else means the item is there but macOS refused to hand it over.
    this.denied.add(provider);
    if (r.code === 0 || r.code === 44) this.denied.delete(provider);
    return key ? { key, source: "keychain" } : null;
  }

  /**
   * Saves a key. It goes to `security -i` on stdin, so it never shows up in the process list.
   * Both the CLI and the installed app are put on the item's access list.
   */
  set(provider: ProviderId, key: string): RunResult {
    this.ensureMac();
    if (!/^[\x21-\x7e]+$/.test(key) || key.includes('"') || key.includes("\\"))
      throw new Error("That doesn't look like an API key (unexpected characters).");
    // Replace rather than update, so the new access list applies.
    this.run(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", provider]);
    const trusted = ["/usr/bin/security", ...(fs.existsSync(APP_PATH) ? [APP_PATH] : [])];
    const cmd = [
      "add-generic-password",
      `-s ${KEYCHAIN_SERVICE}`,
      `-a ${provider}`,
      `-l ${KEYCHAIN_SERVICE}`,
      ...trusted.map((t) => `-T "${t}"`),
      `-w "${key}"`,
    ].join(" ");
    return this.run(["-i"], cmd + "\n");
  }

  remove(provider: ProviderId): boolean {
    this.ensureMac();
    return this.run(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", provider]).code === 0;
  }

  private ensureMac() {
    if (this.platform !== "darwin")
      throw new Error("Keychain storage needs macOS. Use an environment variable instead.");
  }
}
