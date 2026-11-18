/**
 * Splits a raw input chunk into key presses. Ink decodes one key per chunk, but under load (or
 * with fast typing and pastes) several keys arrive together, e.g. "hi\r" or "\t\r\x03".
 */
export type KeyFlags = {
  return?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
};
export type KeyPress = { input: string; key: KeyFlags };

const CSI: Record<string, KeyFlags> = {
  A: { upArrow: true },
  B: { downArrow: true },
  C: { rightArrow: true },
  D: { leftArrow: true },
};

export function splitKeys(chunk: string): KeyPress[] {
  const out: KeyPress[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ input: text, key: {} });
    text = "";
  };
  const printableFollows = (i: number) => /[^\x00-\x1f\x7f]/.test(chunk.slice(i + 1).replace(/\x1b\[[0-9;]*[A-Za-z~]/g, ""));
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    const code = ch.charCodeAt(0);
    if (ch === "\x1b") {
      flush();
      const rest = chunk.slice(i + 1);
      const csi = rest.match(/^[[O]([0-9;]*)([A-Za-z~])/);
      if (csi) {
        i += csi[0].length;
        const k = CSI[csi[2]];
        if (k) out.push({ input: "", key: k });
        else if (csi[1] === "3" && csi[2] === "~") out.push({ input: "", key: { delete: true } });
        continue;
      }
      if (rest[0] === "\r") {
        i++;
        out.push({ input: "\r", key: { return: true, meta: true } });
        continue;
      }
      out.push({ input: "", key: { escape: true } });
      continue;
    }
    if (ch === "\r") {
      // Inside a paste, a line break is just text; at the end of the chunk it's Enter.
      if (printableFollows(i)) text += "\n";
      else {
        flush();
        out.push({ input: "\r", key: { return: true } });
      }
      continue;
    }
    if (ch === "\n") {
      text += "\n";
      continue;
    }
    if (ch === "\t") {
      flush();
      out.push({ input: "", key: { tab: true } });
      continue;
    }
    if (ch === "\x7f" || ch === "\b") {
      flush();
      out.push({ input: "", key: { backspace: true } });
      continue;
    }
    if (code < 32) {
      flush();
      out.push({ input: String.fromCharCode(code + 96), key: { ctrl: true } });
      continue;
    }
    text += ch;
  }
  flush();
  return out;
}
