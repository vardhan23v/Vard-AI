/** A screenshot artifact: lazily loaded thumbnail that opens full size. */
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { browser } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

const cache = new Map<string, Promise<string>>();

/** The project folder an artifact belongs to (artifacts live in <project>/.vard/artifacts). */
export const projectOfArtifact = (p: string) => p.split("/.vard/artifacts/")[0];

export function useArtifactUrl(path: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!path) return;
    let live = true;
    let p = cache.get(path);
    if (!p) {
      p = browser
        .artifact(projectOfArtifact(path), path)
        .then((a) => `data:${a.mediaType};base64,${a.data}`);
      p.catch(() => cache.delete(path!));
      cache.set(path, p);
    }
    p.then((u) => live && setUrl(u)).catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [path]);
  return { url, error };
}

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
          "group lift relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
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
