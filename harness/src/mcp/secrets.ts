/**
 * MCP credentials (env secrets, header values, bearer tokens, OAuth tokens) in the macOS
 * Keychain, service `ai.vard.mcp`. Same route as the CLI's API keys (`security -i`, value on
 * stdin, never in argv), so both the app's agent and the CLI can read them. Values are only ever
 * handed to the MCP transport; listings report "set" or "not set".
 */
import crypto from "node:crypto";
import path from "node:path";
import { securityRunner, type SecurityRunner } from "../cli/keys";
import type { McpScope } from "./types";

export const MCP_KEYCHAIN_SERVICE = "ai.vard.mcp";

export interface SecretStore {
  get(account: string): string | null;
  set(account: string, value: string): void;
  remove(account: string): void;
}

/** The account name for one secret: scope, server and name; project scope is keyed by its path. */
export function secretAccount(
  scope: McpScope,
  serverId: string,
  name: string,
  projectRoot?: string,
): string {
  const where =
    scope === "global"
      ? "global"
      : `project-${crypto
          .createHash("sha256")
          .update(path.resolve(projectRoot ?? ""))
          .digest("hex")
          .slice(0, 12)}`;
  return `${where}/${serverId}/${name}`;
}

export class KeychainSecrets implements SecretStore {
  private cache = new Map<string, string | null>();
  constructor(private run: SecurityRunner = securityRunner) {}

  get(account: string): string | null {
    if (this.cache.has(account)) return this.cache.get(account)!;
    const r = this.run(["find-generic-password", "-s", MCP_KEYCHAIN_SERVICE, "-a", account, "-w"]);
    const v = r.code === 0 ? r.stdout.replace(/\n$/, "") : null;
    this.cache.set(account, v);
    return v;
  }

  set(account: string, value: string) {
    if (/["\\\n]/.test(value) || /["\\\s]/.test(account))
      throw new Error("That value can't be stored (quotes, backslashes or line breaks).");
    this.run(["delete-generic-password", "-s", MCP_KEYCHAIN_SERVICE, "-a", account]);
    const r = this.run(
      ["-i"],
      `add-generic-password -s ${MCP_KEYCHAIN_SERVICE} -a "${account}" -l "Vard AI MCP" -T "/usr/bin/security" -w "${value}"\n`,
    );
    if (r.code !== 0)
      throw new Error(`Couldn't save to the Keychain: ${r.stderr.trim() || `exit ${r.code}`}`);
    this.cache.set(account, value);
  }

  remove(account: string) {
    this.run(["delete-generic-password", "-s", MCP_KEYCHAIN_SERVICE, "-a", account]);
    this.cache.set(account, null);
  }
}

/** In-memory store, for tests and non-macOS systems. */
export class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();
  get(account: string) {
    return this.values.get(account) ?? null;
  }
  set(account: string, value: string) {
    this.values.set(account, value);
  }
  remove(account: string) {
    this.values.delete(account);
  }
}

export const defaultSecretStore = (): SecretStore =>
  process.platform === "darwin" ? new KeychainSecrets() : new MemorySecrets();
