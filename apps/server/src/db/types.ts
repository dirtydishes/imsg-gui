export type SqlValue = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface PreparedStatement {
  run(...params: SqlValue[]): RunResult;
  get<T = unknown>(...params: SqlValue[]): T | undefined;
  all<T = unknown>(...params: SqlValue[]): T[];
}

export interface DatabaseClient {
  exec(sql: string): void;
  pragma(statement: string): void;
  prepare(sql: string): PreparedStatement;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

export interface OpenDatabaseOptions {
  readonly?: boolean;
  create?: boolean;
}
