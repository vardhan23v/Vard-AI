/**
 * MCP (Model Context Protocol) client for Vard: connect local (stdio) and remote (Streamable
 * HTTP) servers and use their tools, resources and prompts inside the existing agent workflow.
 *
 *  config.ts       versioned server configs (global + project), trust, imports
 *  secrets.ts      credentials in the macOS Keychain
 *  transport.ts    stdio / Streamable HTTP transports with explicit env and validated URLs
 *  client.ts       one connection: lifecycle, timeouts, reconnects, cached lists, logs
 *  manager.ts      all servers, per project; tools for the agent; UI/CLI operations
 *  tools.ts        MCP tool → Vard ToolDef (validation, normalized untrusted output)
 *  resources.ts    resource tools for the agent
 *  prompts.ts      prompt rendering for the user
 *  permissions.ts  allow / ask / deny decisions (used by policy.ts)
 *  security.ts     URL checks, path sandbox for arguments, redaction, untrusted wrapping
 *  oauth.ts        MCP authorization (OAuth 2.1 + PKCE, loopback redirect)
 */
export { McpConnection } from "./client";
export {
  importServers,
  isTrusted,
  knownImportSources,
  loadConfig,
  setTrust,
  vardHome,
} from "./config";
export { McpError, toMcpError } from "./errors";
export { McpManager, type ServerRef } from "./manager";
export { KeychainSecrets, MemorySecrets, secretAccount, type SecretStore } from "./secrets";
export { pathOutsideSandbox, validateServerUrl, wrapUntrusted } from "./security";
export { normalizeResult, qualifiedName } from "./tools";
export * from "./types";
