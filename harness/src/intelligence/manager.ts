/** One CodeIndex (and optional watcher) per project, shared by tasks, the UI and the CLI. */
import { loadIndexConfig } from "./config";
import { embeddingProvider, updateEmbeddings, type EmbeddingProvider } from "./embeddings";
import { CodeIndex } from "./indexer";
import type { IndexStatus } from "./schema";
import { IndexWatcher } from "./watcher";
import path from "node:path";

export interface CodeIntelOptions {
  onStatus?: (s: IndexStatus) => void;
  onProgress?: (projectRoot: string, done: number, total: number) => void;
  /** Overrides the configured embedding provider (tests). */
  embeddingsFor?: (projectRoot: string) => EmbeddingProvider | null;
}

export class CodeIntel {
  private indexes = new Map<string, CodeIndex>();
  private watchers = new Map<string, IndexWatcher>();
  /** Embedding keys handed over by the app/CLI per project (never stored). */
  private keys = new Map<string, string>();
  /** Background embedding refreshes, one per project (a second request reruns once after it). */
  private embedding = new Map<string, { run: Promise<void>; again: boolean; ctrl: AbortController }>();

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
    if (this.o.embeddingsFor) return this.o.embeddingsFor(path.resolve(projectRoot));
    try {
      return embeddingProvider(loadIndexConfig(projectRoot).embeddings, this.keys.get(path.resolve(projectRoot)));
    } catch {
      return null;
    }
  }

  /**
   * Embeds chunks that changed since the last embedding pass, in the background, when the project
   * has embeddings set up (and a key, for hosted providers). Never throws; failures are logged and
   * kept as the index's last error. Sensitive files are never indexed, and secret-looking chunks
   * are skipped by updateEmbeddings. Resolves when the pass (and any queued rerun) is done.
   */
  refreshEmbeddings(projectRoot: string): Promise<void> {
    const root = path.resolve(projectRoot);
    const running = this.embedding.get(root);
    if (running) {
      running.again = true;
      return running.run;
    }
    const p = this.embeddings(root);
    if (!p) return Promise.resolve();
    const ix = this.get(root);
    const entry = { run: Promise.resolve(), again: false, ctrl: new AbortController() };
    entry.run = (async () => {
      try {
        do {
          entry.again = false;
          if (!ix.exists()) break;
          await updateEmbeddings(ix, p, { signal: entry.ctrl.signal });
        } while (entry.again && !entry.ctrl.signal.aborted);
      } catch (e) {
        if (entry.ctrl.signal.aborted) return;
        ix.lastError = `embeddings: ${(e as Error).message}`;
        console.error(`vard: embedding update failed for ${root}: ${(e as Error).message}`);
      } finally {
        this.embedding.delete(root);
      }
    })();
    this.embedding.set(root, entry);
    return entry.run;
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
      () => {
        // Keep vectors in step with the code; never makes the task wait.
        void this.refreshEmbeddings(projectRoot);
        return "ready" as const;
      },
      () => "ready" as const,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"building">((r) => (timer = setTimeout(() => r("building"), budgetMs)));
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  watch(projectRoot: string) {
    const ix = this.get(projectRoot);
    if (!loadIndexConfig(ix.projectRoot).watch || this.watchers.has(ix.projectRoot)) return;
    const w = new IndexWatcher(ix, () => {
      this.o.onStatus?.(ix.status());
      void this.refreshEmbeddings(ix.projectRoot);
    });
    w.start();
    this.watchers.set(ix.projectRoot, w);
  }

  unwatch(projectRoot: string) {
    const root = path.resolve(projectRoot);
    this.watchers.get(root)?.stop();
    this.watchers.delete(root);
  }

  closeAll() {
    for (const e of this.embedding.values()) e.ctrl.abort();
    this.embedding.clear();
    for (const w of this.watchers.values()) w.stop();
    this.watchers.clear();
    for (const ix of this.indexes.values()) ix.close();
    this.indexes.clear();
  }
}
