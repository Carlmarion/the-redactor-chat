import { describe, expect, it } from "vitest";
import { Indexer, type DocumentState } from "../src/ingest/indexer.ts";
import { openDb } from "../src/store/db.ts";
import { replacePermissions } from "../src/store/permissions.ts";
import { status } from "../src/status.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

function setup() {
  const db = openDb(":memory:");
  replacePermissions(db, {
    users: ["anouk"],
    groups: { "all-staff": ["anouk"], "hr-team": ["anouk"] },
    folders: { "/Public": ["all-staff"], "/HR": ["hr-team"] },
  });
  return { db, indexer: new Indexer(db, new FakeEmbedder(), "batch") };
}

const leave: DocumentState = {
  doc_id: "d02",
  path: "/Public/leave.md",
  title: "Leave policy",
  url: null,
  text: "# Leave\n\nEveryone gets 25 days of paid leave per year.",
  version: "2026-10-13T08:00:00+02:00",
  source_event_id: null,
};

const count = (db: ReturnType<typeof openDb>, table: string) =>
  db.prepare(`SELECT count(*) FROM ${table}`).pluck().get();

describe("Indexer", () => {
  it("writes passages, vectors, keywords and access labels together", async () => {
    const { db, indexer } = setup();
    expect(await indexer.index(leave)).toEqual({ passages: 1, searchable: true });
    expect([count(db, "passages"), count(db, "passage_vec"), count(db, "passage_fts")]).toEqual([1, 1, 1]);
    expect(db.prepare("SELECT principal_id FROM doc_access").pluck().all()).toEqual(["all-staff"]);
  });

  it("replaces the old state: no orphan vectors or keywords, revision up, previous path kept", async () => {
    const { db, indexer } = setup();
    await indexer.index(leave);
    await indexer.index({ ...leave, path: "/HR/leave.md", text: "Everyone gets 27 days of paid leave per year now.", version: "v2" });

    expect([count(db, "passages"), count(db, "passage_vec"), count(db, "passage_fts")]).toEqual([1, 1, 1]);
    expect(db.prepare("SELECT text FROM passage_fts WHERE passage_fts MATCH '27'").pluck().all()).toHaveLength(1);
    expect(db.prepare("SELECT text FROM passage_fts WHERE passage_fts MATCH '25'").pluck().all()).toHaveLength(0);
    expect(db.prepare("SELECT principal_id FROM doc_access").pluck().all()).toEqual(["hr-team"]);
    expect(status(db, "d02")).toMatchObject({ state: "indexed", indexed_version: "v2", revision: 2, previous_path: "/Public/leave.md" });
  });

  it("indexes a document without readable text as not searchable", async () => {
    const { db, indexer } = setup();
    expect(await indexer.index({ ...leave, doc_id: "d22", text: "![](scan.png)" })).toEqual({ passages: 0, searchable: false });
    expect(status(db, "d22")).toMatchObject({ state: "not_searchable", reason: "no_readable_text" });
  });

  it("measures freshness from the feed event that brought the change", async () => {
    const { db, indexer } = setup();
    const receivedAt = new Date(Date.now() - 1500).toISOString();
    const eventId = db
      .prepare("INSERT INTO events (received_at, kind, payload) VALUES (?, 'document', '{}')")
      .run(receivedAt).lastInsertRowid;
    await indexer.index({ ...leave, source_event_id: Number(eventId) });
    const result = status(db, "d02");
    if (result.state !== "indexed") throw new Error(result.state);
    expect(result.freshness_seconds).toBeGreaterThanOrEqual(1.5);
    expect(result.freshness_seconds).toBeLessThan(5);
  });
});
