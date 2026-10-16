// The scripted day, replayed on a fake clock: every trap of the feed, in order.
import { beforeAll, describe, expect, it } from "vitest";
import { visiblePassageIds } from "../src/access/visible-passages.ts";
import { EventLog } from "../src/feed/event-log.ts";
import { Reconciler } from "../src/feed/reconciler.ts";
import { FeedWatcher } from "../src/feed/watcher.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import type { DocumentSource, FeedReader } from "../src/ports.ts";
import { FeedScript } from "../src/simulator/feed-script.ts";
import { parseFeedEvent } from "../src/sources/feed-format.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb, type Db } from "../src/store/db.ts";
import { status } from "../src/status.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

const dataDir = new URL("../data/sample", import.meta.url).pathname;
const start = new Date("2026-10-16T10:00:00+02:00").getTime();
let now = start;
let db: Db;
let watcher: FeedWatcher;

/** Moves the clock to `seconds` after the start and lets the watcher run one round. */
async function at(seconds: number) {
  now = start + seconds * 1000;
  await watcher.tick();
}

const principalsOf = (docId: string) =>
  db.prepare("SELECT principal_id FROM doc_access WHERE doc_id = ? ORDER BY principal_id").pluck().all(docId);
const seesDoc = (user: string, docId: string) => {
  const ids = visiblePassageIds(db, user);
  return ids.length > 0 && db.prepare(`SELECT 1 FROM passages WHERE doc_id = ? AND passage_id IN (${ids.join(",")})`).get(docId) !== undefined;
};
const outcomes = (docId: string) =>
  db.prepare("SELECT outcome FROM events WHERE doc_id = ? ORDER BY event_id").pluck().all(docId);

beforeAll(async () => {
  db = openDb(":memory:");
  const sample = new SampleData(dataDir);
  const indexer = new Indexer(db, new FakeEmbedder(), "realtime");
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, indexer);

  const script = await FeedScript.load(dataDir, new Date(start), sample);
  const reader: FeedReader = {
    poll: (cursor) => {
      const page = script.eventsSince(cursor, now);
      return Promise.resolve({ events: page.events.map(parseFeedEvent), cursor: page.cursor });
    },
  };
  const documents: DocumentSource = { read: (docId) => script.documentAt(docId, now) };
  const log = new EventLog(db);
  watcher = new FeedWatcher(db, reader, log, new Reconciler(db, indexer, documents, log), { now: () => now });
});

describe("the scripted day", () => {
  it("T3: an edit is re-indexed and stamped with the event's time", async () => {
    await at(10);
    expect(db.prepare("SELECT count(*) FROM passage_fts WHERE passage_fts MATCH '27'").pluck().get()).toBeGreaterThan(0);
    expect(status(db, "d02")).toMatchObject({ indexed_version: "2026-10-16T10:00:10.000+02:00", revision: 2 });
  });

  it("T1: a move into a narrower folder applies at once", async () => {
    await at(20);
    expect(principalsOf("d05")).toEqual(["payroll"]);
    expect(seesDoc("emma", "d05")).toBe(false);
    expect(seesDoc("sanne", "d05")).toBe(true);
  });

  it("T2: a move into a wider folder waits for a quiet second, then applies and is logged", async () => {
    await at(30);
    expect(principalsOf("d17")).toEqual(["management"]);
    await at(31.5);
    expect(principalsOf("d17")).toEqual(["all-staff"]);
    const log = db.prepare("SELECT people_before, people_after, widened FROM access_log WHERE doc_id = 'd17'").get();
    expect(log).toEqual({ people_before: 2, people_after: 8, widened: 1 });
  });

  it("T4: a duplicate and a stale event are ignored", async () => {
    await at(40);
    await at(45);
    expect(status(db, "d02")).toMatchObject({ revision: 2 });
    expect(db.prepare("SELECT path FROM documents WHERE doc_id = 'd07'").pluck().get()).toBe("/Public/it/password-policy.md");
    expect(outcomes("d07")).toEqual(["ignored"]);
  });

  it("T5: move, edit, move within a second: one final state, never public on the way", async () => {
    for (const s of [50, 50.5, 51, 52.5]) {
      await at(s);
      expect(principalsOf("d20")).not.toContain("all-staff");
    }
    expect(db.prepare("SELECT path FROM documents WHERE doc_id = 'd20'").pluck().get()).toBe("/Engineering/platform/architecture.md");
    expect(status(db, "d20")).toMatchObject({ indexed_version: "2026-10-16T10:00:51.000+02:00", revision: 2 });
  });

  it("T12: someone who leaves a team loses its documents at once", async () => {
    expect(seesDoc("bram", "d12")).toBe(true);
    await at(60);
    expect(seesDoc("bram", "d12")).toBe(false);
  });

  it("T6: a deleted document disappears everywhere", async () => {
    await at(70);
    expect(status(db, "d16")).toMatchObject({ state: "deleted" });
    expect(db.prepare("SELECT count(*) FROM passages WHERE doc_id = 'd16'").pluck().get()).toBe(0);
    expect(seesDoc("emma", "d16")).toBe(false);
  });

  it("C4: a created document is indexed, titled from its first heading, after its quiet second", async () => {
    await at(80);
    expect(status(db, "d21")).toMatchObject({ state: "not_indexed" });
    await at(81.5);
    expect(status(db, "d21")).toMatchObject({ state: "indexed" });
    expect(seesDoc("yusuf", "d21")).toBe(true);
  });

  it("C4: an unknown action is reconciled like any other", async () => {
    await at(90);
    expect(db.prepare("SELECT path, previous_path FROM documents WHERE doc_id = 'd04'").get()).toEqual({
      path: "/Public/handbook/working-from-home.md",
      previous_path: "/Public/handbook/remote-work.md",
    });
    expect(outcomes("d04")).toEqual(["relabeled"]);
  });

  it("leaves nothing pending at the end of the day", async () => {
    await at(100);
    expect(db.prepare("SELECT count(*) FROM events WHERE outcome IS NULL").pluck().get()).toBe(0);
  });
});
