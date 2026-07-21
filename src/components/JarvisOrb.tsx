import { useEffect, useState } from "react";

type OrbState = "idle" | "listening" | "thinking" | "speaking";

export function JarvisOrb({
  state = "idle",
  size = 260,
  onClick,
}: {
  state?: OrbState;
  size?: number;
  onClick?: () => void;
}) {
  const active = state !== "idle";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Activate assistant"
      className="relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary group"
      style={{ width: size, height: size }}
    >
      {/* expanding rings when active */}
      {active && (
        <>
          <span className="absolute inset-0 rounded-full border border-primary/50 animate-ring" />
          <span
            className="absolute inset-0 rounded-full border border-primary/40 animate-ring"
            style={{ animationDelay: "0.8s" }}
          />
          <span
            className="absolute inset-0 rounded-full border border-primary/30 animate-ring"
            style={{ animationDelay: "1.6s" }}
          />
        </>
      )}

      {/* outer rotating rings */}
      <span className="absolute inset-[-14%] rounded-full border border-primary/20 animate-orb-spin" />
      <span className="absolute inset-[-6%] rounded-full border border-primary/30 border-dashed animate-orb-spin-rev" />

      {/* the orb */}
      <span
        className="relative rounded-full orb-glow animate-orb-pulse"
        style={{
          width: "70%",
          height: "70%",
          background:
            "radial-gradient(circle at 30% 30%, oklch(0.95 0.1 210), oklch(0.65 0.2 230) 45%, oklch(0.3 0.15 260) 80%)",
        }}
      >
        <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent,oklch(0.95_0.1_210_/_40%),transparent_60%)] animate-orb-spin" />
        <span className="absolute inset-4 rounded-full bg-[radial-gradient(circle_at_60%_35%,oklch(1_0_0_/_35%),transparent_55%)]" />
      </span>

      {/* voice waveform overlay */}
      {(state === "listening" || state === "speaking") && (
        <span className="absolute bottom-[18%] flex items-end gap-1 h-8">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-primary-foreground/90 animate-wave"
              style={{ height: "100%", animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

export function useCyclingState() {
  const [state, setState] = useState<OrbState>("idle");
  useEffect(() => {
    const seq: OrbState[] = ["idle", "listening", "thinking", "speaking", "idle"];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % seq.length;
      setState(seq[i]);
    }, 2600);
    return () => clearInterval(id);
  }, []);
  return [state, setState] as const;
}