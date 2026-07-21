import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type BackgroundStyle = "nebula" | "mesh" | "grid" | "solid" | "aurora";

export const BACKGROUND_STYLES: { id: BackgroundStyle; label: string }[] = [
  { id: "nebula", label: "Nebula" },
  { id: "aurora", label: "Aurora" },
  { id: "mesh", label: "Mesh" },
  { id: "grid", label: "Grid" },
  { id: "solid", label: "Solid" },
];

export type Brand = {
  name: string;
  logo: string | null; // data URL or null
  accent: string | null; // custom hex, null = use theme accent preset
  background: BackgroundStyle;
};

const DEFAULT_BRAND: Brand = {
  name: "VardAI",
  logo: null,
  accent: null,
  background: "nebula",
};

type BrandCtx = Brand & {
  setName: (v: string) => void;
  setLogo: (v: string | null) => void;
  setAccent: (v: string | null) => void;
  setBackground: (v: BackgroundStyle) => void;
  reset: () => void;
};

const Ctx = createContext<BrandCtx | null>(null);
const KEY = "vard-brand";

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setBrand({ ...DEFAULT_BRAND, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(brand));
    } catch {}
    const html = document.documentElement;
    html.setAttribute("data-bg", brand.background);
    if (brand.accent) {
      html.style.setProperty("--primary", brand.accent);
      html.style.setProperty("--accent", brand.accent);
      html.style.setProperty("--ring", brand.accent);
      html.style.setProperty("--sidebar-primary", brand.accent);
      html.style.setProperty("--sidebar-ring", brand.accent);
    } else {
      html.style.removeProperty("--primary");
      html.style.removeProperty("--accent");
      html.style.removeProperty("--ring");
      html.style.removeProperty("--sidebar-primary");
      html.style.removeProperty("--sidebar-ring");
    }
  }, [brand]);

  const value: BrandCtx = {
    ...brand,
    setName: (name) => setBrand((b) => ({ ...b, name })),
    setLogo: (logo) => setBrand((b) => ({ ...b, logo })),
    setAccent: (accent) => setBrand((b) => ({ ...b, accent })),
    setBackground: (background) => setBrand((b) => ({ ...b, background })),
    reset: () => setBrand(DEFAULT_BRAND),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBrand() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBrand must be used within BrandProvider");
  return v;
}

export const BRAND_INIT_SCRIPT = `(function(){try{var raw=localStorage.getItem('${KEY}');var b=raw?JSON.parse(raw):{};var h=document.documentElement;h.setAttribute('data-bg',b.background||'nebula');if(b.accent){h.style.setProperty('--primary',b.accent);h.style.setProperty('--accent',b.accent);h.style.setProperty('--ring',b.accent);h.style.setProperty('--sidebar-primary',b.accent);h.style.setProperty('--sidebar-ring',b.accent);}}catch(e){}})();`;