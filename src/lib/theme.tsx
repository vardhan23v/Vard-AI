import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "star" | "cerulean" | "sage";

export const ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: "star", label: "Star Yellow", swatch: "#c2b75d" },
  { id: "cerulean", label: "Swirl Blue", swatch: "#7f97b0" },
  { id: "sage", label: "Cypress Sage", swatch: "#b2b580" },
];

type ThemeCtx = {
  mode: ThemeMode;
  accent: ThemeAccent;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: ThemeAccent) => void;
  toggleMode: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

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

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}

// Inline script that runs before hydration to prevent flash of wrong theme.
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${MODE_KEY}');var a=localStorage.getItem('${ACCENT_KEY}');var h=document.documentElement;if(m==='light'){h.classList.remove('dark');h.classList.add('light');}else{h.classList.add('dark');h.classList.remove('light');}h.setAttribute('data-accent',(a==='cerulean'||a==='sage'?a:'star'));}catch(e){}})();`;