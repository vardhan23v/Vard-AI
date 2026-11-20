/** Multiline text editing for the prompt box. Pure functions over { value, cursor }. */
export type Ed = { value: string; cursor: number };

export const empty: Ed = { value: "", cursor: 0 };
export const set = (value: string): Ed => ({ value, cursor: value.length });

export function insert(ed: Ed, s: string): Ed {
  const text = s.replace(/\r\n?/g, "\n");
  return {
    value: ed.value.slice(0, ed.cursor) + text + ed.value.slice(ed.cursor),
    cursor: ed.cursor + text.length,
  };
}

export function backspace(ed: Ed): Ed {
  if (ed.cursor === 0) return ed;
  return {
    value: ed.value.slice(0, ed.cursor - 1) + ed.value.slice(ed.cursor),
    cursor: ed.cursor - 1,
  };
}

export function deleteWordBack(ed: Ed): Ed {
  const before = ed.value.slice(0, ed.cursor);
  const cut = before.replace(/\S+\s*$|\s+$/, "");
  return { value: cut + ed.value.slice(ed.cursor), cursor: cut.length };
}

export const left = (ed: Ed): Ed => ({ ...ed, cursor: Math.max(0, ed.cursor - 1) });
export const right = (ed: Ed): Ed => ({ ...ed, cursor: Math.min(ed.value.length, ed.cursor + 1) });

function lineBounds(ed: Ed) {
  const start = ed.value.lastIndexOf("\n", ed.cursor - 1) + 1;
  const nl = ed.value.indexOf("\n", ed.cursor);
  return { start, end: nl === -1 ? ed.value.length : nl };
}

export const home = (ed: Ed): Ed => ({ ...ed, cursor: lineBounds(ed).start });
export const end = (ed: Ed): Ed => ({ ...ed, cursor: lineBounds(ed).end });
export const killToStart = (ed: Ed): Ed => {
  const { start } = lineBounds(ed);
  return { value: ed.value.slice(0, start) + ed.value.slice(ed.cursor), cursor: start };
};

/** Move the cursor one line up/down. Returns null when already on the first/last line. */
export function vertical(ed: Ed, dir: -1 | 1): Ed | null {
  const { start, end: lineEnd } = lineBounds(ed);
  const col = ed.cursor - start;
  if (dir === -1) {
    if (start === 0) return null;
    const prevStart = ed.value.lastIndexOf("\n", start - 2) + 1;
    return { ...ed, cursor: Math.min(prevStart + col, start - 1) };
  }
  if (lineEnd === ed.value.length) return null;
  const nextStart = lineEnd + 1;
  const nextEnd = ed.value.indexOf("\n", nextStart);
  return { ...ed, cursor: Math.min(nextStart + col, nextEnd === -1 ? ed.value.length : nextEnd) };
}

/** Prompt history with a scratch slot for the line being typed. */
export class History {
  private items: string[] = [];
  private pos = 0;
  private scratch = "";

  push(s: string) {
    if (s.trim() && this.items.at(-1) !== s) this.items.push(s);
    this.pos = this.items.length;
  }

  prev(current: string): string | null {
    if (this.pos === 0) return null;
    if (this.pos === this.items.length) this.scratch = current;
    return this.items[--this.pos];
  }

  next(): string | null {
    if (this.pos >= this.items.length) return null;
    this.pos++;
    return this.pos === this.items.length ? this.scratch : this.items[this.pos];
  }
}
