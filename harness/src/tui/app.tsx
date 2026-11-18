/**
 * The full-screen vard interface (Ink). Finished transcript items go to <Static> (terminal
 * scrollback); the streaming reply, the running tool, pop-ups and the prompt box stay live below.
 */
import { Box, Static, Text, useApp, useStdout } from "ink";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modelLabel, PROVIDERS, type ModelChoice } from "../catalog";
import type { Event } from "../protocol";
import { VERSION } from "../server";
import { newId } from "../cli/client";
import { chooseModel, providerName, providerWithKey, type Ctx } from "../cli/context";
import { mask } from "../cli/keys";
import { describeToolInput, explainError } from "../cli/render";
import { append, listSessions, loadSession, newSession, type SessionFile } from "../cli/commands/session";
import { gitRoot } from "../cli/commands/task";
import {
  ChoiceModal,
  type ChoiceOption,
  COMMANDS,
  type Item,
  ItemView,
  Picker,
  type PickerRow,
  Spinner,
  StatusBar,
} from "./components";
import * as E from "./editor";
import { analyze as analyzeMemory, type Proposal } from "../memory";
import { itemLabel, memoryFor } from "../cli/commands/memory";
import { type KeyFlags, splitKeys } from "./keys";
import { Markdown } from "./markdown";
import { C } from "./theme";

type ItemBody = Item extends infer I ? (I extends Item ? Omit<I, "id"> : never) : never;
type Busy = null | "chat" | "task";
type Approval = Extract<Event, { type: "approval_request" }>;
type Modal =
  | { type: "approval"; taskId: string; ev: Approval }
  | { type: "merge"; taskId: string; branch: string; path: string }
  | { type: "picker"; kind: "model" | "session"; filter: string }
  | { type: "memory"; items: Proposal[]; checked: boolean[] };
type InputMode = { kind: "normal" } | { kind: "planEdit" | "reject"; taskId: string; ev: Approval };

const STATE_LABEL: Record<string, string> = {
  planning: "Planning…",
  acting: "Working…",
  observing: "Reading results…",
  verifying: "Verifying…",
};

function gitBranch(cwd: string): string | null {
  const r = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd, stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString().trim() : null;
}

/** Subscribes to raw keyboard chunks; returns an unsubscribe function. */
export type KeySource = (onChunk: (chunk: string) => void) => () => void;

export type AppProps = {
  ctx: Ctx;
  keys: KeySource;
  continue?: boolean;
  model?: string;
  provider?: string;
  onExit: (code: number) => void;
};

