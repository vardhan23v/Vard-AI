/**
 * Backoff for transient provider failures (rate limits, overload, 5xx).
 *
 * The AI SDK's built-in retries are short (seconds), so free-tier rate limits used to end a task.
 * The harness turns SDK retries off and waits itself: it honours `retry-after` / `retry-after-ms`
 * when the provider sends them, otherwise uses capped exponential backoff with jitter. Waits are
 * cancellable and reported to the UI as `retry` events.
 */
import { APICallError } from "@ai-sdk/provider";

export interface RetryOptions {
  /** Total attempts, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryOptions = { maxAttempts: 8, baseDelayMs: 2_000, maxDelayMs: 60_000 };

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** The APICallError behind an SDK error, unwrapping RetryError. */
function apiError(e: unknown): APICallError | undefined {
  const inner = (e as any)?.lastError ?? e;
  return APICallError.isInstance(inner) ? inner : undefined;
}

export function isRetryable(e: unknown): boolean {
  const err = apiError(e);
  if (!err) return false;
  return err.statusCode != null ? RETRYABLE_STATUS.has(err.statusCode) : err.isRetryable;
}

/** Delay the provider asked for, in ms, if any. */
export function retryAfterMs(e: unknown, now = Date.now()): number | undefined {
  const h = apiError(e)?.responseHeaders;
  if (!h) return undefined;
  const get = (k: string) => Object.entries(h).find(([key]) => key.toLowerCase() === k)?.[1];
  const ms = Number(get("retry-after-ms"));
  if (Number.isFinite(ms) && ms >= 0) return ms;
  const ra = get("retry-after");
  if (ra == null) return undefined;
  const secs = Number(ra);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(ra);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** Delay before attempt `attempt + 1` (attempt is 1-based), or undefined to give up. */
export function nextDelay(e: unknown, attempt: number, opts: RetryOptions, rand = Math.random): number | undefined {
  if (attempt >= opts.maxAttempts || !isRetryable(e)) return undefined;
  const asked = retryAfterMs(e);
  if (asked != null) return Math.min(asked, opts.maxDelayMs);
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exp * (0.75 + rand() * 0.25));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal!.reason ?? new Error("aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
}

/**
 * Run `fn` until it succeeds, retrying transient provider errors. `fn` receives a flag setter;
 * once it reports output was emitted, the attempt is not retried (the UI already showed it).
 */
export async function withRetry<T>(
  fn: (markEmitted: () => void) => Promise<T>,
  opts: RetryOptions,
  onRetry: (info: RetryInfo) => void,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let emitted = false;
    try {
      return await fn(() => (emitted = true));
    } catch (e) {
      if (signal?.aborted || emitted) throw e;
      const delayMs = nextDelay(e, attempt, opts);
      if (delayMs == null) throw e;
      onRetry({ attempt, maxAttempts: opts.maxAttempts, delayMs, error: e });
      await sleep(delayMs, signal);
    }
  }
}
