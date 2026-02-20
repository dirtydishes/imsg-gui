import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createBunSqliteAdapter } from "./adapter-bun-sqlite.js";
import type { DatabaseClient } from "./types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function withDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imsg-parity-"));
  tempDirs.push(dir);
  return path.join(dir, `${name}.db`);
}

function runScenario(db: DatabaseClient) {
  db.exec("CREATE TABLE sample (id TEXT PRIMARY KEY, value INTEGER NOT NULL)");

  const insert = db.prepare("INSERT INTO sample (id, value) VALUES (?, ?)");
  const selectOne = db.prepare("SELECT id, value FROM sample WHERE id = ?");

  const first = insert.run("a", 1);
  const tx = db.transaction(() => {
    insert.run("b", 2);
    insert.run("c", 3);
  });
  tx();

  const update = db.prepare("UPDATE sample SET value = value + 5 WHERE id = ?").run("a");
  const rows = db.prepare("SELECT id, value FROM sample ORDER BY id ASC").all<{ id: string; value: number }>();
  const one = selectOne.get<{ id: string; value: number }>("a");

  db.close();

  return {
    firstChanges: first.changes,
    updateChanges: update.changes,
    rows,
    one,
  };
}

describe("db adapter parity", () => {
  test("keeps stable semantics for core CRUD and transaction operations", () => {
    const bunResult = runScenario(createBunSqliteAdapter(withDbPath("bun"), { create: true }));

    expect(bunResult.rows).toEqual([
      { id: "a", value: 6 },
      { id: "b", value: 2 },
      { id: "c", value: 3 },
    ]);
    expect(bunResult.firstChanges).toBe(1);
    expect(bunResult.updateChanges).toBe(1);
    expect(bunResult.one).toEqual({ id: "a", value: 6 });
  });
});