export function App(props: AppProps) {
  const { ctx } = props;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(() => stdout.columns || 100);

  const idRef = useRef(0);
  const [choice, setChoiceState] = useState<ModelChoice>(() => chooseModel(ctx, props));
  const choiceRef = useRef(choice);
  const setChoice = (c: ModelChoice) => {
    choiceRef.current = c;
    setChoiceState(c);
  };
  const [planFirst, setPlanFirst] = useState(() => ctx.config.load().planFirst);
  const sessionRef = useRef<SessionFile>(null as unknown as SessionFile);
  if (!sessionRef.current) {
    const last = props.continue ? listSessions(ctx)[0] : undefined;
    sessionRef.current = last ? loadSession(last.file) : newSession(ctx);
  }

  const banner = (): Item => ({
    id: idRef.current++,
    kind: "banner",
    model: modelLabel(choiceRef.current),
    provider: providerName(choiceRef.current.provider),
    cwd: ctx.cwd,
    version: VERSION,
  });
  const historyItems = (s: SessionFile): Item[] =>
    s.messages.map((m) => ({ id: idRef.current++, kind: m.role === "user" ? "user" : "assistant", text: m.content }) as Item);

  const [items, setItems] = useState<Item[]>(() => [banner(), ...historyItems(sessionRef.current)]);
  const [epoch, setEpoch] = useState(0); // remounts <Static> after a screen clear
  const [live, setLive] = useState("");
  const liveRef = useRef("");
  const [pendingTool, setPendingTool] = useState<Extract<Item, { kind: "tool" }> | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [label, setLabel] = useState("");
  const [tokens, setTokens] = useState(0);
  const [branch, setBranch] = useState(() => gitBranch(ctx.cwd));
  const [kept, setKept] = useState<{ taskId: string; branch: string; path: string } | null>(null);
  const [memCount, setMemCount] = useState(() => memoryFor(ctx.cwd).active().length);
  const proposalsRef = useRef<Proposal[]>([]);
  const taskIdRef = useRef<string | undefined>(undefined);
  const [modal, setModal] = useState<Modal | null>(null);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<InputMode>({ kind: "normal" });
  const [ed, setEdState] = useState<E.Ed>(E.empty);
  // Key handlers can run several times before React re-renders, so they read and write a ref.
  const edRef = useRef<E.Ed>(E.empty);
  const setEd = (u: E.Ed | ((e: E.Ed) => E.Ed)) => {
    edRef.current = typeof u === "function" ? u(edRef.current) : u;
    setEdState(edRef.current);
  };
  const [acIndex, setAcIndex] = useState(0);
  const [acHidden, setAcHidden] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const history = useRef(new E.History());
  const cancelRef = useRef<(() => void) | null>(null);
  const queuedRef = useRef<string | null>(null);
  const approvals = useRef<{ taskId: string; ev: Approval }[]>([]);
  const lastCtrlC = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((...bodies: ItemBody[]) => {
    setItems((prev) => [...prev, ...bodies.map((b) => ({ ...b, id: idRef.current++ }) as Item)]);
  }, []);
  const note = (text: string, tone: "muted" | "error" | "ok" | "star" = "muted") => commit({ kind: "notice", text, tone });

  // Streamed text is batched so a fast model doesn't re-render per token.
  const pushToken = (t: string) => {
    liveRef.current += t;
    if (!flushTimer.current)
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        setLive(liveRef.current);
      }, 40);
  };
  const takeLive = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const t = liveRef.current;
    liveRef.current = "";
    setLive("");
    return t;
  };

  const clearScreen = (keep: Item[]) => {
    stdout.write("\x1b[2J\x1b[3J\x1b[H");
    setItems(keep);
    setEpoch((e) => e + 1);
  };

  // Ink can't erase lines the terminal re-wrapped on resize, so redraw everything once the
  // window settles: clear the screen and reprint the transcript at the new width.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setColumns(stdout.columns || 100);
        stdout.write("\x1b[2J\x1b[3J\x1b[H");
        setEpoch((n) => n + 1);
      }, 120);
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
      if (timer) clearTimeout(timer);
    };
  }, [stdout]);

  const quit = (code = 0) => {
    cancelRef.current?.();
    props.onExit(code);
    exit();
  };

  // ---------- chat ----------
  const chat = async (text: string) => {
    const s = sessionRef.current;
    commit({ kind: "user", text });
    append(s, { role: "user", content: text });
    let provider;
    try {
      provider = providerWithKey(ctx, choiceRef.current);
    } catch (e) {
      s.messages.pop();
      note((e as Error).message, "error");
      return;
    }
    setBusy("chat");
    setLabel(`${modelLabel(choiceRef.current)} is thinking…`);
    const { result, cancel } = ctx.client.chat(provider, s.messages, {
      token: (t) => {
        if (!liveRef.current) setLabel(`${modelLabel(choiceRef.current)} is thinking…`);
        pushToken(t);
      },
      retry: (msg, delayMs) => setLabel(`Rate-limited; retrying in ${Math.ceil(delayMs / 1000)}s…`),
    });
    cancelRef.current = cancel;
    const r = await result;
    cancelRef.current = null;
    const textOut = takeLive() || r.text;
    if (textOut) {
      commit({ kind: "assistant", text: textOut });
      append(s, { role: "assistant", content: textOut });
    } else s.messages.pop();
    if (r.status === "cancelled") note("stopped");
    if (r.status === "error") note(explainError(r.error ?? ""), "error");
    if (r.usage) setTokens((n) => n + r.usage!.totalTokens);
    setBusy(null);
    const q = queuedRef.current;
    queuedRef.current = null;
    if (q) void submit(q);
  };

  // ---------- agent task ----------
  const nextApproval = () => {
    const a = approvals.current.shift();
    if (a) {
      setSelected(0);
      setModal({ type: "approval", taskId: a.taskId, ev: a.ev });
    }
  };

  const runTask = async (prompt: string) => {
    const root = gitRoot(ctx.cwd);
    if (!root) {
      note("This folder isn't a git repository. The agent works on its own branch, so run `git init` first.", "error");
      return;
    }
    let provider;
    try {
      provider = providerWithKey(ctx, choiceRef.current);
    } catch (e) {
      note((e as Error).message, "error");
      return;
    }
    if (kept) note(`Leaving ${kept.branch} as it is; merge it later with git merge ${kept.branch}.`);
    setKept(null);
    const taskId = newId("tui");
    let worktree: { branch: string; path: string } | undefined;
    let streamedPlan = "";
    // Retry notices replace the spinner label until work resumes; then the state label returns.
    let stateLabel = "Starting…";
    const resume = () => setLabel(stateLabel);
    commit({ kind: "task", text: prompt, model: choiceRef.current.model });
    setBusy("task");
    setLabel("Starting…");
    cancelRef.current = () => void ctx.client.cancel(taskId);

    const flushText = (skipIf?: string) => {
      const t = takeLive();
      if (t.trim() && t.trim() !== skipIf?.trim()) commit({ kind: "assistant", text: t });
      return t;
    };

    const onEvent = (e: Event) => {
      switch (e.type) {
        case "state":
          if (STATE_LABEL[e.state]) stateLabel = STATE_LABEL[e.state];
          if (e.state === "awaiting_plan_approval") stateLabel = "Waiting for you";
          resume();
          break;
        case "token":
          if (!liveRef.current) resume();
          pushToken(e.text);
          break;
        case "tool_call":
          resume();
          streamedPlan = "";
          flushText();
          if (e.tool !== "todo_write")
            setPendingTool({ id: -1, kind: "tool", tool: e.tool, detail: describeToolInput(e.tool, e.input) });
          break;
        case "tool_result":
          resume();
          if (e.tool === "todo_write") break;
          setPendingTool((p) => {
            commit({
              kind: "tool",
              tool: e.tool,
              detail: p?.detail ?? "",
              ok: e.ok,
              error: e.ok ? undefined : e.output.split("\n")[0].slice(0, 200),
            });
            return null;
          });
          break;
        case "plan":
          streamedPlan = e.plan;
          flushText(e.plan);
          commit({ kind: "plan", text: e.plan.trim() });
          break;
        case "todos":
          commit({ kind: "todos", todos: e.todos });
          break;
        case "verify":
          commit({ kind: "verify", status: e.status, command: e.command, output: e.output });
          break;
        case "retry":
          setLabel(
            /tool call|failed_generation/i.test(e.message)
              ? "The model sent a malformed tool call; asking it to retry…"
              : `Rate-limited; retrying in ${Math.ceil(e.delayMs / 1000)}s…`,
          );
          break;
        case "worktree":
          if (e.action === "created" && e.branch && e.path) {
            worktree = { branch: e.branch, path: e.path };
            note(`Working on branch ${e.branch}`);
          }
          break;
        case "usage":
          resume();
          break;
        case "memory_proposal":
          proposalsRef.current = e.items;
          taskIdRef.current = taskId;
          break;
        case "approval_request":
          flushText(streamedPlan);
          approvals.current.push({ taskId, ev: e });
          setModal((m) => {
            if (m) return m;
            const a = approvals.current.shift()!;
            setSelected(0);
            return { type: "approval", taskId: a.taskId, ev: a.ev };
          });
          break;
        case "error":
          note(explainError(e.message), "error");
          break;
      }
    };

    let done;
    try {
      done = await ctx.client.startTask(
        { taskId, projectRoot: root, prompt, provider, planFirst, useWorktree: true, useMemory: true, learn: true },
        onEvent,
      );
    } catch (e) {
      cancelRef.current = null;
      setBusy(null);
      note((e as Error).message, "error");
      return;
    }
    cancelRef.current = null;
    setPendingTool(null);
    flushText(done.summary);
    const usage = done.usage ? ` · ${done.steps ?? 0} steps · ${done.usage.totalTokens.toLocaleString()} tokens` : "";
    if (done.usage) setTokens((n) => n + done.usage!.totalTokens);
    if (done.status === "done") {
      // Show the summary unless it was just streamed.
      note(`✓ Done${usage}`, "ok");
    } else if (done.status === "blocked") note(`■ Stopped: ${done.reason ?? done.summary}${usage}`, "error");
    else note("Task cancelled.");
    setBusy(null);
    setBranch(gitBranch(ctx.cwd));
    setMemCount(memoryFor(ctx.cwd).active().length);

    if (!worktree || !done.diffStat?.trim()) {
      if (worktree) {
        await ctx.client.discard(taskId).catch(() => {});
        note("No file changes; removed the task's branch.");
      }
      offerMemories();
      return;
    }
    note(`Changes:\n${done.diffStat.trim()}`, "star");
    setSelected(0);
    setModal({ type: "merge", taskId, ...worktree });
  };

  // ---------- commands ----------
  const showKeys = () => {
    const lines = PROVIDERS.filter((p) => p.needsKey).map((p) => {
      const k = ctx.keys.resolve(p.id);
      return `${k ? "✓" : "○"} ${providerName(p.id).padEnd(11)} ${k ? `${mask(k.key)} (${k.source === "env" ? `$${k.envVar}` : "Keychain"})` : "no key · vard keys set " + providerName(p.id)}`;
    });
    note(lines.join("\n"));
  };

  const runCommand = async (input: string) => {
    const [cmd, ...rest] = input.split(/\s+/);
    const arg = input.slice(cmd.length).trim();
    switch (cmd) {
      case "/exit":
      case "/quit":
        return quit(0);
      case "/help":
        return commit({ kind: "help" });
      case "/clear":
        sessionRef.current = newSession(ctx);
        setTokens(0);
        return clearScreen([banner()]);
      case "/model":
      case "/models":
        if (!arg) {
          setSelected(0);
          return setModal({ type: "picker", kind: "model", filter: "" });
        }
        setChoice(chooseModel(ctx, { model: rest[0], provider: rest[1] }));
        return note(`Using ${modelLabel(choiceRef.current)} (${providerName(choiceRef.current.provider)})`, "ok");
      case "/sessions":
      case "/resume":
        setSelected(0);
        return setModal({ type: "picker", kind: "session", filter: "" });
      case "/plan":
        if (arg === "on" || arg === "off") setPlanFirst(arg === "on");
        return note(`Plan first: ${arg === "on" || arg === "off" ? arg : planFirst ? "on" : "off"}`);
      case "/memory": {
        const store = memoryFor(ctx.cwd);
        if (arg === "analyze" || arg === "rebuild") {
          analyzeMemory(store);
          setMemCount(store.active().length);
          return note(`✓ Analyzed the project; your own notes are kept (${store.path})`, "ok");
        }
        const query = arg.startsWith("search") ? arg.slice(6).trim() : arg;
        const entries = store.list({ query: query || undefined });
        if (!store.exists())
          return note("No memory for this project yet. It starts with your first /task, or run /memory analyze.");
        if (!entries.length) return note(`No notes match "${query}".`);
        commit({ kind: "memory", entries, path: store.path, total: store.active().length, query: query || undefined });
        return;
      }
      case "/mcp": {
        const list = ctx.client.server.mcp.status(gitRoot(ctx.cwd) ?? ctx.cwd);
        if (!list.length) return note("No MCP servers. Add them in the app (Integrations) or with `vard mcp add`.");
        return note(
          list
            .map((s) => `${s.state === "connected" ? "●" : "○"} ${s.id.padEnd(18)} ${s.state}${s.state === "connected" ? ` · ${s.toolCount} tools` : ""}${s.error ? ` · ${s.error}` : ""}`)
            .join("\n") + "\nServers connect when a /task starts. Manage them with `vard mcp`.",
        );
      }
      case "/keys":
        return showKeys();
      case "/task":
      case "/run":
        if (!arg) return note("Usage: /task <what the agent should do>");
        return runTask(arg);
      case "/diff":
      case "/merge":
      case "/discard": {
        if (!kept) return note("No kept task. Run /task first.");
        try {
          if (cmd === "/diff") return commit({ kind: "diff", diff: (await ctx.client.diff(kept.taskId)).diff });
          if (cmd === "/merge") {
            await ctx.client.merge(kept.taskId);
            note(`✓ Merged ${kept.branch}`, "ok");
          } else {
            await ctx.client.discard(kept.taskId);
            note("Discarded.");
          }
          setKept(null);
          setBranch(gitBranch(ctx.cwd));
        } catch (e) {
          note((e as Error).message, "error");
        }
        return;
      }
      default:
        return note(`Unknown command ${cmd}. Type /help.`);
    }
  };

  const submit = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    history.current.push(raw);
    try {
      if (text.startsWith("/")) await runCommand(text);
      else await chat(text);
    } catch (e) {
      setBusy(null);
      note((e as Error).message, "error");
    }
  };

  // ---------- pop-up answers ----------
  const approvalOptions = (ev: Approval): ChoiceOption[] =>
    ev.kind === "plan"
      ? [
          { key: "y", label: "Approve", tone: "ok" },
          { key: "e", label: "Edit plan" },
          { key: "n", label: "Reject", tone: "danger" },
        ]
      : ev.mcp?.destructive
        ? [
            { key: "a", label: "Allow once", tone: "ok" },
            { key: "d", label: "Deny", tone: "danger" },
          ]
        : [
            { key: "a", label: "Allow once", tone: "ok" },
            { key: "A", label: ev.mcp ? "Always for this tool here" : "Always in this project" },
            { key: "d", label: "Deny", tone: "danger" },
          ];

  const answerApproval = (m: Extract<Modal, { type: "approval" }>, key: string) => {
    const { taskId, ev } = m;
    setModal(null);
    if (ev.kind === "plan") {
      if (key === "y") void ctx.client.approve(taskId, ev.approvalId, "allow_once");
      else if (key === "e") {
        setMode({ kind: "planEdit", taskId, ev });
        setEd(E.set(ev.plan ?? ""));
        return;
      } else {
        setMode({ kind: "reject", taskId, ev });
        setEd(E.empty);
        return;
      }
    } else {
      void ctx.client.approve(taskId, ev.approvalId, key === "a" ? "allow_once" : key === "A" ? "always" : "deny");
      if (key === "d") note(`Denied ${ev.tool}`);
    }
    nextApproval();
  };

  const mergeOptions: ChoiceOption[] = [
    { key: "m", label: "Merge", tone: "ok" },
    { key: "v", label: "View diff" },
    { key: "d", label: "Discard", tone: "danger" },
    { key: "k", label: "Keep for later" },
  ];

  /** After a task: the agent's suggested memories, as a checklist. Nothing is saved without Enter. */
  const offerMemories = () => {
    const all = proposalsRef.current;
    proposalsRef.current = [];
    const auto = all.filter((p) => p.autoSaved);
    if (auto.length) {
      note(`Added to project memory (inferred, check with /memory):\n${auto.map((p) => "  • " + itemLabel(p)).join("\n")}`, "star");
      setMemCount(memoryFor(ctx.cwd).active().length);
    }
    const items = all.filter((p) => !p.autoSaved);
    if (!items.length) return;
    setSelected(0);
    setModal({ type: "memory", items, checked: items.map(() => true) });
  };

  const saveMemories = (m: Extract<Modal, { type: "memory" }>) => {
    setModal(null);
    const chosen = m.items.filter((_, i) => m.checked[i]);
    if (!chosen.length) return note("Nothing saved to memory.");
    const store = memoryFor(ctx.cwd);
    let added = 0;
    for (const p of chosen) {
      try {
        const r = store.add({ category: p.category, text: p.text, status: "verified", source: "task", taskId: taskIdRef.current, replaces: p.replaces });
        if (r.entry) added++;
      } catch (e) {
        note((e as Error).message, "error");
      }
    }
    setMemCount(store.active().length);
    note(`✓ Remembered ${added} ${added === 1 ? "note" : "notes"} for this project (/memory to see them)`, "ok");
  };

  const answerMerge = async (m: Extract<Modal, { type: "merge" }>, key: string) => {
    try {
      if (key === "v") return commit({ kind: "diff", diff: (await ctx.client.diff(m.taskId)).diff });
      setModal(null);
      if (key === "m") {
        await ctx.client.merge(m.taskId);
        note(`✓ Merged ${m.branch} into your branch`, "ok");
      } else if (key === "d") {
        await ctx.client.discard(m.taskId);
        note("Discarded.");
      } else {
        setKept({ taskId: m.taskId, branch: m.branch, path: m.path });
        note(`Kept on ${m.branch}. Use /diff, /merge or /discard later.`);
      }
      setBranch(gitBranch(ctx.cwd));
      offerMemories();
    } catch (e) {
      note((e as Error).message, "error");
    }
  };

  const pickerRows = useMemo((): PickerRow[] => {
    if (modal?.type !== "picker") return [];
    const f = modal.filter.toLowerCase();
    const rows: PickerRow[] =
      modal.kind === "model"
        ? PROVIDERS.flatMap((p) => {
            const hasKey = !p.needsKey || !!ctx.keys.resolve(p.id);
            return p.models.map((m) => ({
              id: `${p.id}\u0000${m.id}`,
              label: m.id,
              detail: `${p.label}${m.note ? " · " + m.note : ""}${hasKey ? "" : " · no key"}`,
              current: choice.provider === p.id && choice.model === m.id,
            }));
          })
        : listSessions(ctx).map((s) => ({
            id: s.file,
            label: s.title || "(empty)",
            detail: `${new Date(s.mtime).toLocaleString()} · ${s.count} messages`,
            current: s.file === sessionRef.current.file,
          }));
    return rows.filter((r) => !f || `${r.label} ${r.detail}`.toLowerCase().includes(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, choice]);

  const choosePicked = (m: Extract<Modal, { type: "picker" }>) => {
    const row = pickerRows[selected];
    setModal(null);
    if (!row) return;
    if (m.kind === "model") {
      const [provider, model] = row.id.split("\u0000") as [ModelChoice["provider"], string];
      setChoice({ provider, model });
      ctx.config.save({ ...ctx.config.load(), provider, model });
      note(`Using ${modelLabel({ provider, model })} (${providerName(provider)}), saved as the default`, "ok");
    } else {
      sessionRef.current = loadSession(row.id);
      clearScreen([banner(), ...historyItems(sessionRef.current)]);
    }
  };

  // ---------- autocomplete ----------
  const acFor = (value: string) =>
    acHidden || mode.kind !== "normal" || !/^\/\S*$/.test(value) ? [] : COMMANDS.filter((c) => c.name.startsWith(value));
  const acMatches = useMemo(() => acFor(ed.value), [ed.value, acHidden, mode.kind]);
  useEffect(() => setAcIndex(0), [ed.value]);

  // ---------- keyboard ----------
  // The keyboard comes from `props.keys` (raw stdin chunks), not Ink's useInput: under Bun,
  // Ink stops receiving input after the first read. Chunks can hold several keys.
  const onKeyRef = useRef<(input: string, key: KeyFlags) => void>(() => {});
  onKeyRef.current = onKey;
  useEffect(
    () =>
      props.keys((chunk) => {
        for (const k of splitKeys(chunk)) onKeyRef.current(k.input, k.key);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function onKey(input: string, key: KeyFlags) {
    const acMatches = acFor(edRef.current.value);
    // Ctrl+C: stop, then clear, then quit on a second press.
    if (key.ctrl && input === "c") {
      const now = Date.now();
      if (busy) {
        cancelRef.current?.();
        setLabel("Stopping…");
      } else if (edRef.current.value) setEd(E.empty);
      else if (now - lastCtrlC.current < 2000) return quit(130);
      else setHint("Press Ctrl+C again to quit");
      lastCtrlC.current = now;
      return;
    }
    if (hint) setHint(null);

    // Pop-ups take the keyboard while open.
    if (modal?.type === "approval" || modal?.type === "merge") {
      const opts = modal.type === "approval" ? approvalOptions(modal.ev) : mergeOptions;
      const pick = (k: string) => (modal.type === "approval" ? answerApproval(modal, k) : void answerMerge(modal, k));
      if (key.leftArrow) return setSelected((s) => (s + opts.length - 1) % opts.length);
      if (key.rightArrow || key.tab) return setSelected((s) => (s + 1) % opts.length);
      if (key.return) return pick(opts[selected].key);
      if (key.escape && modal.type === "merge") return pick("k");
      const exact = opts.find((o) => o.key === input) ?? opts.find((o) => o.key.toLowerCase() === input.toLowerCase());
      if (exact) pick(exact.key);
      return;
    }
    if (modal?.type === "memory") {
      const n = modal.items.length;
      if (key.escape) {
        setModal(null);
        return note("Nothing saved to memory.");
      }
      if (key.upArrow) return setSelected((s) => (s + n - 1) % n);
      if (key.downArrow || key.tab) return setSelected((s) => (s + 1) % n);
      if (input === " ") {
        const checked = [...modal.checked];
        checked[selected] = !checked[selected];
        return setModal({ ...modal, checked });
      }
      if (input === "a") {
        const all = modal.checked.every(Boolean);
        return setModal({ ...modal, checked: modal.checked.map(() => !all) });
      }
      if (key.return) return saveMemories(modal);
      return;
    }
    if (modal?.type === "picker") {
      if (key.escape) return setModal(null);
      if (key.upArrow) return setSelected((s) => Math.max(0, s - 1));
      if (key.downArrow) return setSelected((s) => Math.min(pickerRows.length - 1, s + 1));
      if (key.return) return choosePicked(modal);
      if (key.backspace || key.delete) {
        setSelected(0);
        return setModal({ ...modal, filter: modal.filter.slice(0, -1) });
      }
      if (input && !key.ctrl && !key.meta) {
        setSelected(0);
        setModal({ ...modal, filter: modal.filter + input });
      }
      return;
    }

    // Esc: stop work, leave plan editing, or hide suggestions.
    if (key.escape) {
      if (mode.kind !== "normal") {
        setMode({ kind: "normal" });
        setEd(E.empty);
        setSelected(0);
        setModal({ type: "approval", taskId: mode.taskId, ev: mode.ev });
        return;
      }
      if (busy) {
        cancelRef.current?.();
        setLabel("Stopping…");
        return;
      }
      if (acMatches.length) return setAcHidden(true);
      return;
    }

    // Suggestions.
    if (acMatches.length) {
      if (key.upArrow) return setAcIndex((i) => (i + acMatches.length - 1) % acMatches.length);
      if (key.downArrow) return setAcIndex((i) => (i + 1) % acMatches.length);
      const pickCmd = acMatches[acIndex];
      if (key.tab || (key.return && edRef.current.value !== pickCmd.name)) {
        if (key.return && !pickCmd.args) {
          setEd(E.empty);
          void submit(pickCmd.name);
          return;
        }
        setEd(E.set(pickCmd.name + (pickCmd.args ? " " : "")));
        return;
      }
    }

    // New line: Ctrl+J, Alt/Shift+Enter.
    if ((key.ctrl && input === "j") || ((key.meta || key.shift) && key.return)) return setEd((e) => E.insert(e, "\n"));

    if (key.return) {
      const value = edRef.current.value;
      if (mode.kind === "planEdit") {
        setMode({ kind: "normal" });
        setEd(E.empty);
        void ctx.client.approve(mode.taskId, mode.ev.approvalId, "allow_once", { plan: value });
        note("Plan edited and approved");
        nextApproval();
        return;
      }
      if (mode.kind === "reject") {
        setMode({ kind: "normal" });
        setEd(E.empty);
        const reason = value.trim();
        void ctx.client.approve(mode.taskId, mode.ev.approvalId, "deny", reason ? { reason } : {});
        note(reason ? `Asked for a new plan: ${reason}` : "Plan rejected");
        nextApproval();
        return;
      }
      if (!value.trim()) return;
      setEd(E.empty);
      setAcHidden(false);
      if (busy === "chat") {
        // Interrupt and redirect: stop this reply, then send the new message.
        queuedRef.current = value;
        cancelRef.current?.();
        return;
      }
      if (busy === "task") {
        setEd(E.set(value));
        setHint("The agent is working. Press Esc to stop it, then send your message.");
        return;
      }
      void submit(value);
      return;
    }

    if (key.upArrow) {
      const moved = E.vertical(edRef.current, -1);
      if (moved) return setEd(moved);
      const h = history.current.prev(edRef.current.value);
      if (h != null) setEd(E.set(h));
      return;
    }
    if (key.downArrow) {
      const moved = E.vertical(edRef.current, 1);
      if (moved) return setEd(moved);
      const h = history.current.next();
      if (h != null) setEd(E.set(h));
      return;
    }
    if (key.leftArrow) return setEd(E.left);
    if (key.rightArrow) return setEd(E.right);
    if (key.backspace || key.delete) {
      setAcHidden(false);
      return setEd(key.meta ? E.deleteWordBack : E.backspace);
    }
    if (key.ctrl && input === "w") return setEd(E.deleteWordBack);
    if (key.ctrl && input === "u") return setEd(E.killToStart);
    if (key.ctrl && input === "a") return setEd(E.home);
    if (key.ctrl && input === "e") return setEd(E.end);
    if (key.ctrl && input === "d") {
      if (!edRef.current.value && !busy) quit(0);
      return;
    }
    if (key.ctrl || key.meta || key.tab) return;
    if (input) {
      setAcHidden(false);
      setEd((e) => E.insert(e, input));
    }
  }

  // ---------- view ----------
  const placeholder =
    mode.kind === "planEdit"
      ? "Edit the plan, then Enter to approve · Esc to go back"
      : mode.kind === "reject"
        ? "What should change? Enter with nothing to stop the task · Esc to go back"
        : busy === "chat"
          ? "Type to interrupt and redirect…"
          : busy === "task"
            ? "The agent is working · Esc to stop"
            : "Message vard, or / for commands";

  const state = modal?.type === "approval" || mode.kind !== "normal" ? "needs you" : busy ? (busy === "chat" ? "thinking" : "working") : "idle";

  return (
    <Box flexDirection="column">
      <Static key={epoch} items={items}>
        {(item) => <ItemView key={item.id} item={item} columns={columns} />}
      </Static>

      {live ? (
        <Box marginTop={1}>
          <Box width={2} flexShrink={0}>
            <Text color={C.cerulean}>✦</Text>
          </Box>
          <Box flexShrink={1} flexDirection="column">
            <Markdown text={live} />
          </Box>
        </Box>
      ) : null}
      {pendingTool ? <ItemView item={pendingTool} /> : null}
      {busy && !modal && mode.kind === "normal" ? <Spinner label={label} /> : null}

      {modal?.type === "approval" ? (
        <ChoiceModal
          title={
            modal.ev.kind === "plan" ? "Approve this plan?" : modal.ev.mcp ? `Allow ${modal.ev.mcp.serverName} to run ${modal.ev.mcp.tool}?` : `Allow ${modal.ev.tool}?`
          }
          options={approvalOptions(modal.ev)}
          selected={selected}
        >
          {modal.ev.kind === "plan" ? (
            <Text color={C.muted}>The plan is shown above. Approve it, edit it, or say what to change.</Text>
          ) : (
            <Box flexDirection="column">
              <Text color={C.ink}>
                {modal.ev.mcp ? JSON.stringify(modal.ev.input ?? {}).slice(0, 300) : describeToolInput(modal.ev.tool ?? "", modal.ev.input)}
              </Text>
              <Text color={modal.ev.mcp?.destructive ? C.danger : C.muted}>{modal.ev.mcp ? `MCP · ${modal.ev.mcp.access}` : modal.ev.reason}</Text>
            </Box>
          )}
        </ChoiceModal>
      ) : null}
      {modal?.type === "merge" ? (
        <ChoiceModal title={`Merge ${modal.branch}?`} options={mergeOptions} selected={selected} hint="Press a key, or ←→ and Enter · Esc keeps it" />
      ) : null}
      {modal?.type === "memory" ? (
        <Box flexDirection="column" borderStyle="round" borderColor={C.star} paddingX={1} marginTop={1}>
          <Text bold color={C.star}>
            Remember for next time?
          </Text>
          <Text color={C.muted}>Vard suggests saving these notes to this project's memory.</Text>
          {modal.items.map((it, i) => (
            <Text key={i} wrap="wrap">
              <Text color={i === selected ? C.star : C.line}>{i === selected ? "❯ " : "  "}</Text>
              <Text color={modal.checked[i] ? C.sage : C.muted}>{modal.checked[i] ? "[x] " : "[ ] "}</Text>
              <Text color={C.ink}>{itemLabel(it)}</Text>
              {it.replacesText ? <Text color={C.muted}>{`\n      updates: ${it.replacesText}`}</Text> : null}
            </Text>
          ))}
          <Text color={C.muted}>Space toggles · a all/none · Enter saves the checked notes · Esc skips</Text>
        </Box>
      ) : null}
      {modal?.type === "picker" ? (
        <Picker
          title={modal.kind === "model" ? "Choose a model" : "Resume a conversation"}
          rows={pickerRows}
          filter={modal.filter}
          selected={selected}
          empty={modal.kind === "session" ? "No saved conversations yet" : undefined}
        />
      ) : null}

      {acMatches.length ? (
        <Box flexDirection="column" marginTop={1} paddingX={1}>
          {acMatches.slice(0, 8).map((c, i) => (
            <Text key={c.name}>
              <Text color={i === acIndex ? C.star : C.ink} bold={i === acIndex}>
                {(i === acIndex ? "❯ " : "  ") + (c.name + (c.args ? " " + c.args : "")).padEnd(22)}
              </Text>
              <Text color={C.muted}>{c.desc}</Text>
            </Text>
          ))}
        </Box>
      ) : null}

      <Box
        marginTop={1}
        borderStyle="round"
        borderColor={mode.kind !== "normal" ? C.star : busy ? C.line : C.lineStrong}
        paddingX={1}
      >
        <Box width={2} flexShrink={0}>
          <Text color={C.star}>{mode.kind === "planEdit" ? "✎" : "›"}</Text>
        </Box>
        <Box flexShrink={1} flexGrow={1}>
          <EditorView ed={ed} placeholder={placeholder} active={!modal} />
        </Box>
      </Box>
      <StatusBar
        model={modelLabel(choice)}
        provider={providerName(choice.provider)}
        branch={branch}
        planFirst={planFirst}
        tokens={tokens}
        state={state}
        kept={kept?.branch ?? null}
        memory={memCount}
      />
      <Text color={hint ? C.star : C.muted}>
        {hint ??
          (columns >= 92
            ? "Enter send · Ctrl+J new line · / commands · ↑ history · Esc stop · Ctrl+C twice quit"
            : "Enter send · / commands · Esc stop · Ctrl+C×2 quit")}
      </Text>
    </Box>
  );
}

function EditorView({ ed, placeholder, active }: { ed: E.Ed; placeholder: string; active: boolean }) {
  if (!ed.value)
    return (
      <Text>
        {active ? <Text inverse> </Text> : null}
        <Text color={C.muted}>{placeholder}</Text>
      </Text>
    );
  const before = ed.value.slice(0, ed.cursor);
  const at = ed.value[ed.cursor];
  const after = ed.value.slice(ed.cursor + 1);
  return (
    <Text color={C.ink}>
      {before}
      {active ? <Text inverse>{at === undefined || at === "\n" ? " " : at}</Text> : at ?? ""}
      {at === "\n" ? "\n" : ""}
      {after}
    </Text>
  );
}

/** Starts the TUI and resolves with the exit code when it closes. */
export async function runTui(ctx: Ctx, opts: { continue?: boolean; model?: string; provider?: string }): Promise<number> {
  const { render } = await import("ink");
  const { PassThrough } = await import("node:stream");
  const stdin = process.stdin;
  // Ink gets an idle stand-in for stdin; the real keyboard is read here with "data" events.
  const fakeIn = Object.assign(new PassThrough(), { isTTY: true, setRawMode: () => fakeIn, ref: () => fakeIn, unref: () => fakeIn });
  const listeners = new Set<(c: string) => void>();
  const onData = (d: Buffer | string) => {
    const chunk = typeof d === "string" ? d : d.toString("utf8");
    for (const l of listeners) l(chunk);
  };
  const keys: KeySource = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  if (stdin.isTTY) stdin.setRawMode(true);
  // Bun's native stdin reader keeps delivering keys while Ink renders; Node-style "data"
  // listeners stall after the first chunk.
  const reader = Bun.stdin.stream().getReader();
  let reading = true;
  void (async () => {
    const dec = new TextDecoder();
    while (reading) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) break;
      if (value) onData(dec.decode(value, { stream: true }));
    }
  })();
  let code = 0;
  const app = render(<App ctx={ctx} keys={keys} {...opts} onExit={(c) => (code = c)} />, {
    exitOnCtrlC: false,
    stdin: fakeIn as unknown as NodeJS.ReadStream,
  });
  try {
    await app.waitUntilExit();
  } finally {
    reading = false;
    void reader.cancel().catch(() => {});
    if (stdin.isTTY) stdin.setRawMode(false);
  }
  return code;
}
