/** "Rate-limited, retrying in Ns (attempt a/b)": shown while the agent waits out a provider error. */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RetryWait } from "./store";

export function RetryNotice({ wait, className }: { wait?: RetryWait; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!wait) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);
  if (!wait) return null;
  const secs = Math.max(0, Math.ceil((wait.until - now) / 1000));
  const malformed = /tool call|failed_generation/i.test(wait.message);
  return (
    <span
      role="status"
      title={wait.message}
      className={cn("flex animate-fade-in items-center gap-1.5 text-xs text-primary", className)}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      <span>
        {malformed ? "Malformed tool call" : "Rate-limited"},{" "}
        {secs > 0 ? `retrying in ${secs}s` : "retrying now"} (attempt {wait.attempt}/
        {wait.maxAttempts})
      </span>
    </span>
  );
}
