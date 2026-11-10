/**
 * Firebase: sign-in (email + Google) and Firestore sync.
 * Web config values are public identifiers, injected at build time from .env.
 * Data lives under users/{uid}/…; firestore.rules limits each user to their own.
 */
import { initializeApp } from "firebase/app";
import { getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from "firebase/firestore";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`[firebase] Missing config: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`);
}

export const firebaseApp = initializeApp(config);

// IndexedDB persistence keeps you signed in across app restarts.
let authInstance: Auth;
try {
  authInstance = initializeAuth(firebaseApp, { persistence: indexedDBLocalPersistence });
} catch {
  authInstance = getAuth(firebaseApp); // Already initialised (hot reload).
}
export const auth = authInstance;

// Local cache: chats load instantly and work offline, then sync.
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) }),
});

export function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You're signed out. Sign in again to continue.");
  return uid;
}

export const nowIso = () => new Date().toISOString();
