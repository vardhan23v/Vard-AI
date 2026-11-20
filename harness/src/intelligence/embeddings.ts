/**
 * Optional vector search. Off by default; nothing is downloaded. Providers: a local Ollama
 * server (this Mac only), or OpenAI / Google with the user's key. Chunks that look like they
 * contain secrets are never sent, and excluded files are never indexed in the first place.
 */
import { findSecret } from "../memory/secrets";
import { IntelError } from "./errors";
import type { CodeIndex } from "./indexer";
import type { IndexConfig } from "./schema";

export interface EmbeddingProvider {
  /** "provider/model", stored with every vector so a model change re-embeds. */
  id: string;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
}

const MAX_CHUNKS = 20_000;
const BATCH = 32;

export function embeddingProvider(
  cfg: IndexConfig["embeddings"],
  apiKey?: string,
): EmbeddingProvider | null {
  if (cfg.provider === "none") return null;
  if (cfg.provider === "ollama") {
    const base = cfg.baseUrl ?? "http://127.0.0.1:11434";
    const host = new URL(base).hostname;
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host))
      throw new IntelError("embeddings", "Ollama must run on this Mac (localhost).");
    const model = cfg.model ?? "nomic-embed-text";
    return {
      id: `ollama/${model}`,
      async embed(texts, signal) {
        const r = await fetch(`${base}/api/embed`, {
          method: "POST",
          body: JSON.stringify({ model, input: texts }),
          signal,
        });
        if (!r.ok)
          throw new IntelError(
            "embeddings",
            `Ollama: HTTP ${r.status} (is "${model}" pulled? run: ollama pull ${model})`,
          );
        return ((await r.json()) as { embeddings: number[][] }).embeddings;
      },
    };
  }
  if (!apiKey) throw new IntelError("embeddings", `No ${cfg.provider} API key for embeddings.`);
  if (cfg.provider === "openai") {
    const model = cfg.model ?? "text-embedding-3-small";
    return {
      id: `openai/${model}`,
      async embed(texts, signal) {
        const r = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, input: texts }),
          signal,
        });
        if (!r.ok) throw new IntelError("embeddings", `OpenAI embeddings: HTTP ${r.status}`);
        return ((await r.json()) as { data: { embedding: number[] }[] }).data.map(
          (d) => d.embedding,
        );
      },
    };
  }
  const model = cfg.model ?? "text-embedding-004";
  return {
    id: `google/${model}`,
    async embed(texts, signal) {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            requests: texts.map((t) => ({
              model: `models/${model}`,
              content: { parts: [{ text: t }] },
            })),
          }),
          signal,
        },
      );
      if (!r.ok) throw new IntelError("embeddings", `Google embeddings: HTTP ${r.status}`);
      return ((await r.json()) as { embeddings: { values: number[] }[] }).embeddings.map(
        (e) => e.values,
      );
    },
  };
}

const toBlob = (v: number[]) => new Uint8Array(new Float32Array(v).buffer);
const fromBlob = (b: Uint8Array) => new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);

/** Embeds chunks that have no vector for this provider yet (or whose text changed). */
export async function updateEmbeddings(
  ix: CodeIndex,
  p: EmbeddingProvider,
  o: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {},
) {
  const db = ix.db().db;
  db.query("DELETE FROM embeddings WHERE model != ?").run(p.id);
  const todo = db
    .query(
      `SELECT c.id, c.hash, fts.content FROM chunks c JOIN chunks_fts fts ON fts.rowid = c.id
       LEFT JOIN embeddings e ON e.chunk_id = c.id WHERE e.chunk_id IS NULL OR e.hash != c.hash LIMIT ?`,
    )
    .all(MAX_CHUNKS) as { id: number; hash: string; content: string }[];
  const ins = db.query(
    "INSERT OR REPLACE INTO embeddings (chunk_id, model, dims, hash, vec) VALUES (?, ?, ?, ?, ?)",
  );
  let done = 0;
  let skipped = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    if (o.signal?.aborted) throw new IntelError("cancelled", "embedding cancelled");
    const batch = todo.slice(i, i + BATCH).filter((c) => {
      const bad = !c.content.trim() || !!findSecret(c.content);
      if (bad) skipped++;
      return !bad;
    });
    if (batch.length) {
      const vecs = await p.embed(
        batch.map((c) => c.content.slice(0, 2_000)),
        o.signal,
      );
      db.transaction(() =>
        batch.forEach((c, j) => ins.run(c.id, p.id, vecs[j].length, c.hash, toBlob(vecs[j]))),
      )();
    }
    done += batch.length;
    o.onProgress?.(done, todo.length);
  }
  return { embedded: done, skipped };
}

/** Cosine similarity of the query against stored vectors (brute force; fine up to ~20k chunks). */
export async function vectorSearch(
  ix: CodeIndex,
  p: EmbeddingProvider,
  query: string,
  limit = 50,
  signal?: AbortSignal,
) {
  const [q] = await p.embed([query], signal);
  const qv = Float32Array.from(q);
  let qn = 0;
  for (const x of qv) qn += x * x;
  qn = Math.sqrt(qn) || 1;
  const rows = ix
    .db()
    .db.query("SELECT chunk_id, vec FROM embeddings WHERE model = ?")
    .all(p.id) as { chunk_id: number; vec: Uint8Array }[];
  const scored: { chunkId: number; score: number }[] = [];
  for (const r of rows) {
    const v = fromBlob(r.vec);
    if (v.length !== qv.length) continue;
    let dot = 0;
    let vn = 0;
    for (let i = 0; i < v.length; i++) {
      dot += v[i] * qv[i];
      vn += v[i] * v[i];
    }
    scored.push({ chunkId: r.chunk_id, score: dot / (qn * (Math.sqrt(vn) || 1)) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
