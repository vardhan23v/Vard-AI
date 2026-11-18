/** Presentational pieces of the vard TUI. State lives in app.tsx. */
import { Box, Text } from "ink";
import React, { useEffect, useState } from "react";
import { colorDiffLines } from "./diff";
import { Markdown } from "./markdown";
import { C } from "./theme";

export type Item =
  | { id: number; kind: "banner"; model: string; provider: string; cwd: string; version: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string }
  | { id: number; kind: "task"; text: string; model: string }
  | { id: number; kind: "tool"; tool: string; detail: string; ok?: boolean; error?: string }
  | { id: number; kind: "plan"; text: string }
  | { id: number; kind: "todos"; todos: { content: string; status: string }[] }
  | { id: number; kind: "verify"; status: "running" | "passed" | "failed"; command: string; output?: string }
  | { id: number; kind: "notice"; text: string; tone?: "muted" | "error" | "ok" | "star" }
  | { id: number; kind: "diff"; diff: string }
  | { id: number; kind: "memory"; text: string; path: string; count: number }
  | { id: number; kind: "help" };

const LOGO = [
  "██╗   ██╗ █████╗ ██████╗ ██████╗ ",
  "██║   ██║██╔══██╗██╔══██╗██╔══██╗",
  "╚██╗ ██╔╝███████║██████╔╝██║  ██║",
  " ╚████╔╝ ██╔══██║██╔══██╗██║  ██║",
  "  ╚██╔╝  ██║  ██║██║  ██║██████╔╝",
  "   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ",
];

const LOGO_WIDTH = Math.max(...LOGO.map((l) => [...l].length));

/** Shortens a path from the left so it fits, e.g. "…/projects/shop". */
export function fitPath(p: string, max: number) {
  if (p.length <= max) return p;
  return "…" + p.slice(p.length - Math.max(4, max - 1));
}

/**
 * The welcome banner adapts to the window: logo beside the title when there's room (≥ 86
 * columns), logo above it in medium windows, and no logo in narrow ones. Nothing ever wraps
 * mid-logo.
 */
export function Banner({ item, columns }: { item: Extract<Item, { kind: "banner" }>; columns: number }) {
  const showLogo = columns >= LOGO_WIDTH + 4;
  const sideBySide = columns >= LOGO_WIDTH + 3 + 44 + 2;
  const title = (
    <Box flexDirection="column" justifyContent="center" flexShrink={1}>
      <Text color={C.star}>✦ ·  ✧   ·  ✦</Text>
      <Text bold color={C.ink}>
        Vard AI <Text color={C.muted}>v{item.version}</Text>
      </Text>
      <Text color={C.ink2} wrap="truncate-end">
        Chat and a coding agent in your terminal
      </Text>
      <Text color={C.muted} wrap="truncate-end">
        {item.model} <Text color={C.line}>·</Text> {item.provider}
      </Text>
    </Box>
  );
  const logo = (
    <Box flexDirection="column" flexShrink={0} width={LOGO_WIDTH}>
      {LOGO.map((l, i) => (
        <Text key={i} color={i < 3 ? C.star : C.cerulean} wrap="truncate-end">
          {l}
        </Text>
      ))}
    </Box>
  );
  const inner = Math.max(10, columns - 4);
  return (
    <Box flexDirection="column" marginBottom={1} width={columns}>
      {sideBySide ? (
        <Box>
          <Box marginRight={3}>{logo}</Box>
          {title}
        </Box>
      ) : (
        <Box flexDirection="column">
          {showLogo ? <Box marginBottom={1}>{logo}</Box> : null}
          {title}
        </Box>
      )}
      <Box borderStyle="round" borderColor={C.line} paddingX={1} marginTop={1} flexDirection="column">
        <Text color={C.ink} wrap="truncate-end">
          {fitPath(item.cwd, inner)}
        </Text>
        {columns >= 76 ? (
          <Text color={C.muted}>
            Type to chat · <Text color={C.star}>/task</Text> to change this repo ·{" "}
            <Text color={C.star}>/help</Text> for commands · <Text color={C.star}>Esc</Text> stops
          </Text>
        ) : (
          <Text color={C.muted}>
            Chat · <Text color={C.star}>/task</Text> · <Text color={C.star}>/help</Text> ·{" "}
            <Text color={C.star}>Esc</Text> stops
          </Text>
        )}
      </Box>
    </Box>
  );
}

export const COMMANDS: { name: string; args?: string; desc: string }[] = [
  { name: "/task", args: "<what to do>", desc: "Run the coding agent in this repo" },
  { name: "/model", args: "[id]", desc: "Pick or switch the model" },
  { name: "/sessions", desc: "Resume an earlier conversation" },
  { name: "/memory", args: "[rebuild]", desc: "What Vard remembers about this project" },
  { name: "/plan", args: "on|off", desc: "Ask for a plan before the agent edits" },
  { name: "/diff", desc: "Show the kept task's changes" },
  { name: "/merge", desc: "Merge the kept task into your branch" },
  { name: "/discard", desc: "Drop the kept task" },
  { name: "/keys", desc: "Show which API keys are set" },
  { name: "/clear", desc: "Start a new conversation" },
  { name: "/help", desc: "Commands and keys" },
  { name: "/exit", desc: "Quit" },
];

