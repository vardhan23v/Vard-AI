/** Status tones shared by every badge in the app. */
export type Tone = "ok" | "bad" | "attention" | "live" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  ok: "border-success/50 text-success",
  bad: "border-destructive/50 text-destructive",
  attention: "border-warning/60 text-warning",
  live: "border-agent/60 text-agent-foreground",
  muted: "border-border text-muted-foreground",
};
