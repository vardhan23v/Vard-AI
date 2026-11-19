/**
 * SKILL.md parsing: a strict subset of YAML for the frontmatter, so no dependency is needed and
 * nothing surprising (anchors, aliases, tags, merge keys) is accepted.
 *
 * Supported:
 *   key: scalar                plain, 'single' or "double" quoted, numbers, true/false, null
 *   key: [a, "b c"]            flow list of scalars
 *   key: |  /  key: >          block text (literal / folded)
 *   key:                       followed by indented "- scalar", "- k: v" items (with more
 *     - item                   "k: v" lines under them) or "k: v" pairs (a one-level map)
 */
export const MAX_SKILL_BYTES = 64 * 1024;
const MAX_FRONTMATTER_LINES = 300;

export interface ParsedSkillFile {
  data: Record<string, unknown>;
  body: string;
  errors: string[];
}

type Line = { n: number; indent: number; text: string };

function stripComment(s: string): string {
  // A '#' starts a comment at the start or after whitespace, outside quotes.
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

export function parseScalar(raw: string, line: number, errors: string[]): unknown {
  const s = raw.trim();
  if (!s) return null;
  if (/^[&*!]/.test(s)) {
    errors.push(`line ${line}: anchors, aliases and tags are not supported`);
    return null;
  }
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) {
      errors.push(`line ${line}: unterminated "string"`);
      return s.slice(1);
    }
    try {
      return JSON.parse(s);
    } catch {
      errors.push(`line ${line}: invalid "string"`);
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) {
      errors.push(`line ${line}: unterminated 'string'`);
      return s.slice(1);
    }
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith("{")) {
    errors.push(`line ${line}: flow maps ({…}) are not supported; use indented key: value lines`);
    return null;
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function splitFlowList(inner: string, line: number, errors: string[]): unknown[] {
  const items: string[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"') cur += inner[++i] ?? "";
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") {
      q = c;
      cur += c;
    } else if (c === ",") {
      items.push(cur);
      cur = "";
    } else if (c === "[" || c === "{") {
      errors.push(`line ${line}: nested collections are not supported`);
      return [];
    } else cur += c;
  }
  if (cur.trim()) items.push(cur);
  return items.map((s) => parseScalar(s, line, errors));
}

const KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:(?:\s+(.*)|\s*)$/;

function value(rest: string, line: number, errors: string[]): unknown {
  const r = rest.trim();
  if (r.startsWith("[")) {
    if (!r.endsWith("]")) {
      errors.push(`line ${line}: unterminated [list]`);
      return [];
    }
    return splitFlowList(r.slice(1, -1), line, errors);
  }
  return parseScalar(r, line, errors);
}

