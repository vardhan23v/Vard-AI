/** CLI settings and history under ~/.vard (or $VARD_HOME). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CHOICE, type ModelChoice } from "../catalog";

export type CliConfig = ModelChoice & { planFirst: boolean };

export function vardHome(env: Record<string, string | undefined> = process.env) {
  return env.VARD_HOME || path.join(os.homedir(), ".vard");
}

export class ConfigStore {
  constructor(readonly home: string) {}

  get file() {
    return path.join(this.home, "cli.json");
  }

  load(): CliConfig {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      return {
        provider: raw.provider ?? DEFAULT_CHOICE.provider,
        model: raw.model ?? DEFAULT_CHOICE.model,
        planFirst: raw.planFirst ?? true,
      };
    } catch {
      return { ...DEFAULT_CHOICE, planFirst: true };
    }
  }

  save(cfg: CliConfig) {
    fs.mkdirSync(this.home, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(cfg, null, 2) + "\n");
  }
}
