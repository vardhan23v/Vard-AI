/**
 * "Continue with Google" through Firebase Auth.
 *
 * Desktop: the Rust shell runs Google's installed-app OAuth flow in the system
 * browser (src-tauri/src/oauth.rs) and returns an ID token, which signs in to
 * Firebase. Browser preview: Firebase's own popup.
 *
 * The desktop OAuth client must be in the same Google Cloud project as Firebase.
 */
import { invoke } from "@tauri-apps/api/core";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";
import { isTauri } from "./agent-client";

export async function signInWithGoogle(): Promise<void> {
  if (!isTauri()) {
    await signInWithPopup(auth, new GoogleAuthProvider());
    return;
  }
  const idToken = await invoke<string>("google_sign_in", {
    clientId: import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID ?? "",
    clientSecret: import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET ?? "",
  });
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

export async function signInWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  if (name) await updateProfile(user, { displayName: name });
  await sendEmailVerification(user).catch(() => undefined);
}

/** Firebase error codes → plain sentences. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "That email and password don't match an account.",
    "auth/invalid-email": "That doesn't look like an email address.",
    "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/network-request-failed": "Can't reach the sign-in service. Check your connection.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/operation-not-allowed": "This sign-in method isn't enabled for the project yet.",
    "auth/configuration-not-found":
      "Sign-in isn't set up for this Firebase project yet. Enable Authentication and its Email and Google providers in the Firebase console.",
    "auth/invalid-api-key": "Firebase isn't configured. Check VITE_FIREBASE_* in .env.",
  };
  if (map[code]) return map[code];
  return err instanceof Error ? err.message : String(err);
}
