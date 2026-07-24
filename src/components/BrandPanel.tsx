import { useRef, useState } from "react";
import { Upload, Trash2, RotateCcw, Paintbrush, Wand2 } from "lucide-react";
import { useBrand, BACKGROUND_STYLES, type BackgroundStyle } from "@/lib/brand";
import { useMotion, EASINGS, type EasingId } from "@/lib/motion";
import { LogoCropper } from "./LogoCropper";

const PRESET_COLORS = [
  "#818cf8", "#67e8f9", "#c4b5fd", "#f472b6",
  "#fb923c", "#facc15", "#4ade80", "#2dd4bf",
];

export function BrandPanel() {
  const brand = useBrand();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
  const MAX_BYTES = 2 * 1024 * 1024; // 2MB

  const onFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("Unsupported format. Use PNG, JPG, WEBP, SVG, or GIF.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File too large. Max size is 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      // SVGs can't be rasterized reliably in the cropper — save as-is.
      if (f.type === "image/svg+xml") {
        brand.setLogo(data);
      } else {
        setPending(data);
      }
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(f);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
    <div className="w-full max-w-2xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Paintbrush className="w-5 h-5 text-primary" />
            Brand Customization
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personalize the logo, name, accent color, and background style for the whole app.
          </p>
        </div>
        <button
          onClick={brand.reset}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </header>

      {/* Brand name */}
      <section className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Brand name</label>
        <input
          value={brand.name}
          onChange={(e) => brand.setName(e.target.value)}
          placeholder="Your assistant name"
          className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </section>

      {/* Logo */}
      <section className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Logo</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-white/[0.03] border border-border flex items-center justify-center overflow-hidden">
            {brand.logo ? (
              <img src={brand.logo} alt="logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">None</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:brightness-110 transition-all"
            >
              <Upload className="w-4 h-4" /> Upload
            </button>
            {brand.logo && (
              <button
                onClick={() => brand.setLogo(null)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Remove
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP, SVG, or GIF — up to 2 MB. Square images look best.
        </p>
      </section>

      {/* Accent color */}
      <section className="space-y-3">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Accent color</label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => brand.setAccent(null)}
            className={`h-8 px-3 rounded-full text-xs border transition-all ${
              !brand.accent
                ? "border-primary text-foreground bg-primary/10"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Theme default
          </button>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => brand.setAccent(c)}
              aria-label={c}
              className={`h-8 w-8 rounded-full transition-all ${
                brand.accent === c ? "ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110" : "opacity-80 hover:opacity-100"
              }`}
              style={{ background: c, boxShadow: `0 0 14px ${c}` }}
            />
          ))}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="color"
              value={brand.accent ?? "#818cf8"}
              onChange={(e) => brand.setAccent(e.target.value)}
              className="h-8 w-8 rounded-full bg-transparent border border-border cursor-pointer"
            />
            Custom
          </label>
        </div>
      </section>

      {/* Background style */}
      <section className="space-y-3">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Background style</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {BACKGROUND_STYLES.map((s) => (
            <BackgroundPreview
              key={s.id}
              id={s.id}
              label={s.label}
              active={brand.background === s.id}
              onClick={() => brand.setBackground(s.id)}
            />
          ))}
        </div>
      </section>

      <MotionSection />
    </div>
    {pending && (
      <LogoCropper
        src={pending}
        onCancel={() => setPending(null)}
        onConfirm={(url) => {
          brand.setLogo(url);
          setPending(null);
        }}
      />
    )}
    </>
  );
}

function BackgroundPreview({
  id, label, active, onClick,
}: { id: BackgroundStyle; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-xl overflow-hidden border transition-all ${
        active ? "border-primary ring-2 ring-primary/50" : "border-border hover:border-primary/50"
      }`}
    >
      <div className="aspect-video w-full" data-bg-preview={id} />
      <div className="text-xs py-1.5 bg-black/40 text-foreground">{label}</div>
    </button>
  );
}