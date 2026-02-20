import fs from "node:fs";
import path from "node:path";
import { createBunSqliteAdapter } from "./adapter-bun-sqlite.js";
import { migrate } from "./schema.js";
import type { DatabaseClient } from "./types.js";

export const DB_ADAPTER_MODE = "bun" as const;

export function openAppDb(baseDir: string): DatabaseClient {
  const dataDir = path.resolve(baseDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, "imsg.db");
  const db = createBunSqliteAdapter(dbPath, { create: true });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}
