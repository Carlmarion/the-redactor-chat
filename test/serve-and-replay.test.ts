import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EventLog } from "../src/feed/event-log.ts";
import { Reconciler } from "../src/feed/reconciler.ts";
import { FeedWatcher } from "../src/feed/watcher.ts";
import { apiServer } from "../src/http/api-server.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import type { FeedReader } from "../src/ports.ts";
import { FeedScript } from "../src/simulator/feed-script.ts";
import { LocalExtractor } from "../src/simulator/local-extractor.ts";
import { parseFeedEvent } from "../src/sources/feed-format.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { SqliteCostLedger } from "../src/store/cost-ledger.ts";
import { openDb, type Db } from "../src/store/db.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

const dataDir = new URL("../data/sample", import.meta.url).pathname;
const embedder = new FakeEmbedder();
let db: Db;

beforeAll(async () => {
  db = openDb(":memory:");
  const sample = new SampleData(dataDir);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, embedder, "batch"));
});

describe("step mode", () => {
  it("delivers nothing until released, then one event per release, in script order", async () => {
    const script = await FeedScript.load(dataDir, new Date(), new SampleData(dataDir), { step: true });
    expect(script.eventsSince(null, Date.now()).events).toEqual([]);
    expect(script.releaseNext(Date.now())?.event.doc_id).toBe("d02");
    expect(script.releaseNext(Date.now())?.event.doc_id).toBe("d05");
    expect(script.eventsSince(null, Date.now()).events.map((e) => e.doc_id)).toEqual(["d02", "d05"]);
  });

  it("keeps a duplicate's time equal to the original's, so it is still recognised", async () => {
    const script = await FeedScript.load(dataDir, new Date(), new SampleData(dataDir), { step: true });
    for (let i = 0; i < 4; i++) script.releaseNext(Date.now());
    const [first, , , duplicate] = script.eventsSince(null, Date.now()).events;
    expect(duplicate?.modified_at).toBe(first?.modified_at);
  });
});

describe("a reset feed", () => {
  it("is noticed, reported, and read again from the start without applying anything twice", async () => {
    const store = openDb(":memory:");
    const sample = new SampleData(dataDir);
    const indexer = new Indexer(store, embedder, "realtime");
    await loadCorpus(store, { corpus: sample, documents: sample, permissions: sample }, indexer);
    let script = await FeedScript.load(dataDir, new Date(Date.now() - 15_000), sample);
    const reader: FeedReader = {
      poll: (cursor) => {
        const p = script.eventsSince(cursor, Date.now());
        return Promise.resolve({ events: p.events.map(parseFeedEvent), cursor: p.cursor });
      },
    };
    const log = new EventLog(store);
    const notes: string[] = [];
    const watcher = new FeedWatcher(store, reader, log, new Reconciler(store, indexer, { read: (id) => script.documentAt(id, Date.now()) }, log), {
      notify: (m) => notes.push(m),
    });
    await watcher.tick();
    expect(log.cursor()).toBe("1");

    script = await FeedScript.load(dataDir, new Date(Date.now() - 5_000), sample);
    await watcher.tick();
    expect(notes).toContain("feed was reset (cursor 0 < 1), reading again from the start");
    expect(store.prepare("SELECT revision FROM documents WHERE doc_id = 'd02'").pluck().get()).toBe(2);
  });
});

describe("HTTP API", () => {
  let base = "";
  const server = () => apiServer({ db, embedder, extractor: new LocalExtractor(embedder), policy: { likely: 0, plausible: 0 } });
  let running: ReturnType<typeof server>;

  beforeAll(async () => {
    running = server();
    await new Promise<void>((resolve) => running.listen(0, resolve));
    base = `http://localhost:${(running.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => running.close(() => resolve())));

  it("answers POST /ask with the same shape as the command line", async () => {
    const res = await fetch(`${base}/ask`, { method: "POST", body: JSON.stringify({ user_id: "sanne", question: "bonus scheme" }) });
    const body = (await res.json()) as { answer: string; sources: { doc_id: string }[] };
    expect(res.status).toBe(200);
    expect(body.sources[0]?.doc_id).toBe("d11");
  });

  it("rejects a malformed question", async () => {
    expect((await fetch(`${base}/ask`, { method: "POST", body: "{}" })).status).toBe(400);
    expect((await fetch(`${base}/ask`, { method: "POST", body: "not json" })).status).toBe(400);
  });

  it("answers GET /status, gated by an optional user", async () => {
    expect(await (await fetch(`${base}/status/d10`)).json()).toMatchObject({ state: "indexed" });
    expect(await (await fetch(`${base}/status/d10?user_id=anouk`)).json()).toMatchObject({ state: "not_indexed" });
  });
});

describe("costs", () => {
  it("sums per operation and mode, with a total", () => {
    const store = openDb(":memory:");
    const ledger = new SqliteCostLedger(store);
    ledger.record({ operation: "embed", mode: "batch", requests: 2, tokens: 1000, eur: 0.0075 });
    ledger.record({ operation: "embed", mode: "realtime", requests: 1, tokens: 100, eur: 0.0015 });
    const { lines, total } = ledger.summary();
    expect(lines).toHaveLength(2);
    expect(total).toEqual({ operation: "total", mode: "", requests: 3, tokens: 1100, eur: 0.009 });
  });
});
