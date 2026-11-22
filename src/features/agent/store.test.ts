import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AgentEvent } from "@/lib/agent-client";

const bus = vi.hoisted(() => ({ handler: null as null | ((e: AgentEvent) => void) }));
vi.mock("@/lib/agent-client", () => ({
  onAgentEvent: (h: (e: AgentEvent) => void) => {
    bus.handler = h;
    return () => {};
  },
  send: vi.fn(() => Promise.resolve("id")),
}));
vi.mock("./projects", () => ({ updateTask: vi.fn(() => Promise.resolve()) }));
vi.mock("@/features/browser/useBrowser", () => ({ startBrowserStore: vi.fn() }));

import { startTaskStore, useTask } from "./store";

type Extra = Record<string, unknown>;
const ev = (taskId: string, type: string, extra: Extra = {}) =>
  ({ id: "r-1", ts: 0, taskId, type, ...extra }) as unknown as AgentEvent;
const retry = (taskId: string, extra: Extra = {}) =>
  ev(taskId, "retry", { attempt: 1, maxAttempts: 5, delayMs: 3000, message: "429", ...extra });

function watch(taskId: string) {
  return renderHook(() => useTask(taskId));
}
function emit(e: AgentEvent) {
  act(() => bus.handler!(e));
}

describe("task store: retry notices", () => {
  beforeAll(() => startTaskStore());

  it("sets the retry notice on a retry event and clears it on the next event", () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    const { result } = watch("solo");
    emit(retry("solo"));
    expect(result.current?.retry).toEqual({
      attempt: 1,
      maxAttempts: 5,
      until: 13_000,
      message: "429",
    });

    emit(ev("solo", "token", { text: "going again" }));
    expect(result.current?.retry).toBeUndefined();
    expect(result.current?.timeline.at(-1)).toMatchObject({ kind: "text", text: "going again" });
  });

  it("keys team-agent retries by agentId and clears only that agent's", () => {
    const { result } = watch("team");
    emit(retry("team", { agentId: "a1", seq: 1 }));
    emit(retry("team", { agentId: "a2", seq: 2, attempt: 2 }));

    const retries = result.current?.team?.retries ?? {};
    expect(Object.keys(retries).sort()).toEqual(["a1", "a2"]);
    expect(retries.a2?.attempt).toBe(2);
    expect(result.current?.retry).toBeUndefined(); // not on the task itself

    emit(ev("team", "token", { agentId: "a1", seq: 3, text: "hi" }));
    expect(Object.keys(result.current?.team?.retries ?? {})).toEqual(["a2"]);
    expect(result.current?.team?.timelines.a1?.at(-1)).toMatchObject({ kind: "text", text: "hi" });
  });

  it("ignores a duplicate (already-seen seq) team retry", () => {
    const { result } = watch("dup");
    emit(retry("dup", { agentId: "a1", seq: 1 }));
    emit(ev("dup", "token", { agentId: "a1", seq: 2, text: "x" }));
    expect(result.current?.team?.retries?.a1).toBeUndefined();

    emit(retry("dup", { agentId: "a1", seq: 1 })); // replayed after a reconnect
    expect(result.current?.team?.retries?.a1).toBeUndefined();
  });
});
