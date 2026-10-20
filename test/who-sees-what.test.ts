// What the demo shows about access must say exactly what the access filter lets through.
import { beforeAll, describe, expect, it } from "vitest";
import { mayOpenDocument } from "../src/access/visible-passages.ts";
import { foldersSeenBy, people } from "../src/access/who-sees-what.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb, type Db } from "../src/store/db.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

let db: Db;

beforeAll(async () => {
  db = openDb(":memory:");
  const sample = new SampleData(new URL("../data/sample", import.meta.url).pathname);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, new FakeEmbedder(), "batch"));
});

describe("people", () => {
  it("lists every user with their groups, and no group as a person", () => {
    const list = people(db);
    expect(list.map((p) => p.userId)).toEqual(["anouk", "bram", "daan", "emma", "joost", "lotte", "sanne", "yusuf"]);
    expect(list.find((p) => p.userId === "anouk")?.groups).toEqual(["all-staff", "hr-team", "management"]);
  });
});

describe("foldersSeenBy", () => {
  it("shows HR's folders but not payroll to an HR member (T10)", () => {
    const folders = foldersSeenBy(db, "anouk").map((f) => f.folder);
    expect(folders).toContain("/HR");
    expect(folders).not.toContain("/HR/Payroll");
  });

  it("shows payroll only to payroll", () => {
    expect(foldersSeenBy(db, "sanne").map((f) => f.folder)).toContain("/HR/Payroll");
  });

  it("shows nothing to an unknown user or a group's id (T9)", () => {
    expect(foldersSeenBy(db, "ghost")).toEqual([]);
    expect(foldersSeenBy(db, "all-staff")).toEqual([]);
  });

  it("counts exactly the documents the filter lets each person open", () => {
    const docIds = db.prepare("SELECT doc_id FROM documents WHERE deleted = 0").pluck().all() as string[];
    for (const { userId } of people(db)) {
      const counted = foldersSeenBy(db, userId).reduce((sum, f) => sum + f.documents, 0);
      expect(counted, userId).toBe(docIds.filter((id) => mayOpenDocument(db, id, userId)).length);
    }
  });
});
