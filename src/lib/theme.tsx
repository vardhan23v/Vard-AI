import { useEffect, useState, type ReactNode } from "react";
import {
  ACCENTS,
  ThemeContext,
  type ThemeAccent,
  type ThemeCtx,
  type ThemeMode,
} from "./theme-context";

export type { ThemeAccent, ThemeMode } from "./theme-context";

const MODE_KEY = "vard-theme-mode";
const ACCENT_KEY = "vard-theme-accent";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [accent, setAccentState] = useState<ThemeAccent>("star");

  // Hydrate from localStorage after mount (SSR-safe)
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY) as ThemeMode | null;
      const a = localStorage.getItem(ACCENT_KEY) as ThemeAccent | null;
      if (m === "dark" || m === "light") setModeState(m);
      if (a && ACCENTS.some((x) => x.id === a)) setAccentState(a);
    } catch {}
  }, []);

  // Apply to <html>
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("dark", mode === "dark");
    html.classList.toggle("light", mode === "light");
    html.setAttribute("data-accent", accent);
    try {
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(ACCENT_KEY, accent);
    } catch {}
  }, [mode, accent]);

  const value: ThemeCtx = {
    mode,
    accent,
    setMode: setModeState,
    setAccent: setAccentState,
    toggleMode: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// Inline script that runs before hydration to prevent flash of wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${MODE_KEY}');var a=localStorage.getItem('${ACCENT_KEY}');var h=document.documentElement;if(m==='light'){h.classList.remove('dark');h.classList.add('light');}else{h.classList.add('dark');h.classList.remove('light');}h.setAttribute('data-accent',(a==='cerulean'||a==='sage'?a:'star'));}catch(e){}})();`;
