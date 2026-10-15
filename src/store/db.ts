import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { SCHEMA, SCHEMA_VERSION } from "./schema.ts";

export type Db = Database.Database;

/** Opens (and creates if needed) the store. Pass ":memory:" for tests. */
export function openDb(path: string): Db {
  const db = new Database(path);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  if (current === SCHEMA_VERSION) return;
  if (current !== 0) {
    throw new Error(
      `Store schema v${current} does not match v${SCHEMA_VERSION}. Delete the file and re-ingest: the store is derived data.`,
    );
  }
  db.transaction(() => {
    db.exec(SCHEMA);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  })();
}
