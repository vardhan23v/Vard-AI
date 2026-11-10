import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Check, Copy, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { useChatStream, type ChatTurn } from "./useChatStream";
import {
  addMessage,
  createConversation,
  deleteMessagesAfter,
  messagesQuery,
  titleFrom,
  type Message,
} from "./api";
import { StarField } from "@/components/StarField";
import { Skeleton } from "@/components/ui/skeleton";
import { useModelChoice } from "@/lib/models";
import { isTauri } from "@/lib/agent-client";

const SYSTEM_PROMPT =
  "You are Vard, a helpful assistant in a macOS desktop app. Answer clearly and concisely. Use Markdown, and fenced code blocks with a language tag for code.";

const toTurns = (msgs: Message[]): ChatTurn[] =>
  msgs.filter((m) => m.role !== "system").map((m) => ({ role: m.role as ChatTurn["role"], content: m.content }));

export function NewChat() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [choice] = useModelChoice();
  const [busy, setBusy] = useState(false);

  const start = async (text: string) => {
    setBusy(true);
    try {
      const conv = await createConversation({ title: titleFrom(text), provider: choice.provider, model: choice.model });
      await addMessage({ conversation_id: conv.id, role: "user", content: text });
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      // The thread view generates the reply for a trailing user message.
      await navigate({ to: "/chat/$conversationId", params: { conversationId: conv.id }, search: { reply: true } });
    } catch (err) {
      toast.error("Couldn't start the chat", { description: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-4">
      <StarField />
      <div className="relative w-full max-w-2xl">
        <h1 className="mb-6 text-center text-3xl text-foreground">What are we making tonight?</h1>
        <Composer onSend={start} disabled={busy} placeholder="Ask anything" />
        {!isTauri() && <DesktopOnlyNote />}
      </div>
    </div>
  );
}

export function ChatThread({ conversationId, reply }: { conversationId: string; reply?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [choice] = useModelChoice();
  const { data: messages, isLoading, error, refetch } = useQuery(messagesQuery(conversationId));
  const stream = useChatStream();
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const autoReplied = useRef(false);

  const key = messagesQuery(conversationId).queryKey;

  const generate = async (history: ChatTurn[]) => {
    setFailure(null);
    const result = await stream.start(choice, history, SYSTEM_PROMPT);
    if (result.text) {
      const saved = await addMessage({
        conversation_id: conversationId,
        role: "assistant",
        content: result.text,
        provider: choice.provider,
        model: choice.model,
        input_tokens: result.usage?.inputTokens,
        output_tokens: result.usage?.outputTokens,
      }).catch((err: unknown) => {
        toast.error("Reply not saved", { description: err instanceof Error ? err.message : String(err) });
        return null;
      });
      if (saved) qc.setQueryData<Message[]>(key, (old) => [...(old ?? []), saved]);
    }
    if (result.status === "error") setFailure(result.error ?? "The model returned an error.");
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  // Reply to a trailing user message once (new chats arrive with ?reply).
  useEffect(() => {
    if (!reply || autoReplied.current || !messages?.length) return;
    autoReplied.current = true;
    void navigate({ to: ".", search: {}, replace: true });
    if (messages[messages.length - 1].role === "user") void generate(toTurns(messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reply, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, stream.text]);

  const send = async (text: string) => {
    try {
      if (editing) {
        await deleteMessagesAfter(conversationId, editing.created_at);
        setEditing(null);
      }
      const saved = await addMessage({ conversation_id: conversationId, role: "user", content: text });
      const base = editing ? (messages ?? []).filter((m) => m.created_at < editing.created_at) : (messages ?? []);
      const next = [...base, saved];
      qc.setQueryData<Message[]>(key, next);
      await generate(toTurns(next));
    } catch (err) {
      toast.error("Message not sent", { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const regenerate = async () => {
    const msgs = messages ?? [];
    const last = msgs[msgs.length - 1];
    let history = msgs;
    if (last?.role === "assistant") {
      await deleteMessagesAfter(conversationId, last.created_at);
      history = msgs.slice(0, -1);
      qc.setQueryData<Message[]>(key, history);
    }
    await generate(toTurns(history));
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10" aria-busy>
        <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
        <Skeleton className="h-24 w-4/5" />
        <Skeleton className="ml-auto h-10 w-1/3 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm text-muted-foreground">Couldn't load this chat. {error.message}</p>
        <button onClick={() => refetch()} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">
          Try again
        </button>
      </div>
    );
  }

  const msgs = messages ?? [];
  const lastIsAssistant = msgs[msgs.length - 1]?.role === "assistant";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <ol className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8" aria-live="polite" aria-busy={stream.streaming}>
          {msgs.map((m, i) => (
            <MessageRow
              key={m.id}
              message={m}
              isLast={i === msgs.length - 1}
              onEdit={m.role === "user" && !stream.streaming ? () => setEditing(m) : undefined}
              onRegenerate={m.role === "assistant" && i === msgs.length - 1 && !stream.streaming ? regenerate : undefined}
            />
          ))}
          {stream.streaming && (
            <li>
              {stream.text ? (
                <Markdown text={stream.text} />
              ) : (
                <span className="inline-flex gap-1 py-2" aria-label="Thinking">
                  <Dot /> <Dot d="150ms" /> <Dot d="300ms" />
                </span>
              )}
            </li>
          )}
          {failure && (
            <li className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-foreground">{failure}</p>
                <button onClick={regenerate} className="mt-2 text-sm text-primary underline underline-offset-2">
                  Retry
                </button>
              </div>
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 pb-5">
        {editing && (
          <div className="mb-2 flex items-center justify-between rounded-md bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
            Editing a message. Sending replaces it and everything after it.
            <button className="text-foreground hover:underline" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        )}
        <Composer
          key={editing?.id ?? "new"}
          initial={editing?.content}
          onSend={send}
          onStop={stream.stop}
          streaming={stream.streaming}
          placeholder={lastIsAssistant ? "Reply to Vard" : "Message Vard"}
        />
        {!isTauri() && <DesktopOnlyNote />}
      </div>
    </div>
  );
}

function MessageRow({
  message,
  isLast,
  onEdit,
  onRegenerate,
}: {
  message: Message;
  isLast: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.role === "user") {
    return (
      <li className="group flex flex-col items-end gap-1">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-2.5 text-[15px] leading-6">
          {message.content}
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex min-h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Pencil className="size-3" /> Edit
          </button>
        )}
      </li>
    );
  }

  return (
    <li className="group">
      <Markdown text={message.content} />
      <div
        className={`mt-1 flex items-center gap-1 text-xs text-muted-foreground ${isLast ? "" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"}`}
      >
        <button onClick={copy} className="inline-flex min-h-7 items-center gap-1 rounded px-1.5 hover:bg-accent hover:text-foreground">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? "Copied" : "Copy"}
        </button>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="inline-flex min-h-7 items-center gap-1 rounded px-1.5 hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="size-3" /> Regenerate
          </button>
        )}
        {message.model && <span className="ml-2 truncate">{message.model}</span>}
      </div>
    </li>
  );
}

function Dot({ d = "0ms" }: { d?: string }) {
  return <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: d }} />;
}

function DesktopOnlyNote() {
  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      Preview mode: replies need the Vard AI desktop app.
    </p>
  );
}
