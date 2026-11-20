/**
 * Global browser settings (<VARD_HOME or ~/.vard>/browser.json) and the project's remembered
 * browser origins (the "always" answers kept in <project>/.vard/policy.json).
 */
import fs from "node:fs";
import path from "node:path";
import { vardHome } from "../mcp/config";
import type { RulesStore } from "../policy";
import { cleanArtifacts, runFolder } from "./artifacts";
import { BrowserSettings } from "./schema";

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = { artifactRetentionDays: 0 };

export const browserSettingsPath = (home = vardHome()) => path.join(home, "browser.json");

export function loadBrowserSettings(home = vardHome()): BrowserSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(browserSettingsPath(home), "utf8"));
    const p = BrowserSettings.partial().safeParse(raw);
    return { ...DEFAULT_BROWSER_SETTINGS, ...(p.success ? p.data : {}) };
  } catch {
    return { ...DEFAULT_BROWSER_SETTINGS };
  }
}

export function saveBrowserSettings(settings: BrowserSettings, home = vardHome()): BrowserSettings {
  const s = BrowserSettings.parse(settings);
  fs.mkdirSync(home, { recursive: true });
  const file = browserSettingsPath(home);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return s;
}

/**
 * Applies the retention setting to one project: deletes artifact runs older than N days, except
 * the runs named in `keepRuns` (tasks still running). Does nothing when retention is 0.
 */
export function applyRetention(
  projectRoot: string,
  o: { home?: string; keepRuns?: string[] } = {},
): { removed: number; bytes: number } {
  const { artifactRetentionDays: days } = loadBrowserSettings(o.home);
  if (!days) return { removed: 0, bytes: 0 };
  return cleanArtifacts(projectRoot, {
    olderThanDays: days,
    keepRuns: (o.keepRuns ?? []).map(runFolder),
  });
}

/** The origins the user allowed with "always" for this project. */
export function listOrigins(store: RulesStore): string[] {
  return [...(store.load().browserOrigins ?? [])];
}

/** Forgets one remembered origin; returns what's left. */
export function removeOrigin(store: RulesStore, origin: string): string[] {
  const rules = store.load();
  const drop = new Set([origin, origin.replace(/\/+$/, "")]);
  try {
    drop.add(new URL(origin).origin);
  } catch {}
  const left = (rules.browserOrigins ?? []).filter((o) => !drop.has(o));
  if (left.length !== (rules.browserOrigins ?? []).length)
    store.save({ ...rules, browserOrigins: left });
  return left;
}
