/**
 * Firebase: sign-in (email + Google) and Firestore sync.
 * Web config values are public identifiers, injected at build time from .env.
 * Data lives under users/{uid}/…; firestore.rules limits each user to their own.
 */
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
} from "firebase/firestore";
import { bootLog, mark, storage } from "@/lib/boot";

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
  console.error(
    `[firebase] Missing config: ${missing.join(", ")}. Copy .env.example to .env and fill it in.`,
  );
}

export const firebaseApp = initializeApp(config);

// The session is kept in local storage, which can't hang the way WebKit's IndexedDB can after a
// cold start (that left the window blank). IndexedDB comes second only so a session saved there
// by an earlier version moves over; it's skipped when the startup probe found IndexedDB stuck.
let authInstance: Auth;
try {
  authInstance = initializeAuth(firebaseApp, {
    persistence: storage.indexedDB
      ? [browserLocalPersistence, indexedDBLocalPersistence]
      : [browserLocalPersistence],
  });
} catch {
  authInstance = getAuth(firebaseApp); // Already initialised (hot reload).
}
export const auth = authInstance;

// Local cache: chats load instantly and work offline, then sync. In memory only if IndexedDB
// didn't answer at startup.
export const db = initializeFirestore(firebaseApp, {
  localCache: storage.indexedDB
    ? persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) })
    : memoryLocalCache(),
});
if (!storage.indexedDB) bootLog("firestore: in-memory cache this session");
mark("firebase-init");

export function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You're signed out. Sign in again to continue.");
  return uid;
}

export const nowIso = () => new Date().toISOString();
