import { describe, expect, it } from "vitest";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb } from "../src/store/db.ts";
import { status } from "../src/status.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

async function loadSample() {
  const db = openDb(":memory:");
  const sample = new SampleData(new URL("../data/sample", import.meta.url).pathname);
  const summary = await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, new FakeEmbedder(), "batch"));
  return { db, summary };
}

const folderOf = (db: ReturnType<typeof openDb>, docId: string) =>
  db.prepare("SELECT folder FROM documents WHERE doc_id = ?").pluck().get(docId);

describe("initial load of the sample data", () => {
  it("indexes every document and reports what it could not read", async () => {
    const { db, summary } = await loadSample();
    expect(summary.documents).toBe(21);
    expect(summary.missing).toEqual([]);
    expect(summary.not_searchable).toEqual(["d22"]);
    expect(status(db, "d22")).toMatchObject({ state: "not_searchable" });
  });

  it("labels access from the folder, and reports where the exported list disagrees (T8)", async () => {
    const { db, summary } = await loadSample();
    expect(summary.access_mismatches).toEqual([{ doc_id: "d19", allowed: ["hr-team", "daan"], granted: ["hr-team"] }]);
    expect(folderOf(db, "d10")).toBe("/HR/Payroll");
    expect(folderOf(db, "d05")).toBe("/Public");
  });

  it("stamps the export time as the initial version, with no freshness yet", async () => {
    const { db } = await loadSample();
    expect(status(db, "d02")).toMatchObject({ indexed_version: "2026-10-13T08:00:00+02:00", revision: 1, freshness_seconds: null });
  });

  it("makes image alt text searchable (T14)", async () => {
    const { db } = await loadSample();
    const hits = db.prepare("SELECT rowid FROM passage_fts WHERE passage_fts MATCH 'CTO'").all();
    expect(hits).toHaveLength(1);
  });
});
