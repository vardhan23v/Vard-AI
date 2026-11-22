/**
 * Agent roles: model, preferred skills, limits and extra instructions per role (saved in
 * ~/.vard/agents.json). Tool permissions can only be narrowed from each role's built-in set.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { agentRoles, isTauri, type RoleConfig, type RoleOverride } from "@/lib/agent-client";
import { ROLE_LABEL } from "./team-utils";

/** Radix Select can't hold an empty value: "no override" uses this sentinel. */
const SAME_AS_TASK = "__same__";

const PROVIDERS = ["groq", "anthropic", "openai", "google", "openai-compatible", "ollama"] as const;

export function RolesEditor() {
  const q = useQuery({
    queryKey: ["agent-roles"],
    queryFn: () => agentRoles.list(),
    enabled: isTauri(),
    retry: false,
  });
  if (q.isLoading)
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (q.error) return <p className="text-sm text-destructive">{String(q.error)}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Changes apply to new team runs. A role can be given its own model (it uses that provider's
        saved API key), but its tools can only be restricted, never widened.
      </p>
      {q.data!.roles.map((r) => (
        <RoleRow key={r.id} role={r} override={q.data!.overrides.global[r.id]} />
      ))}
    </div>
  );
}

function RoleRow({ role, override }: { role: RoleConfig; override?: RoleOverride }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RoleOverride>(override ?? {});
  const [saving, setSaving] = useState(false);
  // Bumped on each successful save so the check icon remounts and scales in again.
  const [saved, setSaved] = useState(0);
  const base = role; // effective (already narrowed); the switches below can only turn things off
  const tools = { ...base.tools, ...(draft.tools ?? {}) };

  const save = async (next: RoleOverride | null) => {
    setSaving(true);
    setSaved(0);
    try {
      const r = next
        ? await agentRoles.save("global", role.id, next)
        : await agentRoles.reset("global", role.id);
      qc.setQueryData(["agent-roles"], r);
      if (!next) setDraft({});
      setSaved((n) => n + 1);
      toast.success(`${ROLE_LABEL[role.id]} role ${next ? "saved" : "reset"}`);
    } catch (e) {
      toast.error("Couldn't save the role", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-border bg-card"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="font-medium">{ROLE_LABEL[role.id]}</span>
          <span className="ml-2 text-xs text-muted-foreground">{role.description}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {role.model ? `${role.model.provider}/${role.model.model}` : "task's model"}
        </span>
      </summary>
      <div className="grid gap-4 border-t border-border p-4 text-sm sm:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Model</legend>
          <div className="flex gap-2">
            <Select
              value={draft.model?.provider ?? SAME_AS_TASK}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  model:
                    v !== SAME_AS_TASK
                      ? {
                          provider: v as (typeof PROVIDERS)[number],
                          model: d.model?.model ?? "",
                        }
                      : null,
                }))
              }
            >
              <SelectTrigger aria-label="Provider" className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SAME_AS_TASK}>Same as the task</SelectItem>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {draft.model && (
              <input
                aria-label="Model id"
                value={draft.model.model}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, model: { ...d.model!, model: e.target.value } }))
                }
                placeholder="model id, e.g. openai/gpt-oss-120b"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
            )}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Tools</legend>
          {(["write", "exec", "browser"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <Switch
                checked={tools[k]}
                disabled={!base.tools[k] && !draft.tools?.[k]}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, tools: { ...d.tools, [k]: v } }))}
                aria-label={
                  k === "write"
                    ? "Edit files"
                    : k === "exec"
                      ? "Run commands"
                      : "Use the test browser"
                }
              />
              {k === "write"
                ? "Edit files"
                : k === "exec"
                  ? "Run commands (still asks unless allowed)"
                  : "Use the test browser and dev servers"}
            </label>
          ))}
          <div className="flex items-center gap-2">
            MCP tools
            <Select
              value={tools.mcp}
              onValueChange={(v) =>
                setDraft((d) => ({
                  ...d,
                  tools: { ...d.tools, mcp: v as "none" | "read" | "all" },
                }))
              }
            >
              <SelectTrigger aria-label="MCP tools" className="h-8 w-auto text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="read" disabled={base.tools.mcp === "none" && !draft.tools?.mcp}>
                  Read-only
                </SelectItem>
                <SelectItem
                  value="all"
                  disabled={base.tools.mcp !== "all" && draft.tools?.mcp !== "all"}
                >
                  All (each call still asks)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </fieldset>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">Step limit</span>
          <input
            type="number"
            min={1}
            max={500}
            value={draft.maxSteps ?? role.maxSteps}
            onChange={(e) =>
              setDraft((d) => ({ ...d, maxSteps: Number(e.target.value) || undefined }))
            }
            className="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            Preferred skills (comma-separated)
          </span>
          <input
            value={(draft.skills ?? role.skills).join(", ")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                skills: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              }))
            }
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-xs font-medium text-muted-foreground">
            Extra instructions
          </span>
          <textarea
            value={draft.instructions ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value || undefined }))}
            rows={3}
            placeholder={role.instructions}
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
          />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button
            onClick={() =>
              void save({
                ...draft,
                ...(draft.model && !draft.model.model.trim() ? { model: null } : {}),
              })
            }
            disabled={saving}
            className="press inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Save
          </button>
          {override && (
            <button
              onClick={() => void save(null)}
              disabled={saving}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-accent"
            >
              <RotateCcw className="size-4" /> Reset to default
            </button>
          )}
          {saved > 0 && !saving && (
            <span
              key={saved}
              role="status"
              className="inline-flex animate-scale-in items-center gap-1 text-xs text-success"
            >
              <Check className="size-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
