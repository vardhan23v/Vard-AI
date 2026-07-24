import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type EasingId = "smooth" | "snappy" | "gentle" | "spring" | "linear" | "ease-in-out";

export const EASINGS: { id: EasingId; label: string; value: string }[] = [
  { id: "smooth", label: "Smooth", value: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  { id: "snappy", label: "Snappy", value: "cubic-bezier(0.4, 0, 0.1, 1)" },
  { id: "gentle", label: "Gentle", value: "cubic-bezier(0.25, 0.46, 0.45, 0.94)" },
  { id: "spring", label: "Spring", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  { id: "ease-in-out", label: "Ease in-out", value: "ease-in-out" },
  { id: "linear", label: "Linear", value: "linear" },
];

export type Motion = {
  duration: number; // ms
  easing: EasingId;
  enabled: boolean;
  reducedMotion: "system" | "on" | "off";
};

const DEFAULT_MOTION: Motion = {
  duration: 450,
  easing: "smooth",
  enabled: true,
  reducedMotion: "system",
};

type MotionCtx = Motion & {
  setDuration: (v: number) => void;
  setEasing: (v: EasingId) => void;
  setEnabled: (v: boolean) => void;
  setReducedMotion: (v: "system" | "on" | "off") => void;
  reset: () => void;
};

const Ctx = createContext<MotionCtx | null>(null);
const KEY = "vard-motion";

function easingValue(id: EasingId): string {
  return EASINGS.find((e) => e.id === id)?.value ?? "cubic-bezier(0.2, 0.8, 0.2, 1)";
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [motion, setMotion] = useState<Motion>(DEFAULT_MOTION);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMotion({ ...DEFAULT_MOTION, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(motion));
    } catch {}
    const html = document.documentElement;
    html.style.setProperty("--route-duration", motion.enabled ? `${motion.duration}ms` : "0ms");
    html.style.setProperty("--route-ease", easingValue(motion.easing));
    html.setAttribute("data-reduced-motion", motion.reducedMotion);
  }, [motion]);

  const value: MotionCtx = {
    ...motion,
    setDuration: (duration) => setMotion((m) => ({ ...m, duration })),
    setEasing: (easing) => setMotion((m) => ({ ...m, easing })),
    setEnabled: (enabled) => setMotion((m) => ({ ...m, enabled })),
    setReducedMotion: (reducedMotion) => setMotion((m) => ({ ...m, reducedMotion })),
    reset: () => setMotion(DEFAULT_MOTION),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMotion() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMotion must be used within MotionProvider");
  return v;
}

export const MOTION_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${KEY}');var m=raw?JSON.parse(raw):{};var h=document.documentElement;var d=(m.enabled===false)?0:(typeof m.duration==='number'?m.duration:450);var eMap={smooth:'cubic-bezier(0.2, 0.8, 0.2, 1)',snappy:'cubic-bezier(0.4, 0, 0.1, 1)',gentle:'cubic-bezier(0.25, 0.46, 0.45, 0.94)',spring:'cubic-bezier(0.34, 1.56, 0.64, 1)','ease-in-out':'ease-in-out',linear:'linear'};h.style.setProperty('--route-duration',d+'ms');h.style.setProperty('--route-ease',eMap[m.easing]||eMap.smooth);h.setAttribute('data-reduced-motion',m.reducedMotion||'system');}catch(e){}})();`;