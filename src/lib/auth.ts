import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

/** Current user; `undefined` while the saved session is being restored. */
export function useUser() {
  const [user, setUser] = useState<User | null | undefined>(auth.currentUser ?? undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
