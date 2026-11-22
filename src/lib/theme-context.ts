/** Theme settings: accents, the theme context and its hook. */
import { createContext, useContext } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "star" | "cerulean" | "sage";

export const ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: "star", label: "Star yellow", swatch: "#c2b75d" },
  { id: "cerulean", label: "Swirl blue", swatch: "#7f97b0" },
  { id: "sage", label: "Cypress sage", swatch: "#b2b580" },
];

export type ThemeCtx = {
  mode: ThemeMode;
  accent: ThemeAccent;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: ThemeAccent) => void;
  toggleMode: () => void;
};

export const ThemeContext = createContext<ThemeCtx | null>(null);

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used within ThemeProvider");
  return v;
}
