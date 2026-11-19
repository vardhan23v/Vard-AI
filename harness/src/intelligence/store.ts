/**
 * The index: one SQLite database per project (<project>/.vard/index/index.db) using Bun's
 * built-in driver. Versioned; a corrupt or outdated database is rebuilt from scratch.
 */
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { ensureVardDir } from "../policy";
import { indexDir } from "./config";

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY, path TEXT UNIQUE NOT NULL, lang TEXT NOT NULL, size INTEGER, mtime INTEGER,
  hash TEXT, lines INTEGER, error TEXT, test INTEGER DEFAULT 0, indexed_at INTEGER
);
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
  start_line INTEGER, end_line INTEGER, exported INTEGER, parent TEXT, signature TEXT
);
CREATE TABLE IF NOT EXISTS refs (file_id INTEGER NOT NULL, name TEXT NOT NULL, line INTEGER, kind TEXT);
CREATE TABLE IF NOT EXISTS imports (
  file_id INTEGER NOT NULL, source TEXT NOT NULL, names TEXT, line INTEGER, target_id INTEGER, package TEXT
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY, file_id INTEGER NOT NULL, start_line INTEGER, end_line INTEGER, symbol TEXT, hash TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(path, symbol, content, tokenize = 'porter unicode61');
CREATE TABLE IF NOT EXISTS embeddings (chunk_id INTEGER PRIMARY KEY, model TEXT NOT NULL, dims INTEGER, hash TEXT, vec BLOB);
CREATE INDEX IF NOT EXISTS symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS symbols_file ON symbols(file_id);
CREATE INDEX IF NOT EXISTS refs_name ON refs(name);
CREATE INDEX IF NOT EXISTS refs_file ON refs(file_id);
CREATE INDEX IF NOT EXISTS imports_file ON imports(file_id);
CREATE INDEX IF NOT EXISTS imports_target ON imports(target_id);
CREATE INDEX IF NOT EXISTS chunks_file ON chunks(file_id);
`;

export const dbPath = (projectRoot: string) => path.join(indexDir(projectRoot), "index.db");

export class IndexStore {
  readonly db: Database;
  /** True when an unusable database was found and replaced. */
  readonly recovered: boolean;

  constructor(readonly projectRoot: string) {
    ensureVardDir(projectRoot);
    fs.mkdirSync(indexDir(projectRoot), { recursive: true });
    const file = dbPath(projectRoot);
    let recovered = false;
    let db: Database | null = null;
    try {
      db = new Database(file, { create: true });
      const ok = (db.query("PRAGMA quick_check").get() as { quick_check: string } | null)?.quick_check === "ok";
      db.exec(SCHEMA);
      const v = (db.query("SELECT value FROM meta WHERE key = 'schema'").get() as { value: string } | null)?.value;
      if (!ok || (v && Number(v) !== SCHEMA_VERSION)) throw new Error("rebuild");
    } catch {
      try {
        db?.close();
      } catch {}
      for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
      db = new Database(file, { create: true });
      db.exec(SCHEMA);
      recovered = true;
    }
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;");
    db.query("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)").run(String(SCHEMA_VERSION));
    this.db = db;
    this.recovered = recovered;
  }

  meta(key: string): string | undefined {
    return (this.db.query("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | null)?.value;
  }
  setMeta(key: string, value: string) {
    this.db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }

  /** Removes everything stored for a file (before re-indexing or after deletion). */
  clearFile(fileId: number) {
    this.db.query("DELETE FROM symbols WHERE file_id = ?").run(fileId);
    this.db.query("DELETE FROM refs WHERE file_id = ?").run(fileId);
    this.db.query("DELETE FROM imports WHERE file_id = ?").run(fileId);
    const chunkIds = this.db.query("SELECT id FROM chunks WHERE file_id = ?").all(fileId) as { id: number }[];
    for (const { id } of chunkIds) {
      this.db.query("DELETE FROM chunks_fts WHERE rowid = ?").run(id);
      this.db.query("DELETE FROM embeddings WHERE chunk_id = ?").run(id);
    }
    this.db.query("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }

  bytes(): number {
    let n = 0;
    for (const f of [dbPath(this.projectRoot), `${dbPath(this.projectRoot)}-wal`])
      try {
        n += fs.statSync(f).size;
      } catch {}
    return n;
  }

  close() {
    try {
      this.db.close();
    } catch {}
  }
}

/** Deletes a project's index (database and config stay separate from project memory). */
export function deleteIndex(projectRoot: string) {
  const file = dbPath(projectRoot);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
}
