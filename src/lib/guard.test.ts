import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";

const auth = vi.hoisted(() => ({
  authStateReady: (() => Promise.resolve()) as () => Promise<void>,
  currentUser: null as null | { uid: string },
}));
vi.mock("@/lib/firebase", () => ({ auth }));

import { requireAuth, StartupTimeoutError } from "./guard";

const location = { href: "/projects/abc?tab=tasks" };

describe("requireAuth", () => {
  beforeEach(() => {
    auth.authStateReady = () => Promise.resolve();
    auth.currentUser = null;
  });
  afterEach(() => vi.useRealTimers());

  it("throws StartupTimeoutError when the saved session never loads", async () => {
    vi.useFakeTimers();
    auth.authStateReady = () => new Promise<void>(() => {});
    const result = requireAuth({ location });
    const check = expect(result).rejects.toBeInstanceOf(StartupTimeoutError);
    await vi.advanceTimersByTimeAsync(6000);
    await check;
  });

  it("does not time out before 6 s", async () => {
    vi.useFakeTimers();
    let ready!: () => void;
    auth.authStateReady = () => new Promise<void>((r) => (ready = r));
    auth.currentUser = { uid: "u1" };
    const result = requireAuth({ location });
    await vi.advanceTimersByTimeAsync(5900);
    ready();
    await expect(result).resolves.toBeUndefined();
  });

  it("redirects to /login with the current location when signed out", async () => {
    const err = await requireAuth({ location }).catch((e: unknown) => e);
    expect(isRedirect(err)).toBe(true);
    const opts = (err as Response & { options: { to: string; search: unknown } }).options;
    expect(opts.to).toBe("/login");
    expect(opts.search).toEqual({ next: location.href });
  });

  it("resolves when signed in", async () => {
    auth.currentUser = { uid: "u1" };
    await expect(requireAuth({ location })).resolves.toBeUndefined();
  });
});
