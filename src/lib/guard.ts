import { redirect } from "@tanstack/react-router";
import { auth } from "@/lib/firebase";

/** `beforeLoad` guard: signed-out users go to /login and come back afterwards. */
export async function requireAuth({ location }: { location: { href: string } }) {
  await auth.authStateReady();
  if (!auth.currentUser) throw redirect({ to: "/login", search: { next: location.href } });
}
