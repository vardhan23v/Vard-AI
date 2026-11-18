/** Normalized MCP errors: one class with a code, and messages that never include secrets. */
export type McpErrorCode =
  | "config"
  | "spawn"
  | "timeout"
  | "protocol"
  | "auth"
  | "closed"
  | "tool"
  | "denied"
  | "trust"
  | "url";

export class McpError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/** Turns anything thrown by the SDK or a transport into a short, user-facing McpError. */
export function toMcpError(e: unknown, fallback: McpErrorCode = "protocol"): McpError {
  if (e instanceof McpError) return e;
  const err = e as { code?: unknown; message?: unknown; name?: unknown };
  const msg = String(err?.message ?? e ?? "unknown error");
  if (err?.name === "UnauthorizedError" || /\b401\b|unauthori[sz]ed/i.test(msg))
    return new McpError("auth", "The server needs authorization.");
  if (/timed? ?out|RequestTimeout|-32001/i.test(msg))
    return new McpError("timeout", "The server didn't answer in time.");
  if (/ENOENT|not found|spawn/i.test(msg) && fallback === "spawn")
    return new McpError("spawn", `Couldn't start the server: ${msg}`);
  if (/closed|EPIPE|ECONNRESET|connection/i.test(msg))
    return new McpError("closed", `Connection lost: ${msg}`);
  return new McpError(fallback, msg.slice(0, 500));
}