/** Parses the frontmatter lines (without the --- fences). */
export function parseFrontmatter(src: string): { data: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const data: Record<string, unknown> = {};
  const lines: Line[] = [];
  src.split("\n").forEach((raw, i) => {
    const n = i + 1;
    if (/^\s*\t/.test(raw)) errors.push(`line ${n}: use spaces, not tabs, for indentation`);
    lines.push({ n, indent: raw.length - raw.trimStart().length, text: raw.replace(/\r$/, "") });
  });
  if (lines.length > MAX_FRONTMATTER_LINES) return { data, errors: [`frontmatter is longer than ${MAX_FRONTMATTER_LINES} lines`] };

  let i = 0;
  const blank = (l: Line) => !stripComment(l.text).trim();
  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) {
      i++;
      continue;
    }
    if (l.indent !== 0) {
      errors.push(`line ${l.n}: unexpected indentation`);
      i++;
      continue;
    }
    const text = stripComment(l.text);
    const m = KEY_RE.exec(text);
    if (!m) {
      errors.push(`line ${l.n}: expected "key: value"`);
      i++;
      continue;
    }
    const key = m[1];
    if (key === "<<") errors.push(`line ${l.n}: merge keys are not supported`);
    if (key in data) errors.push(`line ${l.n}: duplicate key "${key}"`);
    const rest = m[2] ?? "";
    i++;

    // Block text: | or >
    if (/^[|>][+-]?$/.test(rest.trim())) {
      const folded = rest.trim().startsWith(">");
      const body: string[] = [];
      let indent = -1;
      while (i < lines.length && (lines[i].indent > 0 || !lines[i].text.trim())) {
        if (lines[i].text.trim() && indent < 0) indent = lines[i].indent;
        body.push(lines[i].text.slice(Math.max(0, indent)));
        i++;
      }
      while (body.length && !body[body.length - 1].trim()) body.pop();
      data[key] = folded ? body.join("\n").replace(/([^\n])\n(?!\n)/g, "$1 ").trim() : body.join("\n");
      continue;
    }
    if (rest.trim()) {
      data[key] = value(rest, l.n, errors);
      continue;
    }

    // Nested block: list items or a one-level map.
    const block: Line[] = [];
    while (i < lines.length && (lines[i].indent > 0 || blank(lines[i]))) {
      if (!blank(lines[i])) block.push({ ...lines[i], text: stripComment(lines[i].text) });
      i++;
    }
    if (!block.length) {
      data[key] = null;
      continue;
    }
    const base = block[0].indent;
    if (block[0].text.trimStart().startsWith("- ") || block[0].text.trim() === "-") {
      const items: unknown[] = [];
      let current: Record<string, unknown> | null = null;
      for (const b of block) {
        const t = b.text.trimStart();
        if (b.indent === base && (t.startsWith("- ") || t === "-")) {
          const item = t.slice(1).trim();
          const km = KEY_RE.exec(item);
          if (km && !item.startsWith('"') && !item.startsWith("'")) {
            current = { [km[1]]: value(km[2] ?? "", b.n, errors) };
            items.push(current);
          } else {
            current = null;
            items.push(value(item, b.n, errors));
          }
        } else if (b.indent > base && current) {
          const km = KEY_RE.exec(t);
          if (!km) errors.push(`line ${b.n}: expected "key: value" inside the list item`);
          else if (!km[2]?.trim()) errors.push(`line ${b.n}: nested blocks are not supported here`);
          else current[km[1]] = value(km[2], b.n, errors);
        } else errors.push(`line ${b.n}: unexpected line in list "${key}"`);
      }
      data[key] = items;
    } else {
      const map: Record<string, unknown> = {};
      for (const b of block) {
        const km = KEY_RE.exec(b.text.trimStart());
        if (b.indent !== base || !km) {
          errors.push(`line ${b.n}: only one level of "key: value" is supported under "${key}"`);
          continue;
        }
        map[km[1]] = value(km[2] ?? "", b.n, errors);
      }
      data[key] = map;
    }
  }
  return { data, errors };
}

/** Splits SKILL.md into frontmatter data and the Markdown body. */
export function parseSkillFile(text: string): ParsedSkillFile {
  if (Buffer.byteLength(text, "utf8") > MAX_SKILL_BYTES)
    return { data: {}, body: "", errors: [`SKILL.md is larger than ${MAX_SKILL_BYTES / 1024} KB`] };
  const src = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) return { data: {}, body: src, errors: ["SKILL.md must start with a --- frontmatter block"] };
  const lines = src.split("\n");
  const close = lines.findIndex((l, i) => i > 0 && /^---[ \t]*$/.test(l));
  if (close === -1) return { data: {}, body: "", errors: ["the frontmatter block is not closed with ---"] };
  const fm = lines.slice(1, close).join("\n");
  const after = lines.slice(close + 1).join("\n");
  const { data, errors } = parseFrontmatter(fm);
  return { data, body: after.trim(), errors };
}

/** The "## Heading" sections of a skill body (used for previews). */
export function sections(body: string): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = [];
  let cur: { title: string; lines: string[] } = { title: "", lines: [] };
  for (const line of body.split("\n")) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      if (cur.title || cur.lines.join("").trim()) out.push({ title: cur.title, text: cur.lines.join("\n").trim() });
      cur = { title: m[1].trim(), lines: [] };
    } else cur.lines.push(line);
  }
  if (cur.title || cur.lines.join("").trim()) out.push({ title: cur.title, text: cur.lines.join("\n").trim() });
  return out;
}
