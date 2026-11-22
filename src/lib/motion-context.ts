/** Motion settings: presets, defaults, the settings context and reduced-motion detection. */
import { createContext, useContext } from "react";

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

export const DEFAULT_MOTION: Motion = {
  duration: 450,
  easing: "smooth",
  enabled: true,
  reducedMotion: "system",
  preset: "lift",
};

export type MotionCtx = Motion & {
  setDuration: (v: number) => void;
  setEasing: (v: EasingId) => void;
  setEnabled: (v: boolean) => void;
  setReducedMotion: (v: "system" | "on" | "off") => void;
  setPreset: (v: TransitionPreset) => void;
  reset: () => void;
};

export const MotionContext = createContext<MotionCtx | null>(null);

export function useMotion() {
  const v = useContext(MotionContext);
  if (!v) throw new Error("useMotion must be used within MotionProvider");
  return v;
}

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
