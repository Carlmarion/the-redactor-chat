// Spike for decision 0003: can a sqlite-vec nearest-neighbour search be restricted
// to the passages a user may see, inside the query?
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

function setup() {
  const db = new Database(":memory:");
  sqliteVec.load(db);
  db.exec("CREATE VIRTUAL TABLE v USING vec0(embedding float[2] distance_metric=cosine)");
  db.exec("CREATE TABLE visible (passage_id INTEGER PRIMARY KEY)");
  const insert = db.prepare("INSERT INTO v(rowid, embedding) VALUES (?, ?)");
  // Passage 1 is closest to the query, but the user may only see 2 and 3.
  insert.run(1n, new Float32Array([1, 0]));
  insert.run(2n, new Float32Array([0.9, 0.4]));
  insert.run(3n, new Float32Array([0, 1]));
  db.exec("INSERT INTO visible VALUES (2), (3)");
  return db;
}

const query = new Float32Array([1, 0]);

describe("sqlite-vec filtered KNN", () => {
  it("without a filter, the hidden passage wins", () => {
    const rows = setup()
      .prepare("SELECT rowid FROM v WHERE embedding MATCH ? AND k = 2 ORDER BY distance")
      .all(query) as { rowid: number }[];
    expect(rows.map((r) => r.rowid)).toEqual([1, 2]);
  });

  it("restricts the search with rowid IN (subquery) before ranking", () => {
    const rows = setup()
      .prepare(
        `SELECT rowid FROM v
         WHERE embedding MATCH ? AND k = 2
           AND rowid IN (SELECT passage_id FROM visible)
         ORDER BY distance`,
      )
      .all(query) as { rowid: number }[];
    expect(rows.map((r) => r.rowid)).toEqual([2, 3]);
  });
});
