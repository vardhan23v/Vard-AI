import { useEffect, useRef, useState } from "react";
import { Upload, Trash2, RotateCcw, Paintbrush, Wand2, Accessibility, Play, Eye, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useBrand, BACKGROUND_STYLES, type BackgroundStyle } from "@/lib/brand";
import { useMotion, EASINGS, TRANSITION_PRESETS, type EasingId, type TransitionPreset } from "@/lib/motion";
import { LogoCropper } from "./LogoCropper";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";

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

function MotionSection() {
  const motion = useMotion();
  const [replayKey, setReplayKey] = useState(0);
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const effectiveReduced =
    motion.reducedMotion === "on" ||
    (motion.reducedMotion === "system" && systemReduced);
  return (
    <section className="space-y-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            Route transitions
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Fine-tune the animation used when navigating between pages.
          </p>
        </div>
        <button
          onClick={motion.reset}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-white/[0.03] px-3 py-2">
        <span className="text-sm">Enable transitions</span>
        <button
          role="switch"
          aria-checked={motion.enabled}
          onClick={() => motion.setEnabled(!motion.enabled)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            motion.enabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              motion.enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Duration</label>
          <span className="text-xs tabular-nums text-foreground">{motion.duration} ms</span>
        </div>
        <input
          type="range"
          min={0}
          max={1500}
          step={25}
          value={motion.duration}
          onChange={(e) => motion.setDuration(Number(e.target.value))}
          disabled={!motion.enabled}
          className="w-full accent-primary disabled:opacity-40"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Instant</span>
          <span>Cinematic</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Easing curve</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {EASINGS.map((e) => (
            <button
              key={e.id}
              onClick={() => motion.setEasing(e.id as EasingId)}
              disabled={!motion.enabled}
              className={`px-3 py-2 rounded-md text-xs border transition-all disabled:opacity-40 ${
                motion.easing === e.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Transition preset</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TRANSITION_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => motion.setPreset(p.id as TransitionPreset)}
              disabled={!motion.enabled}
              title={p.description}
              className={`px-3 py-2 rounded-md text-xs border text-left transition-all disabled:opacity-40 ${
                motion.preset === p.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{p.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white/[0.03] p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preview</div>
        <div
          key={`${motion.duration}-${motion.easing}-${motion.enabled}-${motion.preset}`}
          className="h-14 rounded-md bg-gradient-to-r from-primary/40 to-accent/40 border border-border"
          style={{
            animation: motion.enabled
              ? `route-${motion.preset === "lift" ? "enter" : motion.preset} ${motion.duration}ms ${
                  EASINGS.find((x) => x.id === motion.easing)?.value ?? ""
                } both`
              : "none",
          }}
        />
      </div>

      {/* Reduced motion */}
      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Accessibility className="w-4 h-4 text-primary" />
              Reduced motion
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Force the app into a low-motion mode, or defer to your OS setting.
              System is currently{" "}
              <span className="text-foreground font-medium">
                {systemReduced ? "requesting reduced motion" : "not requesting reduced motion"}
              </span>
              .
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(["system", "on", "off"] as const).map((v) => (
            <button
              key={v}
              onClick={() => motion.setReducedMotion(v)}
              className={`px-3 py-2 rounded-md text-xs border transition-all ${
                motion.reducedMotion === v
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {v === "system" ? "Match system" : v === "on" ? "Always on" : "Always off"}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md bg-white/[0.03] border border-border px-3 py-2 text-xs">
          <span className="text-muted-foreground">Effective state</span>
          <span
            className={`px-2 py-0.5 rounded-full font-medium ${
              effectiveReduced
                ? "bg-primary/20 text-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {effectiveReduced ? "Reduced motion ON" : "Full motion"}
          </span>
        </div>

        <div className="rounded-lg border border-border bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Live comparison
            </div>
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <Play className="w-3 h-3" /> Replay
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PreviewTile label="Full motion" mode="full" replayKey={replayKey} />
            <PreviewTile label="Reduced" mode="reduced" replayKey={replayKey} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The <span className="text-foreground">Reduced</span> tile always demos
            low-motion behavior. When your setting is active, the rest of the app
            behaves like the reduced tile — try navigating between pages to verify.
          </p>
        </div>

        <MotionShowcase />
      </div>
    </section>
  );
}

function PreviewTile({
  label,
  mode,
  replayKey,
}: {
  label: string;
  mode: "full" | "reduced";
  replayKey: number;
}) {
  return (
    <div
      data-motion-preview={mode}
      className="relative overflow-hidden rounded-md border border-border bg-background/40 p-3 h-28"
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
        {label}
      </div>
      <div
        key={replayKey}
        className="h-8 rounded-md bg-gradient-to-r from-primary/50 to-accent/50 animate-fade-up"
      />
      <div
        key={`orb-${replayKey}`}
        className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-primary/60 animate-orb-pulse"
      />
    </div>
  );
}

function MotionShowcase() {
  const motion = useMotion();
  const [mode, setMode] = useState<"full" | "reduced">("reduced");
  const [replayKey, setReplayKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const easingVal =
    EASINGS.find((e) => e.id === motion.easing)?.value ?? "cubic-bezier(0.2,0.8,0.2,1)";
  const routeAnim =
    motion.enabled && mode === "full"
      ? `route-${motion.preset === "lift" ? "enter" : motion.preset} ${motion.duration}ms ${easingVal} both`
      : "none";

  const replay = () => {
    // Reset everything, then reopen in the next frame so animations re-run.
    setDialogOpen(false);
    setDropdownOpen(false);
    setSheetOpen(false);
    setPopoverOpen(false);
    setReplayKey((k) => k + 1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDialogOpen(true);
        setDropdownOpen(true);
        setSheetOpen(true);
        setPopoverOpen(true);
        const d = mode === "full" ? 3200 : 2000;
        toast.success("Saved", { description: "Changes synced.", duration: d });
        toast.error("Failed", { description: "Retry in a moment.", duration: d });
        toast.loading("Working…", { description: "Uploading file.", duration: d });
      });
    });
  };

  return (
    <div className="rounded-lg border border-border bg-white/[0.03] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Preview reduced motion
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            One screen showing modals, toasts, dropdowns, and route transitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-[11px]">
            {(["reduced", "full"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 transition-colors ${
                  mode === m
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {m === "reduced" ? "Reduced" : "Full"}
              </button>
            ))}
          </div>
          <button
            onClick={replay}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Play className="w-3 h-3" /> Replay
          </button>
        </div>
      </div>

      <div
        data-motion-preview={mode}
        className="relative rounded-md border border-border bg-background/40 p-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Route transition demo */}
          <div className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Route transition
            </div>
            <div
              key={`route-${replayKey}-${mode}`}
              className="h-10 rounded-md bg-gradient-to-r from-primary/50 to-accent/50 border border-border"
              style={{ animation: routeAnim }}
            />
            <div className="text-[10px] text-muted-foreground mt-2">
              {motion.preset} · {motion.duration}ms · {motion.easing}
            </div>
          </div>

          {/* Toast variants demo — success / error / loading. Each inline card
              replays entry animations; live sonner toasts also fire on Replay. */}
          <div
            className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28"
            data-testid="toast-variants-tile"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Toast variants
            </div>
            <div className="space-y-1.5">
              <div
                key={`toast-success-${replayKey}-${mode}`}
                data-testid="toast-variant-success"
                className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-2"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Saved</div>
                  <div className="text-muted-foreground">Changes synced.</div>
                </div>
              </div>
              <div
                key={`toast-error-${replayKey}-${mode}`}
                data-testid="toast-variant-error"
                className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-2"
              >
                <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Failed</div>
                  <div className="text-muted-foreground">Retry in a moment.</div>
                </div>
              </div>
              <div
                key={`toast-loading-${replayKey}-${mode}`}
                data-testid="toast-variant-loading"
                className="flex items-start gap-2 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-2"
              >
                <Loader2
                  data-testid="toast-variant-loading-spinner"
                  className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0 animate-spin"
                />
                <div>
                  <div className="font-medium">Working…</div>
                  <div className="text-muted-foreground">Uploading file.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Dropdown demo */}
          <div className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28 relative">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Dropdown
            </div>
            <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <button className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-white/5 transition-colors">
                  Open menu
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6}>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Rename</DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Duplicate</DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Archive</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Modal demo */}
          <div className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Modal
            </div>
            <button
              onClick={() => setDialogOpen(true)}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-white/5 transition-colors"
            >
              Open dialog
            </button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Preview dialog</DialogTitle>
                  <DialogDescription>
                    Shown so you can compare open/close animations in this mode.
                  </DialogDescription>
                </DialogHeader>
                <div className="text-xs text-muted-foreground">
                  Close and press <span className="text-foreground">Replay</span> to see it again.
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Off-canvas sheet (mobile-style nav drawer) */}
          <div className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Off-canvas menu
            </div>
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  data-testid="open-sheet"
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-white/5 transition-colors"
                >
                  Open menu drawer
                </button>
              </SheetTrigger>
              <SheetContent side="left" data-testid="sheet-content">
                <SheetHeader>
                  <SheetTitle>Navigation</SheetTitle>
                  <SheetDescription>
                    Slide-in drawer used on mobile viewports.
                  </SheetDescription>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-1 text-sm">
                  <a className="px-2 py-1.5 rounded hover:bg-white/5">Home</a>
                  <a className="px-2 py-1.5 rounded hover:bg-white/5">Library</a>
                  <a className="px-2 py-1.5 rounded hover:bg-white/5">Settings</a>
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* Nested UI: popover containing an accordion */}
          <div className="rounded-md border border-border bg-white/[0.02] p-3 min-h-28 relative">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Nested popover + accordion
            </div>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  data-testid="open-popover"
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-white/5 transition-colors"
                >
                  Open popover
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" sideOffset={6} data-testid="popover-content">
                <Accordion type="single" collapsible defaultValue="a">
                  <AccordionItem value="a">
                    <AccordionTrigger>Section A</AccordionTrigger>
                    <AccordionContent>
                      Nested collapsible inside a portaled popover.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="b">
                    <AccordionTrigger data-testid="accordion-b-trigger">
                      Section B
                    </AccordionTrigger>
                    <AccordionContent data-testid="accordion-b-content">
                      Expands and collapses with height animation.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Drag & drop demo — snap-back transform transition on drop.
          Rendered OUTSIDE the [data-motion-preview] wrapper so it reflects the
          global reduced-motion setting (this is what real DnD in the app does). */}
      <div className="rounded-md border border-border bg-white/[0.02] p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Drag &amp; drop
        </div>
        <DragDropDemo />
      </div>

      <p className="text-[11px] text-muted-foreground">
        The <span className="text-foreground">Reduced</span> mode shows how the app
        will behave with reduced motion enabled. Switch to{" "}
        <span className="text-foreground">Full</span> to compare.
      </p>
    </div>
  );
}

function DragDropDemo() {
  const [slot, setSlot] = useState<"a" | "b">("a");
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      if (!startRef.current) return;
      const next = {
        x: e.clientX - startRef.current.x,
        y: e.clientY - startRef.current.y,
      };
      offsetRef.current = next;
      setOffset(next);
    };
    const onUp = () => {
      if (!startRef.current) return;
      const dx = offsetRef.current.x;
      startRef.current = null;
      setDragging(false);
      if (Math.abs(dx) > 40) setSlot((s) => (s === "a" ? "b" : "a"));
      offsetRef.current = { x: 0, y: 0 };
      setOffset({ x: 0, y: 0 });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = { x: e.clientX, y: e.clientY };
    offsetRef.current = { x: 0, y: 0 };
    setDragging(true);
  };

  const chip = (
    <div
      data-testid="dnd-chip"
      data-dragging={dragging ? "true" : "false"}
      onPointerDown={onPointerDown}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: dragging
          ? "none"
          : "transform 400ms cubic-bezier(0.2,0.8,0.2,1)",
      }}
      className="w-16 h-10 rounded-md bg-primary/60 border border-border cursor-grab active:cursor-grabbing touch-none select-none"
    />
  );

  return (
    <div className="space-y-2">
      <div
        className="flex items-stretch gap-3"
        data-testid="dnd-container"
        data-slot-active={slot}
      >
        <div
          data-testid="dnd-slot-a"
          className="flex-1 h-20 rounded-md border border-dashed border-border flex items-center justify-center"
        >
          {slot === "a" && chip}
        </div>
        <div
          data-testid="dnd-slot-b"
          className="flex-1 h-20 rounded-md border border-dashed border-border flex items-center justify-center"
        >
          {slot === "b" && chip}
        </div>
      </div>
      <button
        type="button"
        data-testid="dnd-drop"
        onClick={() => setSlot((s) => (s === "a" ? "b" : "a"))}
        className="text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        Drop into other slot
      </button>
    </div>
  );
}