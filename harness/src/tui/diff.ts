import { C } from "./theme";

/** Unified diff lines with Starry Night colours. Long diffs are cut to keep the screen usable. */
export function colorDiffLines(diff: string, max = 400) {
  const lines = diff.replace(/\s+$/, "").split("\n");
  const shown = lines.slice(0, max).map((text) => {
    if (text.startsWith("diff ")) return { text, color: C.star, bold: true };
    if (text.startsWith("+++") || text.startsWith("---")) return { text, color: C.ink, bold: true };
    if (text.startsWith("+")) return { text, color: C.sage };
    if (text.startsWith("-")) return { text, color: C.danger };
    if (text.startsWith("@@")) return { text, color: C.cerulean };
    return { text, color: C.muted };
  });
  if (lines.length > max)
    shown.push({ text: `… ${lines.length - max} more lines (use git diff)`, color: C.muted });
  return shown as { text: string; color: string; bold?: boolean }[];
}
