/**
 * Guard rails for MCP: which URLs may be contacted, which path-like tool arguments stay inside
 * the project, how output is marked as untrusted, and how secrets are scrubbed from text.
 */
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { isInside, realpathLoose } from "../util";
import { McpError } from "./errors";

function isLoopback(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127\./.test(h) || h.endsWith(".localhost");
}

function isPrivate(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(h)) {
    const [a, b] = h.split(".").map(Number);
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0 ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(h)) return h.startsWith("fc") || h.startsWith("fd");
  return h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan");
}

function isLinkLocalOrMetadata(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    /^169\.254\./.test(h) ||
    h.startsWith("fe80") ||
    h === "metadata.google.internal" ||
    h === "metadata" ||
    h === "100.100.100.200"
  );
}

/**
 * Remote server URLs: https only (http only to this Mac), no credentials in the URL, never
 * link-local or cloud-metadata addresses, and no private-network hosts from project configs
 * (a cloned repo must not be able to point Vard at your LAN).
 */
export function validateServerUrl(raw: string, opts: { allowPrivate: boolean }): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new McpError("url", "That isn't a valid URL.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:")
    throw new McpError("url", "Only https URLs are supported.");
  if (u.username || u.password)
    throw new McpError(
      "url",
      "Don't put credentials in the URL; add them as a secret header or token.",
    );
  const loop = isLoopback(u.hostname);
  if (u.protocol === "http:" && !loop)
    throw new McpError("url", "Use https for remote servers (http is only allowed for localhost).");
  if (isLinkLocalOrMetadata(u.hostname))
    throw new McpError("url", "Link-local and cloud metadata addresses are blocked.");
  if (!opts.allowPrivate && (loop || isPrivate(u.hostname)))
    throw new McpError(
      "url",
      "Project configs can't point at this Mac or private networks. Add the server globally instead.",
    );
  return u;
}

/** Strings that look like filesystem paths (absolute, home, parent traversal or file URLs). */
function pathLike(v: string): string | null {
  const s = v.trim();
  if (s.length > 4096) return null;
  if (s.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(s).pathname);
    } catch {
      return s;
    }
  }
  if (s.startsWith("~/") || s === "~") return path.join(os.homedir(), s.slice(1));
  if (s.startsWith("/") && !s.startsWith("//") && !/\s/.test(s.split("/")[1] ?? "")) return s;
  if (/(^|[\\/])\.\.([\\/]|$)/.test(s)) return s;
  return null;
}

/**
 * Finds a path-like argument that points outside the project or task worktree. MCP servers have
 * their own reach, but Vard won't hand them paths outside the sandbox. Returns the offending
 * value, or null when everything is inside.
 */
export function pathOutsideSandbox(
  input: unknown,
  roots: { workRoot: string; projectRoot: string },
  depth = 0,
): string | null {
  if (depth > 6 || input == null) return null;
  if (typeof input === "string") {
    const p = pathLike(input);
    if (!p) return null;
    const abs = realpathLoose(path.resolve(roots.workRoot, p));
    const ok = [roots.workRoot, roots.projectRoot].some((r) => isInside(abs, realpathLoose(r)));
    return ok ? null : input;
  }
  if (Array.isArray(input)) {
    for (const v of input.slice(0, 200)) {
      const bad = pathOutsideSandbox(v, roots, depth + 1);
      if (bad) return bad;
    }
    return null;
  }
  if (typeof input === "object") {
    for (const v of Object.values(input as Record<string, unknown>).slice(0, 200)) {
      const bad = pathOutsideSandbox(v, roots, depth + 1);
      if (bad) return bad;
    }
  }
  return null;
}

/** Replaces each known secret value with •••. */
export function redact(text: string, secrets: Iterable<string>): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("•••");
  return out;
}

/** Makes server-supplied text safe to show the model: no control characters, bounded length. */
export function cleanText(text: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/** Wraps MCP output so the model treats it as data from that server, never as instructions. */
export function wrapUntrusted(server: string, tool: string, body: string): string {
  const safe = body.replace(/<\/?untrusted-mcp-output[^>]*>/gi, "[tag removed]");
  return `<untrusted-mcp-output server="${server}" tool="${tool}">\n${safe}\n</untrusted-mcp-output>`;
}
