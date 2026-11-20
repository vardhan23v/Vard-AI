import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EasingId = "smooth" | "snappy" | "gentle" | "spring" | "linear" | "ease-in-out";

export const EASINGS: { id: EasingId; label: string; value: string }[] = [
  { id: "smooth", label: "Smooth", value: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  { id: "snappy", label: "Snappy", value: "cubic-bezier(0.4, 0, 0.1, 1)" },
  { id: "gentle", label: "Gentle", value: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" },
  { id: "spring", label: "Spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  { id: "ease-in-out", label: "Ease in-out", value: "ease-in-out" },
  { id: "linear", label: "Linear", value: "linear" },
];

export type TransitionPreset = "lift" | "fade" | "slide" | "zoom" | "blur";

export const TRANSITION_PRESETS: { id: TransitionPreset; label: string; description: string }[] = [
  { id: "lift", label: "Lift", description: "Subtle rise, fade & blur (default)" },
  { id: "fade", label: "Fade", description: "Simple opacity crossfade" },
  { id: "slide", label: "Slide", description: "Slides in from the right" },
  { id: "zoom", label: "Zoom", description: "Scales up into place" },
  { id: "blur", label: "Blur", description: "Focuses in from soft blur" },
];

export type Motion = {
  duration: number; // ms
  easing: EasingId;
  enabled: boolean;
  reducedMotion: "system" | "on" | "off";
  preset: TransitionPreset;
};

const DEFAULT_MOTION: Motion = {
  duration: 450,
  easing: "smooth",
  enabled: true,
  reducedMotion: "system",
  preset: "lift",
};

type MotionCtx = Motion & {
  setDuration: (v: number) => void;
  setEasing: (v: EasingId) => void;
  setEnabled: (v: boolean) => void;
  setReducedMotion: (v: "system" | "on" | "off") => void;
  setPreset: (v: TransitionPreset) => void;
  reset: () => void;
};

const Ctx = createContext<MotionCtx | null>(null);
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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMotion() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMotion must be used within MotionProvider");
  return v;
}

export const MOTION_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${KEY}');var m=raw?JSON.parse(raw):{};var h=document.documentElement;var d=(m.enabled===false)?0:(typeof m.duration==='number'?m.duration:450);var eMap={smooth:'cubic-bezier(0.2, 0.8, 0.2, 1)',snappy:'cubic-bezier(0.4, 0, 0.1, 1)',gentle:'cubic-bezier(0.25, 0.46, 0.45, 0.94)',spring:'cubic-bezier(0.34, 1.56, 0.64, 1)','ease-in-out':'ease-in-out',linear:'linear'};h.style.setProperty('--route-duration',d+'ms');h.style.setProperty('--motion-scale',String(d===0?0:Math.max(0.3,Math.min(2,d/450))));h.style.setProperty('--route-ease',eMap[m.easing]||eMap.smooth);h.setAttribute('data-reduced-motion',m.reducedMotion||'system');h.setAttribute('data-transition',m.preset||'lift');}catch(e){}})();`;
/** True when movement should be skipped: the Settings choice wins, else the OS. */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const html = document.documentElement;
  const pref = html.getAttribute("data-reduced-motion");
  if (pref === "on") return true;
  if (pref === "off") return false;
  if (html.style.getPropertyValue("--motion-scale") === "0") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

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

/** Counts up to `target` in under 400 ms; jumps straight there under reduced motion. */
export function useCountUp(target: number, ms = 380): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target || prefersReducedMotion()) {
      from.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(start + (target - start) * eased);
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

/** A number that counts up from 0 on mount and between values after. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [target, setTarget] = useState(0);
  useEffect(() => setTarget(value), [value]);
  const n = useCountUp(target);
  return <span className={cn("tabular-nums", className)}>{n.toLocaleString()}</span>;
}

/**
 * Keeps a removed item mounted for one exit animation. Returns the items to
 * render, with `leaving` set on the ones that are on their way out.
 */
export function usePresence<T>(
  items: T[],
  keyOf: (item: T) => string,
  exitMs = 220,
): { item: T; leaving: boolean }[] {
  const [leaving, setLeaving] = useState<Map<string, T>>(new Map());
  const prev = useRef<Map<string, T>>(new Map());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const now = new Map(items.map((i) => [keyOf(i), i] as const));
    const gone = [...prev.current].filter(([k]) => !now.has(k));
    prev.current = now;
    if (!gone.length || prefersReducedMotion()) return;
    setLeaving((m) => new Map([...m, ...gone]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLeaving((m) => {
        const next = new Map(m);
        for (const [k] of gone) next.delete(k);
        return next;
      });
    }, exitMs);
    timers.current.add(timer);
    // keyOf is expected to be stable in meaning; items drives the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, exitMs]);
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);
  const out = items.map((item) => ({ item, leaving: false }));
  for (const [k, item] of leaving) {
    if (!items.some((i) => keyOf(i) === k)) out.push({ item, leaving: true });
  }
  return out;
}

/**
 * Entrance for a live list: the items there when it first shows cascade in (`list` returns
 * "stagger" for the container), and items added afterwards get `animate-row-in` once (`item`).
 * Re-renders, such as streamed text, never re-animate anything. Pass `ready` false while loading.
 */
export function useListEntrance(keys: readonly string[], ready = true) {
  const latest = useRef(keys);
  useEffect(() => {
    latest.current = keys;
  });
  const [seen, setSeen] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!ready || seen) return;
    // Long enough for the capped cascade to finish at the slowest motion setting.
    const timer = setTimeout(() => setSeen(new Set(latest.current)), 1500);
    return () => clearTimeout(timer);
  }, [ready, seen]);
  return {
    list: seen ? "" : "stagger",
    item: (key: string) => (seen && !seen.has(key) ? "animate-row-in" : ""),
  };
}
