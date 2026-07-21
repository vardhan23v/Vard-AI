import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "mint" | "violet" | "coral" | "cyan" | "amber";

export const ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: "mint", label: "Aurora Mint", swatch: "oklch(0.82 0.17 175)" },
  { id: "violet", label: "Iris Bloom", swatch: "oklch(0.7 0.22 295)" },
  { id: "coral", label: "Sunset Coral", swatch: "oklch(0.75 0.2 25)" },
  { id: "cyan", label: "Ice Cyan", swatch: "oklch(0.8 0.15 220)" },
  { id: "amber", label: "Solar Amber", swatch: "oklch(0.82 0.16 80)" },
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
  const [accent, setAccentState] = useState<ThemeAccent>("mint");

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
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${MODE_KEY}');var a=localStorage.getItem('${ACCENT_KEY}');var h=document.documentElement;if(m==='light'){h.classList.remove('dark');h.classList.add('light');}else{h.classList.add('dark');h.classList.remove('light');}h.setAttribute('data-accent',a||'mint');}catch(e){}})();`;