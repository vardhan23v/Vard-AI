// Browser-only voice capture that encodes PCM to a complete WAV blob and
// streams the transcript back from /api/transcribe (SSE).
import { useCallback, useRef, useState } from "react";

type Status = "idle" | "recording" | "transcribing" | "error";

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  // downsample to 16 kHz mono 16-bit PCM
  const target = 16000;
  const ratio = sampleRate / target;
  const totalIn = chunks.reduce((n, c) => n + c.length, 0);
  const totalOut = Math.floor(totalIn / ratio);
  const flat = new Float32Array(totalIn);
  let o = 0;
  for (const c of chunks) { flat.set(c, o); o += c.length; }
  const out = new Int16Array(totalOut);
  for (let i = 0; i < totalOut; i++) {
    const s = Math.max(-1, Math.min(1, flat[Math.floor(i * ratio)]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const write = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, target, true);
  view.setUint32(28, target * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, out.length * 2, true);
  new Int16Array(buffer, 44).set(out);
  return new Blob([buffer], { type: "audio/wav" });
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    src: MediaStreamAudioSourceNode;
    node: ScriptProcessorNode;
    chunks: Float32Array[];
  } | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node);
      node.connect(ctx.destination);
      stateRef.current = { stream, ctx, src, node, chunks };
      setStatus("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone access denied");
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    stateRef.current = null;
    s.stream.getTracks().forEach((t) => t.stop());
    s.node.disconnect();
    s.src.disconnect();
    const blob = encodeWav(s.chunks, s.ctx.sampleRate);
    await s.ctx.close();

    if (blob.size < 2048) {
      setStatus("idle");
      setError("That was too short — please try again.");
      return;
    }

    setStatus("transcribing");
    try {
      const fd = new FormData();
      fd.append("file", blob, "recording.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data) as { type?: string; delta?: string; text?: string };
            if (evt.type === "transcript.text.delta" && evt.delta) {
              full += evt.delta;
              onTranscript(full);
            } else if (evt.type === "transcript.text.done" && evt.text) {
              full = evt.text;
              onTranscript(full);
            }
          } catch { /* ignore malformed */ }
        }
      }
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
      setStatus("error");
    }
  }, [onTranscript]);

  const toggle = useCallback(() => {
    if (status === "recording") void stop();
    else if (status !== "transcribing") void start();
  }, [status, start, stop]);

  return { status, error, start, stop, toggle };
}