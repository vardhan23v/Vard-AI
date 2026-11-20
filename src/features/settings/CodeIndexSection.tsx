/** Settings → Code index: per-project embeddings, size limits and deleting the index. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { code, isTauri, type CodeConfig } from "@/lib/agent-client";
import { projectPath } from "@/features/agent/projects";
import { ProjectPicker } from "@/features/agent/ProjectPicker";
import { EmbeddingsEditor } from "@/features/code/EmbeddingsEditor";
import { Section } from "./Section";

const MB = 1_000_000;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function CodeIndexSection() {
  const [projectId, setProjectId] = useState("");
  const root = projectId ? projectPath(projectId) : undefined;
  return (
    <Section
      title="Code index"
      description="Each project's index lives in its .vard/index folder on this Mac. Changes apply the next time the index is updated."
    >
      <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
        {!isTauri() ? (
          <p className="text-muted-foreground">The code index is managed in the desktop app.</p>
        ) : (
          <>
            <ProjectPicker value={projectId} onChange={setProjectId} />
            {root && <CodeIndexSettings key={root} root={root} />}
          </>
        )}
      </div>
    </Section>
  );
}

function CodeIndexSettings({ root }: { root: string }) {
  const qc = useQueryClient();
  const cfg = useQuery({
    queryKey: ["code-config", root],
    queryFn: () => code.config(root).then((e) => e.config),
    retry: false,
  });
  const status = useQuery({
    queryKey: ["code-status", root],
    queryFn: () => code.status(root).then((e) => e.status),
    retry: false,
  });
  const save = async (patch: Partial<CodeConfig>) => {
    try {
      const r = await code.config(root, patch);
      qc.setQueryData(["code-config", root], r.config);
      toast.success("Saved. Update the index to apply it.");
      return true;
    } catch (e) {
      toast.error("Couldn't save", { description: msg(e) });
      return false;
    }
  };
  const remove = async () => {
    if (!window.confirm("Delete this project's code index? It can be rebuilt any time.")) return;
    try {
      const r = await code.index(root, "clean");
      qc.setQueryData(["code-status", root], r.status);
      toast.success("Index deleted");
    } catch (e) {
      toast.error("Couldn't delete the index", { description: msg(e) });
    }
  };

  if (cfg.error)
    return (
      <p role="alert" className="text-destructive">
        {msg(cfg.error)}
      </p>
    );
  if (!cfg.data)
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />;
  const c = cfg.data;
  return (
    <div className="animate-enter space-y-5">
      <div className="space-y-2">
        <h3 className="font-medium">Semantic search</h3>
        <p className="text-xs text-muted-foreground">
          Optional vector search with a local Ollama model or your OpenAI or Google key. Code that
          looks like it holds secrets is never sent.
        </p>
        <EmbeddingsEditor value={c.embeddings} onSave={(embeddings) => void save({ embeddings })} />
      </div>
      <Caps key={JSON.stringify([c.maxFiles, c.maxFileBytes, c.maxIndexBytes])} c={c} save={save} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          {status.data?.files
            ? `${status.data.files.toLocaleString()} files indexed · ${(status.data.bytes / MB).toFixed(1)} MB`
            : "Not indexed yet."}{" "}
          <Link to="/code" className="text-agent-foreground hover:underline">
            Open the Code page
          </Link>
        </p>
        {!!status.data?.files && (
          <button
            onClick={() => void remove()}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" aria-hidden /> Delete index
          </button>
        )}
      </div>
    </div>
  );
}

/** Editable limits. Sizes are entered in MB; the agent validates the ranges. */
function Caps({
  c,
  save,
}: {
  c: CodeConfig;
  save: (patch: Partial<CodeConfig>) => Promise<boolean>;
}) {
  const [maxFiles, setMaxFiles] = useState(String(c.maxFiles));
  const [fileMB, setFileMB] = useState(String(c.maxFileBytes / MB));
  const [indexMB, setIndexMB] = useState(String(c.maxIndexBytes / MB));
  const [saving, setSaving] = useState(false);
  const patch = {
    maxFiles: Math.round(Number(maxFiles)),
    maxFileBytes: Math.round(Number(fileMB) * MB),
    maxIndexBytes: Math.round(Number(indexMB) * MB),
  };
  const valid =
    patch.maxFiles >= 100 &&
    patch.maxFiles <= 500_000 &&
    patch.maxFileBytes >= 10_000 &&
    patch.maxFileBytes <= 10_000_000 &&
    patch.maxIndexBytes >= 10_000_000 &&
    patch.maxIndexBytes <= 5_000_000_000;
  const dirty =
    patch.maxFiles !== c.maxFiles ||
    patch.maxFileBytes !== c.maxFileBytes ||
    patch.maxIndexBytes !== c.maxIndexBytes;
  const field =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums outline-none focus:border-primary";
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await save(patch);
        setSaving(false);
      }}
    >
      <h3 className="font-medium">Limits</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Max files (100–500,000)
          <input
            type="number"
            min={100}
            max={500_000}
            step={100}
            value={maxFiles}
            onChange={(e) => setMaxFiles(e.target.value)}
            className={field}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Max file size, MB (0.01–10)
          <input
            type="number"
            min={0.01}
            max={10}
            step={0.01}
            value={fileMB}
            onChange={(e) => setFileMB(e.target.value)}
            className={field}
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Max index size, MB (10–5,000)
          <input
            type="number"
            min={10}
            max={5000}
            step={10}
            value={indexMB}
            onChange={(e) => setIndexMB(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button
        disabled={!dirty || !valid || saving}
        className="press inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving && <Loader2 className="size-4 animate-spin" aria-hidden />} Save limits
      </button>
      {dirty && !valid && (
        <p role="alert" className="text-xs text-destructive">
          One of the limits is out of range.
        </p>
      )}
    </form>
  );
}
