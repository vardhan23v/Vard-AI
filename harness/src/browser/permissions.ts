/**
 * Browser policy (used by Policy.decide for tools with risk "browser"):
 *  - http(s) to this Mac (localhost, 127.*, ::1, *.localhost) is allowed; other sites ask, and
 *    "always" remembers the origin for the project; file:, chrome:, javascript: etc. are refused.
 *  - Clicks or key presses that look like paying, buying, transferring money, deleting an account,
 *    deploying or changing production, and typing into password, card or one-time-code fields,
 *    need confirm_sensitive and then ask every time.
 *  - Uploads always ask.
 * Page content is untrusted: tools wrap it, and nothing a page says changes these rules.
 */
import type { ToolDef } from "../tools/types";

export interface BrowserRules {
  /** Origins the user allowed for this project ("https://staging.example.com"). */
  browserOrigins?: string[];
}

export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\.\d+\.\d+\.\d+$/.test(h);
}

export function checkUrl(raw: string, allowedOrigins: string[] = []): { action: "allow" | "ask" | "deny"; reason: string; origin?: string } {
  if (raw === "about:blank") return { action: "allow", reason: "blank page" };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { action: "deny", reason: `not a valid URL: ${raw}` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { action: "deny", reason: `${u.protocol} URLs are not allowed in the browser agent` };
  if (u.username || u.password) return { action: "deny", reason: "URLs with credentials are not allowed" };
  if (isLocalHost(u.hostname)) return { action: "allow", reason: "local development server", origin: u.origin };
  if (allowedOrigins.includes(u.origin)) return { action: "allow", reason: `${u.origin} is allowed for this project`, origin: u.origin };
  return { action: "ask", reason: `open ${u.origin} (not on this Mac)`, origin: u.origin };
}

const SENSITIVE_TEXT =
  /\b(pay|payment|purchase|buy( now)?|checkout|place (your )?order|confirm order|subscribe|upgrade plan|transfer|send money|withdraw|wire|donate|delete (my |your |the )?account|close account|deactivate|remove account|deploy|publish to production|production|go live|release to prod|drop database|delete all|wipe|reset password|change password|revoke|billing)\b/i;
const SENSITIVE_FIELD = /\b(password|passcode|pass-?word|card|cc-|cvc|cvv|security code|iban|routing|account number|ssn|one-time-code|otp|2fa|pin)\b/i;

export function looksSensitiveAction(text: string): string | null {
  const m = SENSITIVE_TEXT.exec(text);
  return m ? m[0] : null;
}
export function looksSensitiveField(desc: string): string | null {
  const m = SENSITIVE_FIELD.exec(desc);
  return m ? m[0] : null;
}

const SENSITIVE_PARAM = /^(token|access_token|id_token|refresh_token|code|key|api_?key|secret|password|pass|pwd|auth|authorization|session|sid|sig|signature|jwt|otp|credential)$/i;

/** Removes sensitive query parameters and credentials from a URL (for logs, events and the model). */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    for (const k of [...u.searchParams.keys()]) if (SENSITIVE_PARAM.test(k)) u.searchParams.set(k, "REDACTED");
    if (/token|key|secret|password/i.test(u.hash)) u.hash = "#REDACTED";
    return u.toString();
  } catch {
    return raw.slice(0, 200);
  }
}

export interface BrowserDecision {
  action: "allow" | "ask" | "deny";
  reason: string;
  noAlways?: boolean;
}

export function decideBrowser(tool: ToolDef, input: Record<string, unknown>, rules: BrowserRules): BrowserDecision {
  const action = tool.browser?.action;
  if (action === "navigate" && typeof input.url === "string") {
    const c = checkUrl(input.url, rules.browserOrigins ?? []);
    return { action: c.action, reason: c.reason };
  }
  if (action === "upload") return { action: "ask", reason: `upload ${String(input.file ?? "a file")} to the page`, noAlways: true };
  if (input.confirm_sensitive === true) {
    const what = String(input.target ?? input.name ?? input.label ?? input.text ?? input.key ?? "this element");
    return { action: "ask", reason: `sensitive browser action (${tool.name.replace("browser_", "")} on "${what.slice(0, 80)}"). It may spend money, change an account or production.`, noAlways: true };
  }
  return { action: "allow", reason: "browser action on an allowed page" };
}

/** "Always" for a navigation remembers its origin; nothing else is remembered. */
export function rememberBrowser(tool: ToolDef, input: Record<string, unknown>, rules: BrowserRules): boolean {
  if (tool.browser?.action !== "navigate" || typeof input.url !== "string") return false;
  const c = checkUrl(input.url, []);
  if (c.action !== "ask" || !c.origin) return false;
  rules.browserOrigins = [...new Set([...(rules.browserOrigins ?? []), c.origin])];
  return true;
}
