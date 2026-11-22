/** Loading screenshot artifacts from a project's .vard/artifacts folder. */
import { useEffect, useState } from "react";
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
