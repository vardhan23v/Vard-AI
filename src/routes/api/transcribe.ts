import { createFileRoute } from "@tanstack/react-router";
import { requireAuthedRequest } from "@/lib/require-auth.server";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await requireAuthedRequest(request);
        if (unauth) return unauth;
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob)) {
          return new Response("file is required", { status: 400 });
        }
        if (file.size < 2048) {
          return new Response("Recording too short — please try again.", { status: 400 });
        }
        if (file.size > 24 * 1024 * 1024) {
          return new Response("Recording too large (max 24MB).", { status: 413 });
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, "recording.wav");
        upstream.append("stream", "true");

        const res = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: upstream,
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          return new Response(text || `Transcription failed: ${res.status}`, {
            status: res.status,
          });
        }
        return new Response(res.body, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    },
  },
});