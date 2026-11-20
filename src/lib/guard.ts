import { redirect } from "@tanstack/react-router";
import { auth } from "@/lib/firebase";
import { debugHangAuth, mark } from "@/lib/boot";

/** Thrown when restoring the session takes too long; the root error screen offers Retry. */
export class StartupTimeoutError extends Error {
  constructor() {
    super("Restoring your session is taking longer than usual.");
    this.name = "StartupTimeoutError";
  }
}

const AUTH_TIMEOUT_MS = 6000;

/**
 * `beforeLoad` guard: signed-out users go to /login and come back afterwards. The wait for the
 * saved session is bounded, so a stuck storage layer shows a screen instead of a blank window. A
 * timeout never sends you to sign-in: that would look as if the session were lost.
 */
export async function requireAuth({ location }: { location: { href: string } }) {
  const ready = debugHangAuth() ? new Promise<void>(() => {}) : auth.authStateReady();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), AUTH_TIMEOUT_MS);
  });
  const result = await Promise.race([ready.then(() => "ready" as const), timeout]);
  clearTimeout(timer);
  if (result === "timeout") throw new StartupTimeoutError();
  mark("auth-ready");
  if (!auth.currentUser) throw redirect({ to: "/login", search: { next: location.href } });
}
