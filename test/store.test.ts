import { describe, expect, it } from "vitest";
import { openDb } from "../src/store/db.ts";
import { SCHEMA_VERSION } from "../src/store/schema.ts";
import { status } from "../src/status.ts";

describe("store", () => {
  it("creates every table and records the schema version", () => {
    const db = openDb(":memory:");
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table')").all() as { name: string }[]
    ).map((r) => r.name);
    for (const table of [
      "documents", "passages", "passage_vec", "passage_fts", "principals",
      "memberships", "folder_access", "doc_access", "events", "feed_cursor", "cost_ledger",
    ]) {
      expect(names).toContain(table);
    }
    expect(db.pragma("user_version", { simple: true })).toBe(SCHEMA_VERSION);
  });

  it("deleting a document removes its passages and access labels", () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO documents (doc_id, path, title, folder, version) VALUES ('d1', '/HR/a.md', 'A', '/HR', 'v1')").run();
    db.prepare("INSERT INTO passages (doc_id, ord, text, token_count) VALUES ('d1', 0, 'x', 1)").run();
    db.prepare("INSERT INTO doc_access VALUES ('d1', 'hr-team')").run();
    db.prepare("DELETE FROM documents WHERE doc_id = 'd1'").run();
    expect(db.prepare("SELECT count(*) AS n FROM passages").get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT count(*) AS n FROM doc_access").get()).toEqual({ n: 0 });
  });
});

describe("status", () => {
  it("reports an unknown document as not indexed", () => {
    expect(status(openDb(":memory:"), "nope")).toEqual({ state: "not_indexed", indexed_version: null, indexed_at: null });
  });

  it("reports version, time and revision of an indexed document, and never its path", () => {
    const db = openDb(":memory:");
    db.prepare(
      `INSERT INTO documents (doc_id, path, previous_path, title, folder, version, revision, indexed_at)
       VALUES ('d1', '/HR/a.md', '/Public/a.md', 'A', '/HR', '2026-10-13T14:02:11+02:00', 4, '2026-10-13T14:02:12+02:00')`,
    ).run();
    db.prepare("INSERT INTO passages (doc_id, ord, text, token_count) VALUES ('d1', 0, 'x', 1)").run();
    expect(status(db, "d1")).toEqual({
      state: "indexed",
      indexed_version: "2026-10-13T14:02:11+02:00",
      indexed_at: "2026-10-13T14:02:12+02:00",
      revision: 4,
      freshness_seconds: null,
    });
  });

  it("reports a deleted document as deleted", () => {
    const db = openDb(":memory:");
    db.prepare(
      `INSERT INTO documents (doc_id, path, title, folder, version, indexed_at, deleted)
       VALUES ('d1', '/HR/a.md', 'A', '/HR', 'v2', 't2', 1)`,
    ).run();
    expect(status(db, "d1")).toEqual({ state: "deleted", indexed_version: "v2", indexed_at: "t2" });
  });
});
