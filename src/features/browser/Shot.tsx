/** A screenshot artifact: lazily loaded thumbnail that opens full size. */
import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { browser } from "@/lib/agent-client";

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
  return (
    <>
      <button
        onClick={() => url && setOpen(true)}
        className={`group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${className ?? ""}`}
        aria-label={`Open screenshot ${label}`}
      >
        {url ? (
          <img src={url} alt={label} className="h-full w-full object-cover object-top" />
        ) : error ? (
          <ImageOff className="size-5 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-0.5 text-left text-[11px]">
          {label}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-[92vw] overflow-auto p-3 sm:max-w-[92vw]">
          <DialogTitle className="text-sm">{label}</DialogTitle>
          <DialogDescription className="truncate text-xs">{path}</DialogDescription>
          {url && <img src={url} alt={label} className="mx-auto max-w-full" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
