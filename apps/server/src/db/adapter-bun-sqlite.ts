import { Database } from "bun:sqlite";
import type { DatabaseClient, OpenDatabaseOptions, PreparedStatement, RunResult, SqlValue } from "./types.js";

class BunPreparedStatement implements PreparedStatement {
  constructor(private readonly statement: ReturnType<Database["query"]>) {}

  run(...params: SqlValue[]): RunResult {
    const result = this.statement.run(...params);
    return {
      changes: Number((result as { changes?: number }).changes ?? 0),
      lastInsertRowid: (result as { lastInsertRowid?: number | bigint }).lastInsertRowid,
    };
  }

  get<T = unknown>(...params: SqlValue[]): T | undefined {
    return this.statement.get(...params) as T | undefined;
  }

  all<T = unknown>(...params: SqlValue[]): T[] {
    return this.statement.all(...params) as T[];
  }
}

class BunDatabaseClient implements DatabaseClient {
  constructor(private readonly db: Database) {}

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(statement: string): void {
    this.db.exec(`PRAGMA ${statement}`);
  }

  prepare(sql: string): PreparedStatement {
    return new BunPreparedStatement(this.db.query(sql));
  }

  transaction<T>(fn: () => T): () => T {
    const wrapped = this.db.transaction(fn);
    return () => wrapped();
  }

  close(): void {
    this.db.close();
  }
}

export function createBunSqliteAdapter(dbPath: string, options?: OpenDatabaseOptions): DatabaseClient {
  const db = new Database(dbPath, {
    readonly: options?.readonly ?? false,
    create: options?.create ?? true,
  });

  return new BunDatabaseClient(db);
}
