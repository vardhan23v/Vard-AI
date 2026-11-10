import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { APICallError } from "@ai-sdk/provider";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { AgentLoop } from "../src/loop";
import { MemoryRulesStore, Policy } from "../src/policy";
import type { Event } from "../src/protocol";
import { isRetryable, nextDelay, retryAfterMs, type RetryOptions } from "../src/retry";
import { Server } from "../src/server";
import { tmpDir } from "./helpers";

const FAST: RetryOptions = { maxAttempts: 4, baseDelayMs: 5, maxDelayMs: 50 };

function apiErr(status: number, headers: Record<string, string> = {}) {
  return new APICallError({
    message: "Provider returned error",
    url: "https://example.test/v1/chat/completions",
    requestBodyValues: {},
    statusCode: status,
    responseHeaders: headers,
    responseBody: JSON.stringify({ error: { message: "x", metadata: { raw: `upstream said ${status}` } } }),
  });
}

const okStream = (text: string) => ({
  stream: convertArrayToReadableStream([
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    {
      type: "finish",
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 2, text: 2, reasoning: 0 },
      },
      finishReason: { unified: "stop", raw: undefined },
    },
  ] as any) as ReadableStream<any>,
});

/** Fails with each given error in turn, then answers `text`. */
function flakyModel(errors: unknown[], text = "ok") {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      const e = errors[calls++];
      if (e) throw e;
      return okStream(text);
    },
  });
  return { model, calls: () => calls };
}

function loopFor(model: MockLanguageModelV4, extra: Partial<ConstructorParameters<typeof AgentLoop>[0]> = {}) {
  const root = tmpDir();
  const events: any[] = [];
  const loop = new AgentLoop({
    taskId: "r",
    prompt: "hi",
    model,
    projectRoot: root,
    workRoot: root,
    policy: new Policy({ projectRoot: root, workRoot: root, store: new MemoryRulesStore() }),
    emit: (e) => events.push(e),
    requestApproval: async () => ({ decision: "allow_once" }),
    planFirst: false,
    retry: FAST,
    ...extra,
  });
  return { loop, events };
}

describe("backoff policy", () => {
  test("retries rate limits, overload and 5xx; not auth or bad requests", () => {
    for (const s of [429, 500, 502, 503, 504, 529]) expect(isRetryable(apiErr(s))).toBe(true);
    for (const s of [400, 401, 403, 404]) expect(isRetryable(apiErr(s))).toBe(false);
    expect(isRetryable(new Error("boom"))).toBe(false);
  });

  test("honours retry-after (seconds, ms, HTTP date), capped at maxDelayMs", () => {
    expect(retryAfterMs(apiErr(429, { "retry-after": "3" }))).toBe(3000);
    expect(retryAfterMs(apiErr(429, { "Retry-After-Ms": "250" }))).toBe(250);
    const now = Date.parse("2026-11-10T00:00:00Z");
    expect(retryAfterMs(apiErr(429, { "retry-after": "Tue, 10 Nov 2026 00:00:07 GMT" }), now)).toBe(7000);
    const opts = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 60_000 };
    expect(nextDelay(apiErr(429, { "retry-after": "5" }), 1, opts)).toBe(5000);
    expect(nextDelay(apiErr(429, { "retry-after": "600" }), 1, opts)).toBe(60_000);
  });

  test("exponential backoff with jitter, then gives up", () => {
    const opts = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 3000 };
    const e = apiErr(429);
    expect(nextDelay(e, 1, opts, () => 1)).toBe(1000);
    expect(nextDelay(e, 2, opts, () => 1)).toBe(2000);
    expect(nextDelay(e, 3, opts, () => 1)).toBe(3000); // capped
    expect(nextDelay(e, 3, opts, () => 0)).toBe(2250); // jitter: 75–100%
    expect(nextDelay(e, 4, opts)).toBeUndefined(); // out of attempts
    expect(nextDelay(apiErr(401), 1, opts)).toBeUndefined();
  });
});

describe("loop backoff", () => {
  test("a rate-limited step waits and resumes instead of blocking", async () => {
    const m = flakyModel([apiErr(429), apiErr(503)], "all good");
    const { loop, events } = loopFor(m.model);
    const r = await loop.run();
    expect(r.status).toBe("done");
    expect(r.summary).toBe("all good");
    expect(r.steps).toBe(1); // retries don't count as steps
    expect(m.calls()).toBe(3);
    const retries = events.filter((e) => e.type === "retry");
    expect(retries.map((e) => e.attempt)).toEqual([1, 2]);
    expect(retries[0].message).toContain("HTTP 429");
    expect(retries[0].message).toContain("upstream said 429");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  test("blocks once attempts run out", async () => {
    const m = flakyModel([apiErr(429), apiErr(429), apiErr(429), apiErr(429), apiErr(429)]);
    const { loop, events } = loopFor(m.model);
    const r = await loop.run();
    expect(r.status).toBe("blocked");
    expect(r.reason).toContain("HTTP 429");
    expect(m.calls()).toBe(FAST.maxAttempts);
    expect(events.filter((e) => e.type === "retry")).toHaveLength(FAST.maxAttempts - 1);
  });

  test("does not retry non-transient errors", async () => {
    const m = flakyModel([apiErr(401)]);
    const r = await loopFor(m.model).loop.run();
    expect(r.status).toBe("blocked");
    expect(m.calls()).toBe(1);
  });

  test("cancel during a backoff wait ends the task promptly", async () => {
    const abort = new AbortController();
    const m = flakyModel([apiErr(429, { "retry-after": "30" })]);
    const { loop, events } = loopFor(m.model, {
      signal: abort.signal,
      retry: { maxAttempts: 3, baseDelayMs: 30_000, maxDelayMs: 30_000 },
      emit: (e) => {
        events.push(e);
        if (e.type === "retry") setTimeout(() => abort.abort(), 5);
      },
    });
    const started = Date.now();
    const r = await loop.run();
    expect(r.status).toBe("cancelled");
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

test("chat.send retries rate limits too", async () => {
  const m = flakyModel([apiErr(429)], "pong");
  const events: Event[] = [];
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const server = new Server({
    retry: FAST,
    traceDir: tmpDir(),
    modelFactory: () => m.model,
    write: (e) => {
      events.push(e);
      if (e.type === "done" || e.type === "error") done();
    },
  });
  await server.handle({
    id: "c1",
    type: "chat.send",
    provider: { provider: "openai-compatible", model: "m:free", baseUrl: "https://example.test/v1" },
    messages: [{ role: "user", content: "ping" }],
  });
  await finished;
  expect(events.map((e) => e.type)).toEqual(["retry", "token", "usage", "done"]);
  expect((events.at(-1) as any).summary).toBe("pong");
});
