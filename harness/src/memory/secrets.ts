/**
 * Keeps credentials out of project memory. Memory text is shown in the UI and sent to models,
 * so anything that looks like a key, token, password or private key is refused outright.
 */
import path from "node:path";

const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bsk-ant-[A-Za-z0-9_-]{16,}/, "an Anthropic API key"],
  [/\bsk-(?:proj-|or-v1-|live-|test-)?[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\bgsk_[A-Za-z0-9]{20,}/, "a Groq API key"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/, "a GitHub token"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAIza[0-9A-Za-z_-]{30,}/, "a Google API key"],
  [/\bwhsec_[A-Za-z0-9]{20,}/, "a webhook secret"],
  [/\bGOCSPX-[A-Za-z0-9_-]{20,}/, "an OAuth client secret"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JSON Web Token"],
  [
    /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/i,
    "a database URL with a password",
  ],
  [
    /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?[^\s"'`]{6,}/i,
    "a credential",
  ],
];

function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Long, mixed-case, random-looking strings (keys without a known prefix). Hashes and paths pass. */
function randomLooking(text: string): boolean {
  for (const tok of text.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? []) {
    if (!/[a-z]/.test(tok) || !/[A-Z]/.test(tok) || !/\d/.test(tok)) continue;
    if (/^[A-Za-z]+(?:[-_/][A-Za-z]+)*$/.test(tok)) continue;
    if (entropy(tok) >= 4.3) return true;
  }
  return false;
}

/** What kind of secret the text seems to contain, or null. */
export function findSecret(text: string): string | null {
  for (const [re, what] of PATTERNS) if (re.test(text)) return what;
  if (randomLooking(text)) return "a long random-looking string (possibly a key)";
  return null;
}

const SENSITIVE_NAMES = [
  /^\.env(\..*)?$/i,
  /^\.envrc$/i,
  /\.(pem|key|p12|pfx|keystore|jks|asc|gpg|kdbx)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^credentials(\..*)?$/i,
  /^secrets?(\..*)?$/i,
  /^\.(npmrc|netrc|pypirc|htpasswd|git-credentials)$/i,
  /^service-account.*\.json$/i,
  /^google-services\.json$/i,
  /^GoogleService-Info\.plist$/i,
];

/** Files whose contents must never be read into memory (and are left out of listings). */
export function isSensitivePath(p: string): boolean {
  const base = path.basename(p);
  if (SENSITIVE_NAMES.some((re) => re.test(base))) return true;
  return p.split("/").some((seg) => seg === ".ssh" || seg === ".aws" || seg === ".gnupg");
}
