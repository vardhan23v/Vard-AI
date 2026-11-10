import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileDiff } from "lucide-react";
import { cn } from "@/lib/utils";

type FileDiffT = { path: string; lines: string[]; added: number; removed: number };

function parse(diff: string): FileDiffT[] {
  const files: FileDiffT[] = [];
  let cur: FileDiffT | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = / b\/(.+)$/.exec(line);
      cur = { path: m?.[1] ?? line.slice(11), lines: [], added: 0, removed: 0 };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^(index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to) )/.test(line)) continue;
    if (line.startsWith("+")) cur.added++;
    else if (line.startsWith("-")) cur.removed++;
    cur.lines.push(line);
  }
  return files;
}

/** Unified diff, one collapsible section per file. */
export function DiffView({ diff }: { diff: string }) {
  const files = useMemo(() => parse(diff), [diff]);
  if (!files.length) return <p className="text-sm text-muted-foreground">No changes.</p>;
  return (
    <div className="space-y-3">
      {files.map((f) => (
        <FileSection key={f.path} file={f} defaultOpen={files.length <= 6} />
      ))}
    </div>
  );
}

function FileSection({ file, defaultOpen }: { file: FileDiffT; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-card px-3 py-2 text-left text-sm hover:bg-accent"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <FileDiff className="size-4 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-[13px]">{file.path}</span>
        <span className="font-mono text-xs text-diff-add">+{file.added}</span>
        <span className="font-mono text-xs text-diff-remove">−{file.removed}</span>
      </button>
      {open && (
        <pre className="overflow-x-auto bg-background/60 py-1 font-mono text-[12.5px] leading-5">
          {file.lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "px-3 whitespace-pre",
                l.startsWith("+") && "bg-diff-add/15 text-foreground",
                l.startsWith("-") && "bg-diff-remove/15 text-foreground",
                l.startsWith("@@") && "text-agent-foreground",
                !/^[+\-@]/.test(l) && "text-muted-foreground",
              )}
            >
              {l || " "}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
