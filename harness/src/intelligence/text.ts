/** Query tokenising shared by search and impact analysis. */
const STOP = new Set(
  "the a an and or of to in on for with where what which who how is are was be it this that these those my our your from by at as do does handled handle code file files find show me all any".split(
    " ",
  ),
);

/** Splits identifiers and text into lowercase words: "getUserToken" → get, user, token. */
export function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** Related terms for common concepts, so "authentication" also finds "login" and "jwt". */
const CONCEPTS: string[][] = [
  [
    "auth",
    "authentication",
    "authenticate",
    "login",
    "logout",
    "signin",
    "signup",
    "session",
    "token",
    "jwt",
    "oauth",
    "password",
    "credential",
  ],
  ["db", "database", "sql", "query", "schema", "migration", "repository", "model", "orm"],
  ["route", "router", "routing", "endpoint", "handler", "controller", "api"],
  ["test", "tests", "spec", "fixture", "mock"],
  ["config", "configuration", "settings", "env", "options"],
  ["error", "errors", "exception", "fail", "failure"],
  ["style", "styles", "css", "theme", "layout", "responsive"],
  ["payment", "billing", "checkout", "invoice", "stripe"],
  ["user", "users", "account", "profile", "member"],
  ["cache", "caching", "memo", "memoize"],
];

export function expand(tokens: string[]): { term: string; related: boolean }[] {
  const out = new Map<string, boolean>();
  for (const t of tokens) out.set(t, false);
  for (const t of tokens)
    for (const group of CONCEPTS)
      if (group.includes(t) || group.some((g) => g.length >= 4 && t.startsWith(g)))
        for (const g of group) if (!out.has(g)) out.set(g, true);
  return [...out].map(([term, related]) => ({ term, related }));
}
