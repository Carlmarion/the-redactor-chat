import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FeedScript } from "../src/simulator/feed-script.ts";
import { feedServer } from "../src/simulator/feed-server.ts";
import { parseFeedEvent } from "../src/sources/feed-format.ts";
import { HttpDocumentSource, HttpFeedReader } from "../src/sources/http-feed.ts";
import { SampleData } from "../src/sources/sample-data.ts";

const dataDir = new URL("../data/sample", import.meta.url).pathname;
const start = new Date("2026-10-16T10:00:00+02:00");
const t = (seconds: number) => start.getTime() + seconds * 1000;
let script: FeedScript;

beforeAll(async () => {
  script = await FeedScript.load(dataDir, start, new SampleData(dataDir));
});

describe("FeedScript", () => {
  it("serves nothing before the first delivery, then each event from its delivery time", () => {
    expect(script.eventsSince(null, t(5)).events).toEqual([]);
    const page = script.eventsSince(null, t(10));
    expect(page.events).toEqual([
      { doc_id: "d02", path: "/Public/handbook/leave-policy.md", action: "update", modified_at: "2026-10-16T10:00:10.000+02:00" },
    ]);
    expect(page.cursor).toBe("1");
  });

  it("continues from the cursor, duplicates and stale events included (T4)", () => {
    const page = script.eventsSince("1", t(45));
    expect(page.events.map((e) => e.doc_id)).toEqual(["d05", "d17", "d02", "d07"]);
    expect(page.events[3]?.modified_at).toBe("2026-10-12T17:00:00+02:00");
    expect(page.cursor).toBe("5");
  });

  it("never puts the text in an event (C5)", () => {
    for (const e of script.eventsSince(null, t(1000)).events) expect(e).not.toHaveProperty("text");
  });

  it("returns each document's text as of a moment: corpus, revision, created, deleted", async () => {
    expect((await script.documentAt("d02", t(9)))?.text).toContain("25 days");
    expect((await script.documentAt("d02", t(10)))?.text).toContain("27 days");
    expect(await script.documentAt("d16", t(70))).toBeNull();
    expect(await script.documentAt("d21", t(79))).toBeNull();
    expect((await script.documentAt("d21", t(80)))?.text).toMatch(/bike/i);
  });
});

describe("over HTTP", () => {
  let now = t(0);
  let base = "";
  const server = () => feedServer(script, () => now);
  let running: ReturnType<typeof server>;

  beforeAll(async () => {
    running = server();
    await new Promise<void>((resolve) => running.listen(0, resolve));
    base = `http://localhost:${(running.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => running.close(() => resolve())));

  it("polls with a cursor and maps every event shape", async () => {
    const reader = new HttpFeedReader(`${base}/events`);
    now = t(65);
    const first = await reader.poll(null);
    expect(first.events.map((e) => e.kind)).toEqual(["document", "document", "document", "document", "document", "document", "document", "document", "access"]);
    now = t(100);
    const next = await reader.poll(first.cursor);
    expect(next.events.map((e) => (e.kind === "document" ? e.action : e.kind))).toEqual(["delete", "create", "rename"]);
    expect((await reader.poll(next.cursor)).events).toEqual([]);
  });

  it("reads a document's current text, and 404 becomes null", async () => {
    const source = new HttpDocumentSource(`${base}/documents`);
    now = t(100);
    expect((await source.read("d02"))?.text).toContain("27 days");
    expect(await source.read("d16")).toBeNull();
  });

  it("answers as of the time given in `at`", async () => {
    const res = await fetch(`${base}/events?at=${encodeURIComponent(new Date(t(10)).toISOString())}`);
    expect(((await res.json()) as { events: unknown[] }).events).toHaveLength(1);
    expect((await fetch(`${base}/events?at=yesterday`)).status).toBe(400);
  });

  it("takes `at` typed by hand, where the URL turns the + of the offset into a space", async () => {
    const res = await fetch(`${base}/events?at=2026-10-16T10:00:15+02:00`);
    expect(((await res.json()) as { events: unknown[] }).events).toHaveLength(1);
  });
});

describe("parseFeedEvent", () => {
  it("keeps what it cannot read as unknown instead of dropping it", () => {
    expect(parseFeedEvent({ hello: "world" })).toEqual({ kind: "unknown", modified_at: null, raw: { hello: "world" } });
    expect(parseFeedEvent({ action: "access", modified_at: "x", change: { op: "promote" } }).kind).toBe("unknown");
  });
});
