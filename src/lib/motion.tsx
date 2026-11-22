import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MOTION,
  EASINGS,
  MotionContext,
  type EasingId,
  type Motion,
  type MotionCtx,
} from "./motion-context";
import { useCountUp } from "./motion-hooks";

export type { EasingId, Motion, TransitionPreset } from "./motion-context";

const KEY = "vard-motion";

function easingValue(id: EasingId): string {
  return EASINGS.find((e) => e.id === id)?.value ?? "cubic-bezier(0.2, 0.8, 0.2, 1)";
}

export function MotionProvider({ children }: { children: ReactNode }) {
  // Read the saved settings up front: loading them in an effect let the save effect write the
  // defaults first, which a remount (React's dev double-mount) then read back.
  const [motion, setMotion] = useState<Motion>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULT_MOTION, ...JSON.parse(raw) };
    } catch {
      // Unreadable settings: fall back to the defaults.
    }
    return DEFAULT_MOTION;
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(motion));
    } catch {
      // Storage unavailable: settings last for this session only.
    }
    const html = document.documentElement;
    html.style.setProperty("--route-duration", motion.enabled ? `${motion.duration}ms` : "0ms");
    html.style.setProperty("--route-ease", easingValue(motion.easing));
    html.style.setProperty(
      "--motion-scale",
      motion.enabled ? String(Math.max(0.3, Math.min(2, motion.duration / 450))) : "0",
    );
    html.setAttribute("data-reduced-motion", motion.reducedMotion);
    html.setAttribute("data-transition", motion.preset);
  }, [motion]);

  const value: MotionCtx = {
    ...motion,
    setDuration: (duration) => setMotion((m) => ({ ...m, duration })),
    setEasing: (easing) => setMotion((m) => ({ ...m, easing })),
    setEnabled: (enabled) => setMotion((m) => ({ ...m, enabled })),
    setReducedMotion: (reducedMotion) => setMotion((m) => ({ ...m, reducedMotion })),
    setPreset: (preset) => setMotion((m) => ({ ...m, preset })),
    reset: () => setMotion(DEFAULT_MOTION),
  };

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export const MOTION_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${KEY}');var m=raw?JSON.parse(raw):{};var h=document.documentElement;var d=(m.enabled===false)?0:(typeof m.duration==='number'?m.duration:450);var eMap={smooth:'cubic-bezier(0.2, 0.8, 0.2, 1)',snappy:'cubic-bezier(0.4, 0, 0.1, 1)',gentle:'cubic-bezier(0.25, 0.46, 0.45, 0.94)',spring:'cubic-bezier(0.34, 1.56, 0.64, 1)','ease-in-out':'ease-in-out',linear:'linear'};h.style.setProperty('--route-duration',d+'ms');h.style.setProperty('--motion-scale',String(d===0?0:Math.max(0.3,Math.min(2,d/450))));h.style.setProperty('--route-ease',eMap[m.easing]||eMap.smooth);h.setAttribute('data-reduced-motion',m.reducedMotion||'system');h.setAttribute('data-transition',m.preset||'lift');}catch(e){}})();`;

/**
 * Highlights its content once each time `value` changes (not on first render).
 * The highlight is a fading overlay (`animate-flash`), so layout never moves.
 */
export function Flash({
  value,
  children,
  className,
}: {
  value: unknown;
  children: ReactNode;
  className?: string;
}) {
  const first = useRef(true);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(value ?? null);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((t) => t + 1);
  }, [key]);
  return (
    <span key={tick} className={cn(tick > 0 && "animate-flash", className)}>
      {children}
    </span>
  );
}

/** A number that counts up from 0 on mount and between values after. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [target, setTarget] = useState(0);
  useEffect(() => setTarget(value), [value]);
  const n = useCountUp(target);
  return <span className={cn("tabular-nums", className)}>{n.toLocaleString()}</span>;
}