function Help() {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.line} paddingX={1}>
      <Text bold color={C.star}>
        Commands
      </Text>
      {COMMANDS.map((c) => (
        <Text key={c.name}>
          <Text color={C.star}>{(c.name + (c.args ? " " + c.args : "")).padEnd(22)}</Text>
          <Text color={C.ink2}>{c.desc}</Text>
        </Text>
      ))}
      <Text> </Text>
      <Text bold color={C.star}>
        Keys
      </Text>
      <Text color={C.ink2}>
        Enter send · Ctrl+J or Alt+Enter new line · ↑↓ history · Tab complete · Esc stop · Ctrl+C twice quit
      </Text>
    </Box>
  );
}

const Gutter = ({ mark, color }: { mark: string; color: string }) => (
  <Box width={2} flexShrink={0}>
    <Text color={color}>{mark}</Text>
  </Box>
);

export function ItemView({ item, columns = 100 }: { item: Item; columns?: number }) {
  switch (item.kind) {
    case "banner":
      return <Banner item={item} columns={columns} />;
    case "help":
      return <Help />;
    case "user":
      return (
        <Box marginTop={1}>
          <Gutter mark="›" color={C.star} />
          <Box flexShrink={1}>
            <Text bold color={C.ink}>
              {item.text}
            </Text>
          </Box>
        </Box>
      );
    case "assistant":
      return (
        <Box marginTop={1}>
          <Gutter mark="✦" color={C.cerulean} />
          <Box flexShrink={1} flexDirection="column">
            <Markdown text={item.text} />
          </Box>
        </Box>
      );
    case "task":
      return (
        <Box marginTop={1} borderStyle="round" borderColor={C.cerulean} paddingX={1}>
          <Text color={C.cerulean}>⚙ Task </Text>
          <Box flexShrink={1}>
            <Text color={C.ink}>{item.text}</Text>
          </Box>
          <Text color={C.muted}> · {item.model}</Text>
        </Box>
      );
    case "tool":
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text>
            <Text color={item.ok === false ? C.danger : item.ok ? C.sage : C.cerulean}>
              {item.ok === false ? "✗" : item.ok ? "✓" : "▸"}{" "}
            </Text>
            <Text color={C.ink}>{item.tool}</Text>
            {item.detail ? <Text color={C.muted}> {item.detail}</Text> : null}
          </Text>
          {item.error ? (
            <Box paddingLeft={2}>
              <Text color={C.danger}>{item.error}</Text>
            </Box>
          ) : null}
        </Box>
      );
    case "plan":
      return (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={C.star} paddingX={1}>
          <Text bold color={C.star}>
            Plan
          </Text>
          <Markdown text={item.text} />
        </Box>
      );
    case "todos":
      return (
        <Box flexDirection="column" paddingLeft={2}>
          {item.todos.map((t, i) => (
            <Text key={i}>
              <Text color={t.status === "completed" ? C.sage : t.status === "in_progress" ? C.star : C.muted}>
                {t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○"}{" "}
              </Text>
              <Text color={t.status === "completed" ? C.muted : C.ink} strikethrough={t.status === "completed"}>
                {t.content}
              </Text>
            </Text>
          ))}
        </Box>
      );
    case "verify":
      return (
        <Box flexDirection="column" paddingLeft={2}>
          <Text>
            <Text color={item.status === "failed" ? C.danger : item.status === "passed" ? C.sage : C.cerulean}>
              {item.status === "failed" ? "✗" : item.status === "passed" ? "✓" : "⟳"}{" "}
            </Text>
            <Text color={C.ink}>verify </Text>
            <Text color={C.muted}>{item.command}</Text>
          </Text>
          {item.status === "failed" && item.output ? (
            <Box paddingLeft={2}>
              <Text color={C.muted}>{item.output.trim().split("\n").slice(-12).join("\n")}</Text>
            </Box>
          ) : null}
        </Box>
      );
    case "notice": {
      const color =
        item.tone === "error" ? C.danger : item.tone === "ok" ? C.sage : item.tone === "star" ? C.star : C.muted;
      return (
        <Box paddingLeft={2} marginTop={item.tone === "ok" || item.tone === "error" ? 1 : 0}>
          <Text color={color}>{item.text}</Text>
        </Box>
      );
    }
    case "memory":
      return (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={C.cerulean} paddingX={1}>
          <Text bold color={C.cerulean}>
            Project memory <Text color={C.muted}>· {item.count} notes</Text>
          </Text>
          <Markdown text={item.text.replace(/<!--[\s\S]*?-->/g, "").replace(/^# Project memory\s*/, "")} />
          <Text color={C.muted}>
            {item.path} · edit with <Text color={C.star}>vard memory edit</Text> · /memory rebuild refreshes the overview
          </Text>
        </Box>
      );
    case "diff":
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.line} paddingX={1}>
          {colorDiffLines(item.diff).map((l, i) => (
            <Text key={i} color={l.color} bold={l.bold}>
              {l.text || " "}
            </Text>
          ))}
        </Box>
      );
  }
}

