/** Status tones shared by every badge in the app. */
export type Tone = "ok" | "bad" | "attention" | "live" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  ok: "border-diff-add/50 text-diff-add",
  bad: "border-destructive/50 text-destructive",
  attention: "border-primary/60 text-primary",
  live: "border-agent/60 text-agent-foreground",
  muted: "border-border text-muted-foreground",
};
