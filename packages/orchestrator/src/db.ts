import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../migrations");

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);
  const row = db.prepare(`SELECT MAX(version) AS v FROM schema_version`).get() as { v: number | null };
  const current = row.v ?? 0;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (version <= current) continue;
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN;\n" + sql + `\nINSERT INTO schema_version (version) VALUES (${version});\nCOMMIT;`);
  }
}
