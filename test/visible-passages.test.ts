// Leak tests for the access filter. Each one tries to see something that must stay hidden.
import { beforeAll, describe, expect, it } from "vitest";
import { principalsOf, visiblePassageIds } from "../src/access/visible-passages.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb, type Db } from "../src/store/db.ts";
import { status } from "../src/status.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

let db: Db;

beforeAll(async () => {
  db = openDb(":memory:");
  const sample = new SampleData(new URL("../data/sample", import.meta.url).pathname);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, new FakeEmbedder(), "batch"));
});

/** Which documents a user can read, from the passages the filter lets through. */
function visibleDocs(userId: string): string[] {
  const ids = visiblePassageIds(db, userId);
  if (ids.length === 0) return [];
  const rows = db
    .prepare(`SELECT DISTINCT doc_id FROM passages WHERE passage_id IN (${ids.map(() => "?").join(",")}) ORDER BY doc_id`)
    .pluck()
    .all(...ids) as string[];
  return rows;
}

describe("principalsOf", () => {
  it("is the user plus every group they belong to", () => {
    expect([...principalsOf(db, "anouk")].sort()).toEqual(["all-staff", "anouk", "hr-team", "management"]);
  });

  it("is empty for an unknown user (T9)", () => {
    expect(principalsOf(db, "ghost")).toEqual([]);
  });

  it("is empty for a group's id used as a user id", () => {
    expect(principalsOf(db, "all-staff")).toEqual([]);
  });
});

describe("visiblePassageIds", () => {
  it("lets HR read HR documents but not payroll (T10)", () => {
    const docs = visibleDocs("anouk");
    expect(docs).toContain("d08");
    expect(docs).not.toContain("d10");
    expect(docs).not.toContain("d11");
  });

  it("ignores a name on a document's own list when the folder says otherwise (T8)", () => {
    expect(visibleDocs("daan")).not.toContain("d19");
  });

  it("shows nothing to an unknown user (T9)", () => {
    expect(visiblePassageIds(db, "ghost")).toEqual([]);
  });

  it("shows nothing to a removed user still named directly on a document", () => {
    db.prepare("INSERT INTO doc_access (doc_id, principal_id) VALUES ('d18', 'olaf')").run();
    expect(visiblePassageIds(db, "olaf")).toEqual([]);
  });

  it("drops a group's documents the moment the user leaves the group (T12)", () => {
    expect(visibleDocs("bram")).toContain("d12");
    db.prepare("DELETE FROM memberships WHERE user_id = 'bram' AND group_id = 'finance-team'").run();
    expect(visibleDocs("bram")).not.toContain("d12");
  });
});

describe("status seen by a user", () => {
  it("shows a document the user may open", () => {
    expect(status(db, "d10", "sanne")).toMatchObject({ state: "indexed" });
  });

  it("answers exactly like an unknown document when the user may not open it", () => {
    expect(status(db, "d10", "anouk")).toEqual(status(db, "no-such-doc"));
    expect(status(db, "d10", "ghost")).toEqual(status(db, "no-such-doc"));
  });
});
