import { useCallback, useEffect, useRef, useState } from "react";
import { onAgentEvent, send, type AgentEvent } from "@/lib/agent-client";
import { providerConfig, type ModelChoice } from "@/lib/models";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type StreamResult = {
  text: string;
  status: "done" | "cancelled" | "error";
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

/**
 * Streams one assistant reply from the sidecar (`chat.send`).
 * Tokens arrive as `token` events; the stream ends on `done` or `error`.
 */
export function useChatStream() {
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState("");
  const active = useRef<{ id: string; resolve: (r: StreamResult) => void; text: string } | null>(null);

  useEffect(
    () =>
      onAgentEvent((e: AgentEvent) => {
        const cur = active.current;
        if (!cur || e.id !== cur.id) return;
        if (e.type === "token") {
          cur.text += e.text;
          setText(cur.text);
        } else if (e.type === "usage") {
          // Final totals arrive with `done`; nothing to do per step.
        } else if (e.type === "done") {
          finish({
            text: cur.text,
            status: e.status === "cancelled" ? "cancelled" : "done",
            usage: e.usage,
          });
        } else if (e.type === "error") {
          finish({ text: cur.text, status: "error", error: e.message });
        }
      }),
    [],
  );

  function finish(r: StreamResult) {
    const cur = active.current;
    active.current = null;
    setStreaming(false);
    cur?.resolve(r);
  }

  const start = useCallback(
    (choice: ModelChoice, messages: ChatTurn[], system?: string) =>
      new Promise<StreamResult>((resolve) => {
        if (active.current) {
          resolve({ text: "", status: "error", error: "A reply is already streaming." });
          return;
        }
        const id = `chat-${crypto.randomUUID()}`;
        active.current = { id, resolve, text: "" };
        setText("");
        setStreaming(true);
        send({ type: "chat.send", provider: providerConfig(choice), messages, system }, id).catch((err: unknown) =>
          finish({ text: "", status: "error", error: err instanceof Error ? err.message : String(err) }),
        );
      }),
    [],
  );

  const stop = useCallback(() => {
    const cur = active.current;
    if (!cur) return;
    void send({ type: "task.cancel", taskId: cur.id });
    // If the sidecar never answers the cancel, release the UI anyway.
    setTimeout(() => {
      if (active.current?.id === cur.id) finish({ text: cur.text, status: "cancelled" });
    }, 3000);
  }, []);

  return { streaming, text, start, stop };
}
