// A rename alone changes no text, so nothing is re-embedded; the title the source gives must
// still follow, or answers would cite the new path under the old name.
import { beforeAll, expect, it } from "vitest";
import { EventLog } from "../src/feed/event-log.ts";
import { Reconciler } from "../src/feed/reconciler.ts";
import { FeedWatcher } from "../src/feed/watcher.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import type { DocumentSource, FeedReader } from "../src/ports.ts";
import { parseFeedEvent } from "../src/sources/feed-format.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb, type Db } from "../src/store/db.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

let db: Db;
let watcher: FeedWatcher;
const sample = new SampleData(new URL("../data/sample", import.meta.url).pathname);
const rename = { doc_id: "d04", path: "/Public/handbook/working-from-home.md", modified_at: "2026-10-16T10:01:30.000+02:00", action: "rename" };

beforeAll(async () => {
  db = openDb(":memory:");
  const indexer = new Indexer(db, new FakeEmbedder(), "realtime");
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, indexer);
  const reader: FeedReader = { poll: () => Promise.resolve({ events: [parseFeedEvent(rename)], cursor: "1" }) };
  // The client's source: same text as before, a title that follows the new name.
  const documents: DocumentSource = {
    read: async (docId) => {
      const current = await sample.read(docId);
      return current && docId === "d04" ? { ...current, title: "Working from home" } : current;
    },
  };
  const log = new EventLog(db);
  watcher = new FeedWatcher(db, reader, log, new Reconciler(db, indexer, documents, log), { now: () => Date.parse(rename.modified_at) + 5000 });
});

it("takes the source's new title on a rename, without re-embedding", async () => {
  const passagesBefore = db.prepare("SELECT passage_id FROM passages WHERE doc_id = 'd04' ORDER BY passage_id").pluck().all();
  await watcher.tick();
  expect(db.prepare("SELECT path, title FROM documents WHERE doc_id = 'd04'").get()).toEqual({
    path: "/Public/handbook/working-from-home.md",
    title: "Working from home",
  });
  expect(db.prepare("SELECT passage_id FROM passages WHERE doc_id = 'd04' ORDER BY passage_id").pluck().all()).toEqual(passagesBefore);
});
