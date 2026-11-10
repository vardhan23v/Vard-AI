import { describe, expect, test } from "bun:test";
import { Event, parseRequest } from "../src/protocol";

describe("protocol", () => {
  test("parses ping", () => {
    const r = parseRequest('{"id":"1","type":"ping"}');
    expect(r).toEqual({ ok: true, request: { id: "1", type: "ping" } });
  });

  test("task.start applies defaults", () => {
    const r = parseRequest(
      JSON.stringify({
        id: "r1",
        type: "task.start",
        projectRoot: "/tmp/p",
        prompt: "fix it",
        provider: { provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "k" },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.request.type === "task.start") {
      expect(r.request.planFirst).toBe(true);
      expect(r.request.useWorktree).toBe(true);
    }
  });

  test("task.approve requires a valid decision", () => {
    const ok = parseRequest('{"id":"2","type":"task.approve","taskId":"t","approvalId":"a","decision":"always"}');
    expect(ok.ok).toBe(true);
    const bad = parseRequest('{"id":"3","type":"task.approve","taskId":"t","approvalId":"a","decision":"maybe"}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.id).toBe("3");
      expect(bad.message).toContain("decision");
    }
  });

  test("rejects invalid JSON, unknown types and missing ids", () => {
    expect(parseRequest("{nope").ok).toBe(false);
    expect(parseRequest('{"id":"1","type":"launch.missiles"}').ok).toBe(false);
    expect(parseRequest('{"type":"ping"}').ok).toBe(false);
  });

  test("rejects unknown providers and unsafe task ids", () => {
    const base = { id: "1", type: "task.start", projectRoot: "/p", prompt: "x" };
    expect(parseRequest(JSON.stringify({ ...base, provider: { provider: "acme", model: "m" } })).ok).toBe(false);
    expect(
      parseRequest(JSON.stringify({ ...base, taskId: "../x", provider: { provider: "ollama", model: "m" } })).ok,
    ).toBe(false);
  });

  test("event schema validates events", () => {
    expect(Event.safeParse({ type: "token", id: "1", ts: 1, text: "hi" }).success).toBe(true);
    expect(Event.safeParse({ type: "done", id: "1", taskId: "t", ts: 1, status: "done", summary: "" }).success).toBe(
      true,
    );
    expect(Event.safeParse({ type: "done", id: "1", ts: 1, status: "maybe", summary: "" }).success).toBe(false);
  });
});
