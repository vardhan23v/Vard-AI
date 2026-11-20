/**
 * A small Markdown renderer for Ink: headings, lists, quotes, fenced code blocks and inline
 * `code` / **bold** / *italic*. Anything else is shown as written.
 */
import { Box, Text } from "ink";
import React from "react";
import { C } from "./theme";

type Block =
  | { kind: "code"; lang: string; text: string; open: boolean }
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; marker: string; indent: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "text"; text: string }
  | { kind: "blank" };

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+-]*)/);
    if (fence) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*```/.test(lines[j])) body.push(lines[j++]);
      out.push({
        kind: "code",
        lang: fence[1] ?? "",
        text: body.join("\n"),
        open: j >= lines.length,
      });
      i = j;
      continue;
    }
    if (!line.trim()) {
      if (out.at(-1)?.kind !== "blank") out.push({ kind: "blank" });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      out.push({ kind: "heading", level: h[1].length, text: h[2] });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push({ kind: "rule" });
      continue;
    }
    const b = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (b) {
      const marker = /\d/.test(b[2]) ? b[2] : "•";
      out.push({ kind: "bullet", marker, indent: Math.floor(b[1].length / 2), text: b[3] });
      continue;
    }
    const q = line.match(/^\s*>\s?(.*)$/);
    if (q) {
      out.push({ kind: "quote", text: q[1] });
      continue;
    }
    out.push({ kind: "text", text: line });
  }
  while (out.at(-1)?.kind === "blank") out.pop();
  return out;
}

/** Inline spans: `code`, **bold**, *italic* / _italic_. */
export function Inline({ text, color }: { text: string; color?: string }) {
  const parts: React.ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("`"))
      parts.push(
        <Text key={k++} color={C.star}>
          {t.slice(1, -1)}
        </Text>,
      );
    else if (t.startsWith("**") || t.startsWith("__"))
      parts.push(
        <Text key={k++} bold>
          {t.slice(2, -2)}
        </Text>,
      );
    else
      parts.push(
        <Text key={k++} italic>
          {t.slice(1, -1)}
        </Text>,
      );
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Text color={color}>{parts}</Text>;
}

export function Markdown({ text, color = C.ink }: { text: string; color?: string }) {
  const blocks = parseBlocks(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "code":
            return (
              <Box
                key={i}
                flexDirection="column"
                borderStyle="round"
                borderColor={C.line}
                paddingX={1}
              >
                {b.lang ? <Text color={C.muted}>{b.lang}</Text> : null}
                <Text color={C.sage}>{b.text || " "}</Text>
              </Box>
            );
          case "heading":
            return (
              <Text key={i} bold color={b.level <= 2 ? C.star : C.ink}>
                {b.text.replace(/\*\*/g, "")}
              </Text>
            );
          case "bullet":
            return (
              <Box key={i} paddingLeft={b.indent * 2}>
                <Text color={C.star}>{b.marker} </Text>
                <Box flexShrink={1}>
                  <Inline text={b.text} color={color} />
                </Box>
              </Box>
            );
          case "quote":
            return (
              <Box key={i}>
                <Text color={C.line}>│ </Text>
                <Inline text={b.text} color={C.ink2} />
              </Box>
            );
          case "rule":
            return (
              <Text key={i} color={C.line}>
                ────────────
              </Text>
            );
          case "blank":
            return <Text key={i}> </Text>;
          default:
            return <Inline key={i} text={b.text} color={color} />;
        }
      })}
    </Box>
  );
}
