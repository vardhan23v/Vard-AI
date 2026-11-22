/** Animation hooks that follow the motion tokens and the reduced-motion preference. */
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion-context";

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
