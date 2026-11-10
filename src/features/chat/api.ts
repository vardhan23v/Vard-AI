/**
 * Conversation storage in Firestore:
 *   users/{uid}/conversations/{conversationId}
 *   users/{uid}/conversations/{conversationId}/messages/{messageId}
 */
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db, nowIso, requireUid } from "@/lib/firebase";

export type Conversation = {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

const conversationsCol = () => collection(db, "users", requireUid(), "conversations");
const conversationDoc = (id: string) => doc(db, "users", requireUid(), "conversations", id);
const messagesCol = (conversationId: string) => collection(conversationDoc(conversationId), "messages");

export const conversationsQuery = () =>
  queryOptions({
    queryKey: ["conversations"],
    queryFn: async () => {
      const snap = await getDocs(query(conversationsCol(), orderBy("updated_at", "desc"), limit(200)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation).filter((c) => !c.archived);
      // Pinned first, then most recent.
      return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    },
  });

export const messagesQuery = (conversationId: string) =>
  queryOptions({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const snap = await getDocs(query(messagesCol(conversationId), orderBy("created_at", "asc")));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message);
    },
  });

export async function createConversation(input: { title: string; provider: string; model: string }) {
  const now = nowIso();
  const data = { ...input, pinned: false, archived: false, created_at: now, updated_at: now };
  const ref = await addDoc(conversationsCol(), data);
  return { id: ref.id, ...data } satisfies Conversation;
}

export async function addMessage(input: {
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
}): Promise<Message> {
  const { conversation_id, ...rest } = input;
  const now = nowIso();
  const data = {
    role: rest.role,
    content: rest.content,
    provider: rest.provider ?? null,
    model: rest.model ?? null,
    input_tokens: rest.input_tokens ?? null,
    output_tokens: rest.output_tokens ?? null,
    created_at: now,
  };
  const ref = doc(messagesCol(conversation_id));
  const batch = writeBatch(db);
  batch.set(ref, data);
  // A new message moves its chat to the top of the list.
  batch.update(conversationDoc(conversation_id), { updated_at: now });
  await batch.commit();
  return { id: ref.id, ...data };
}

export async function deleteMessagesAfter(conversationId: string, createdAt: string) {
  const snap = await getDocs(query(messagesCol(conversationId), where("created_at", ">=", createdAt)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

async function deleteConversation(id: string) {
  // Firestore doesn't delete subcollections with their parent.
  const msgs = await getDocs(messagesCol(id));
  for (let i = 0; i < msgs.docs.length; i += 450) {
    const batch = writeBatch(db);
    msgs.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(conversationDoc(id));
}

/** A short title from the first user message. */
export function titleFrom(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "New chat";
}

export function useConversationActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["conversations"] });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => updateDoc(conversationDoc(id), { title }),
    onSettled: refresh,
  });
  const togglePin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => updateDoc(conversationDoc(id), { pinned }),
    onSettled: refresh,
  });
  const remove = useMutation({ mutationFn: deleteConversation, onSettled: refresh });
  return { rename, togglePin, remove };
}
