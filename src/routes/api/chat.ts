import { createFileRoute } from "@tanstack/react-router";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GROQ_API_KEY;
        if (!key) return new Response("Missing GROQ_API_KEY", { status: 500 });

        let body: { messages?: ChatMessage[]; model?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : null;
        if (!messages || messages.length === 0) {
          return new Response("messages is required", { status: 400 });
        }

        const model = body.model || "llama-3.3-70b-versatile";
        const upstream = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              stream: true,
              messages: [
                {
                  role: "system",
                  content:
                    "You are Vard AI, a helpful, concise personal assistant. Use markdown when useful.",
                },
                ...messages,
              ],
            }),
            signal: request.signal,
          },
        );

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || `Groq error: ${upstream.status}`, {
            status: upstream.status,
          });
        }

        // Transform Groq's OpenAI-style SSE into a plain text token stream.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buf = "";

        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const { value, done } = await reader.read();
              if (done) {
                controller.close();
                return;
              }
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() ?? "";
              for (const raw of lines) {
                const line = raw.trim();
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try {
                  const evt = JSON.parse(data) as {
                    choices?: { delta?: { content?: string } }[];
                  };
                  const delta = evt.choices?.[0]?.delta?.content;
                  if (delta) controller.enqueue(encoder.encode(delta));
                } catch {
                  /* ignore */
                }
              }
            } catch (err) {
              controller.error(err);
            }
          },
          cancel(reason) {
            reader.cancel(reason).catch(() => {});
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});