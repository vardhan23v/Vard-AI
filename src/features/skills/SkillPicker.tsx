/** Compact skills control for the new-task composer: automatic selection plus skills picked by hand. */
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { isTauri, skills } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

export function SkillPicker({
  projectRoot,
  auto,
  onAuto,
  picked,
  onPicked,
}: {
  projectRoot: string;
  auto: boolean;
  onAuto: (v: boolean) => void;
  picked: string[];
  onPicked: (v: string[]) => void;
}) {
  const q = useQuery({
    queryKey: ["skills", projectRoot],
    queryFn: () => skills.list(projectRoot),
    enabled: isTauri(),
    retry: false,
  });
  const usable = (q.data?.skills ?? []).filter(
    (s) => s.valid && s.enabled && s.trusted && !s.shadowedBy,
  );
  const label = picked.length
    ? `${picked.length} skill${picked.length > 1 ? "s" : ""}${auto ? " + auto" : ""}`
    : auto
      ? "Skills: auto"
      : "No skills";
  const toggle = (name: string) =>
    onPicked(picked.includes(name) ? picked.filter((p) => p !== name) : [...picked, name]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-input px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Sparkles className="size-3.5" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <label className="flex items-center justify-between gap-2 border-b border-border p-3 text-sm">
          <span>
            Pick automatically
            <span className="block text-xs text-muted-foreground">
              Vard adds the skills that fit the task.
            </span>
          </span>
          <Switch checked={auto} onCheckedChange={onAuto} aria-label="Pick skills automatically" />
        </label>
        <p className="px-3 pt-2 text-xs text-muted-foreground">Always use:</p>
        <ul className="max-h-64 overflow-y-auto p-1" aria-label="Skills">
          {usable.map((s) => {
            const on = picked.includes(s.name);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => toggle(s.name)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{s.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!usable.length && (
            <li className="px-2 py-1.5 text-xs text-muted-foreground">
              {q.isLoading ? "Loading…" : "No skills available."}
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