const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

export function Spinner({ label }: { label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => n + 1), 90);
    return () => clearInterval(t);
  }, []);
  return (
    <Box paddingLeft={2}>
      <Text color={C.star}>{FRAMES[i % FRAMES.length]} </Text>
      <Text color={C.muted}>{label}</Text>
    </Box>
  );
}

export function StatusBar(p: {
  model: string;
  provider: string;
  branch: string | null;
  planFirst: boolean;
  tokens: number;
  state: string;
  kept: string | null;
  memory?: number;
}) {
  const sep = <Text color={C.line}> │ </Text>;
  return (
    <Box justifyContent="space-between">
      <Text wrap="truncate-end">
        <Text color={C.star}>✦ vard</Text>
        {sep}
        <Text color={C.ink}>{p.model}</Text>
        <Text color={C.muted}> ({p.provider})</Text>
        {p.branch ? (
          <>
            {sep}
            <Text color={C.cerulean}>⎇ {p.branch}</Text>
          </>
        ) : null}
        {sep}
        <Text color={C.muted}>plan {p.planFirst ? "on" : "off"}</Text>
        {p.kept ? (
          <>
            {sep}
            <Text color={C.star}>kept {p.kept}</Text>
          </>
        ) : null}
        {p.memory ? (
          <>
            {sep}
            <Text color={C.muted}>memory {p.memory}</Text>
          </>
        ) : null}
      </Text>
      <Text wrap="truncate-start">
        <Text color={C.muted}>{p.tokens ? `${p.tokens.toLocaleString()} tok` : ""}</Text>
        {p.tokens ? sep : null}
        <Text color={p.state === "idle" ? C.sage : C.star}>{p.state}</Text>
      </Text>
    </Box>
  );
}

export type ChoiceOption = { key: string; label: string; tone?: "danger" | "ok" };

/** A bordered pop-up with single-key or arrow+Enter choices. Keys are handled by the app. */
export function ChoiceModal(p: {
  title: string;
  children?: React.ReactNode;
  options: ChoiceOption[];
  selected: number;
  hint?: string;
}) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.star} paddingX={1} marginTop={1}>
      <Text bold color={C.star}>
        {p.title}
      </Text>
      {p.children}
      <Box marginTop={1} flexWrap="wrap">
        {p.options.map((o, i) => (
          <Box key={o.key} marginRight={2}>
            <Text
              color={i === p.selected ? C.bg : o.tone === "danger" ? C.danger : C.ink}
              backgroundColor={i === p.selected ? C.star : undefined}
            >
              {` ${o.key} `}
              {o.label}{" "}
            </Text>
          </Box>
        ))}
      </Box>
      <Text color={C.muted}>{p.hint ?? "Press a key, or ←→ and Enter"}</Text>
    </Box>
  );
}

export type PickerRow = { id: string; label: string; detail?: string; current?: boolean };

export function Picker(p: { title: string; rows: PickerRow[]; filter: string; selected: number; empty?: string }) {
  const max = 10;
  const start = Math.max(0, Math.min(p.selected - Math.floor(max / 2), p.rows.length - max));
  const visible = p.rows.slice(start, start + max);
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={C.star} paddingX={1} marginTop={1}>
      <Text>
        <Text bold color={C.star}>
          {p.title}
        </Text>
        <Text color={C.muted}> filter: </Text>
        <Text color={C.ink}>{p.filter || "…"}</Text>
      </Text>
      {visible.length === 0 ? <Text color={C.muted}>{p.empty ?? "Nothing matches"}</Text> : null}
      {visible.map((r, i) => {
        const sel = start + i === p.selected;
        return (
          <Text key={r.id} wrap="truncate-end">
            <Text color={sel ? C.star : C.line}>{sel ? "❯ " : "  "}</Text>
            <Text color={sel ? C.star : C.ink} bold={sel}>
              {r.label}
            </Text>
            {r.current ? <Text color={C.sage}> ●</Text> : null}
            {r.detail ? <Text color={C.muted}> {r.detail}</Text> : null}
          </Text>
        );
      })}
      <Text color={C.muted}>Type to filter · ↑↓ move · Enter choose · Esc cancel</Text>
    </Box>
  );
}
