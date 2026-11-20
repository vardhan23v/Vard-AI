/** Re-indexes a project shortly after files change (debounced), until stopped. */
import fs from "node:fs";
import type { CodeIndex } from "./indexer";

const IGNORE = /(^|\/)(\.git|\.vard|node_modules|dist|build|target|\.next|coverage)(\/|$)/;

export class IndexWatcher {
  private watcher: fs.FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private index: CodeIndex,
    private onUpdate?: () => void,
    private debounceMs = 1_500,
  ) {}

  start() {
    if (this.watcher) return;
    try {
      this.watcher = fs.watch(this.index.projectRoot, { recursive: true }, (_e, file) => {
        if (file && IGNORE.test(String(file))) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.index.build().then(
            () => this.onUpdate?.(),
            () => {},
          );
        }, this.debounceMs);
      });
      this.watcher.on("error", () => this.stop());
    } catch {
      this.watcher = null;
    }
  }

  get active() {
    return !!this.watcher;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }
}
