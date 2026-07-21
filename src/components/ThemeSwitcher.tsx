import { Moon, Sun } from "lucide-react";
import { ACCENTS, useTheme } from "@/lib/theme";

export function ThemeSwitcher() {
  const { mode, accent, toggleMode, setAccent } = useTheme();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-white/[0.02] p-2">
      <button
        type="button"
        onClick={toggleMode}
        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/70 hover:bg-white/5 hover:text-foreground transition-colors"
        aria-label="Toggle color mode"
      >
        <span className="hidden md:inline uppercase tracking-wider">
          {mode === "dark" ? "Dark" : "Light"}
        </span>
        {mode === "dark" ? (
          <Moon className="w-4 h-4" />
        ) : (
          <Sun className="w-4 h-4" />
        )}
      </button>
      <div className="flex items-center justify-between gap-1 px-1">
        {ACCENTS.map((a) => {
          const active = a.id === accent;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.id)}
              aria-label={a.label}
              title={a.label}
              className={`h-5 w-5 rounded-full transition-all ${
                active
                  ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/60 scale-110"
                  : "opacity-70 hover:opacity-100"
              }`}
              style={{ background: a.swatch, boxShadow: `0 0 10px ${a.swatch}` }}
            />
          );
        })}
      </div>
    </div>
  );
}