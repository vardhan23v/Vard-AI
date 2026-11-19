/** Create or edit a SKILL.md with live validation. The skill's name comes from its frontmatter. */
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { skills, type SkillValidation } from "@/lib/agent-client";
import { cn } from "@/lib/utils";

export const NEW_SKILL_TEMPLATE = `---
name: my-skill
description: What this skill helps with, in one sentence.
version: 1.0.0
tags: []
triggers: []
roles: []
---

# My skill

## Instructions

- Follow the project's existing conventions.

## Workflow

1. Inspect the relevant code.
2. Make the change.
3. Run the tests and review the diff.
`;

export function SkillEditor({
  open,
  onOpenChange,
  initial,
  scope: fixedScope,
  name: fixedName,
  projectRoot,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: string;
  /** Set when editing an existing skill. */
  scope?: "global" | "project";
  name?: string;
  projectRoot?: string;
  onSaved: (id?: string) => void;
}) {
  const [text, setText] = useState(initial);
  const [scope, setScope] = useState<"global" | "project">(fixedScope ?? "global");
  const [check, setCheck] = useState<SkillValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setText(initial), [initial]);

  // Validate as the user types (debounced).
  useEffect(() => {
    if (!open) return;
    setChecking(true);
    const t = setTimeout(() => {
      skills
        .validate(text)
        .then(setCheck)
        .catch(() => setCheck(null))
        .finally(() => setChecking(false));
    }, 300);
    return () => clearTimeout(t);
  }, [text, open]);

  const nameMismatch = !!fixedName && !!check?.name && check.name !== fixedName;
  const canSave =
    !!check?.valid &&
    !!check.name &&
    !nameMismatch &&
    !saving &&
    (scope === "global" || !!projectRoot);

  const save = async () => {
    if (!check?.name) return;
    setSaving(true);
    try {
      const r = await skills.update({ op: "save", scope, name: check.name, text }, projectRoot);
      toast.success(fixedName ? "Skill saved" : "Skill created", { description: r.changed });
      onSaved(r.changed);
      onOpenChange(false);
    } catch (e) {
      toast.error("Couldn't save the skill", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{fixedName ? `Edit ${fixedName}` : "New skill"}</DialogTitle>
          <DialogDescription>
            SKILL.md: YAML frontmatter (name, description, version, tags, triggers, roles) followed
            by Markdown instructions. Skills are guidance for the agent and never bypass approvals.
          </DialogDescription>
        </DialogHeader>
        {!fixedScope && (
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="sr-only">Where to save</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="scope"
                checked={scope === "global"}
                onChange={() => setScope("global")}
              />
              Global (all projects)
            </label>
            <label className={cn("flex items-center gap-2", !projectRoot && "opacity-50")}>
              <input
                type="radio"
                name="scope"
                disabled={!projectRoot}
                checked={scope === "project"}
                onChange={() => setScope("project")}
              />
              This project (.vard/skills)
            </label>
          </fieldset>
        )}
        <label className="sr-only" htmlFor="skill-text">
          SKILL.md
        </label>
        <textarea
          id="skill-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="min-h-[22rem] flex-1 resize-y rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed outline-none focus:border-primary"
        />
        <div aria-live="polite" className="min-h-10 space-y-1 text-xs">
          {checking && !check ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Checking…
            </span>
          ) : check?.valid && !nameMismatch ? (
            <span className="flex items-center gap-1 text-diff-add">
              <CheckCircle2 className="size-3.5" /> Valid{check.name ? `: ${check.name}` : ""}
            </span>
          ) : (
            <>
              {nameMismatch && (
                <p className="flex items-start gap-1 text-destructive">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" /> The name must stay "{fixedName}".
                  To rename, create a new skill.
                </p>
              )}
              {check?.errors.map((e) => (
                <p key={e} className="flex items-start gap-1 text-destructive">
                  <XCircle className="mt-0.5 size-3.5 shrink-0" /> {e}
                </p>
              ))}
            </>
          )}
          {check?.warnings.map((w) => (
            <p key={w} className="text-muted-foreground">
              ! {w}
            </p>
          ))}
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="min-h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}{" "}
            {fixedName ? "Save" : "Create skill"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
