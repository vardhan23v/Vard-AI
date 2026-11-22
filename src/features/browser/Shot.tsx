/** A screenshot artifact: lazily loaded thumbnail that opens full size. */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useArtifactUrl } from "./artifacts";

export function Shot({
  path,
  label,
  className,
}: {
  path: string;
  label: string;
  className?: string;
}) {
  const { url, error } = useArtifactUrl(path);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The wrapper takes any list entrance (e.g. a parent's `stagger`); the button keeps `lift`, so
  // the entrance animation's fill never pins the hover transform.
  return (
    <div className="min-w-0">
      <button
        onClick={() => url && setOpen(true)}
        className={cn(
          "group lift relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30",
          className,
        )}
        aria-label={`Open screenshot ${label}`}
      >
        {error ? (
          <ImageOff className="size-5 text-muted-foreground" aria-hidden />
        ) : (
          !loaded && <Skeleton className="absolute inset-0 rounded-none" aria-hidden />
        )}
        {url && !error && (
          <img
            src={url}
            alt={label}
            onLoad={() => setLoaded(true)}
            className={cn(
              "h-full w-full object-cover object-top",
              loaded ? "animate-fade-in" : "opacity-0",
            )}
          />
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-0.5 text-left text-[11px]">
          {label}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* DialogContent already zooms in/out (zoom-in-95 / zoom-out-95 on data-state). */}
        <DialogContent className="max-h-[92vh] max-w-[92vw] overflow-auto p-3 sm:max-w-[92vw]">
          <DialogTitle className="text-sm">{label}</DialogTitle>
          <DialogDescription className="truncate text-xs">{path}</DialogDescription>
          {url && <img src={url} alt={label} className="mx-auto max-w-full" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
