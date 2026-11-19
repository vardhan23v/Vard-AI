/** One CodeIndex (and optional watcher) per project, shared by tasks, the UI and the CLI. */
import { loadIndexConfig } from "./config";
import { embeddingProvider, type EmbeddingProvider } from "./embeddings";
import { CodeIndex } from "./indexer";
import type { IndexStatus } from "./schema";
import { IndexWatcher } from "./watcher";
import path from "node:path";

export interface CodeIntelOptions {
  onStatus?: (s: IndexStatus) => void;
  onProgress?: (projectRoot: string, done: number, total: number) => void;
}

export class CodeIntel {
  private indexes = new Map<string, CodeIndex>();
  private watchers = new Map<string, IndexWatcher>();
  /** Embedding keys handed over by the app/CLI per project (never stored). */
  private keys = new Map<string, string>();

  constructor(private o: CodeIntelOptions = {}) {}

  get(projectRoot: string): CodeIndex {
    const root = path.resolve(projectRoot);
    let ix = this.indexes.get(root);
    if (!ix) {
      ix = new CodeIndex(root);
      this.indexes.set(root, ix);
    }
    return ix;
  }

  setEmbeddingKey(projectRoot: string, key?: string) {
    if (key) this.keys.set(path.resolve(projectRoot), key);
  }

  embeddings(projectRoot: string): EmbeddingProvider | null {
    try {
      return embeddingProvider(loadIndexConfig(projectRoot).embeddings, this.keys.get(path.resolve(projectRoot)));
    } catch {
      return null;
    }
  }

  async build(projectRoot: string, o: { force?: boolean; signal?: AbortSignal } = {}) {
    const ix = this.get(projectRoot);
    try {
      const r = await ix.build({ ...o, onProgress: (d, t) => this.o.onProgress?.(ix.projectRoot, d, t) });
      this.o.onStatus?.(ix.status());
      return r;
    } catch (e) {
      ix.lastError = (e as Error).message;
      this.o.onStatus?.(ix.status());
      throw e;
    }
  }

  /**
   * Makes sure a task can use the index: updates it (or builds it the first time), waiting at most
   * `budgetMs`. Past that the build continues in the background and tools say so.
   */
  async ensure(projectRoot: string, budgetMs = 20_000): Promise<"ready" | "building"> {
    const p = this.build(projectRoot).then(
      () => "ready" as const,
      () => "ready" as const,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"building">((r) => (timer = setTimeout(() => r("building"), budgetMs)));
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  watch(projectRoot: string) {
    const ix = this.get(projectRoot);
    if (!loadIndexConfig(ix.projectRoot).watch || this.watchers.has(ix.projectRoot)) return;
    const w = new IndexWatcher(ix, () => this.o.onStatus?.(ix.status()));
    w.start();
    this.watchers.set(ix.projectRoot, w);
  }

  unwatch(projectRoot: string) {
    const root = path.resolve(projectRoot);
    this.watchers.get(root)?.stop();
    this.watchers.delete(root);
  }

  closeAll() {
    for (const w of this.watchers.values()) w.stop();
    this.watchers.clear();
    for (const ix of this.indexes.values()) ix.close();
    this.indexes.clear();
  }
}
