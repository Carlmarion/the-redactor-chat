import { beforeAll, describe, expect, it } from "vitest";
import { visiblePassageIds } from "../src/access/visible-passages.ts";
import { ask, NOT_FOUND, UNKNOWN_USER } from "../src/ask.ts";
import { Indexer } from "../src/ingest/indexer.ts";
import { loadCorpus } from "../src/ingest/load.ts";
import { fuse, informativeWords, keywordQuery, questionWords, retrieve } from "../src/retrieval/retriever.ts";
import { LocalExtractor } from "../src/simulator/local-extractor.ts";
import { SampleData } from "../src/sources/sample-data.ts";
import { openDb, type Db } from "../src/store/db.ts";
import type { Passage } from "../src/types.ts";
import { FakeEmbedder } from "./support/fake-embedder.ts";

const embedder = new FakeEmbedder();
let db: Db;

beforeAll(async () => {
  db = openDb(":memory:");
  const sample = new SampleData(new URL("../data/sample", import.meta.url).pathname);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, embedder, "batch"));
});

async function search(userId: string, text: string): Promise<Passage[]> {
  const [vector] = await embedder.embed([text]);
  if (!vector) throw new Error("no vector");
  return retrieve(db, { text, vector, visible: visiblePassageIds(db, userId), limit: 16 }).passages;
}

describe("fuse", () => {
  it("ranks first what both lists agree on", () => {
    expect(fuse([[1, 2, 3], [3, 4, 1]])[0]).toBe(1);
    expect(fuse([[1, 2, 3], [3, 4, 1]]).slice(0, 2)).toEqual([1, 3]);
  });
});

describe("keyword words", () => {
  it("normalises the question like the index does", () => {
    expect(questionWords('Café "bonus" OR bonus?')).toEqual(["cafe", "bonus", "or"]);
  });

  it("quotes every word so search syntax in a question stays inert", () => {
    expect(keywordQuery(["bonus", "or", "not"])).toBe('"bonus" OR "or" OR "not"');
    expect(keywordQuery([])).toBeNull();
  });

  it("drops words too common in the corpus to point at a passage", () => {
    expect(informativeWords(db, ["the", "relocation", "zzzunknown"])).toEqual(["relocation"]);
  });
});

describe("retrieve", () => {
  it("never returns a passage the user may not read, even when it matches best", async () => {
    const hits = await search("emma", "bonus scheme payroll calendar salary");
    expect(hits.map((p) => p.doc_id)).not.toContain("d10");
    expect(hits.map((p) => p.doc_id)).not.toContain("d11");
  });

  it("finds the matching passage among those the user may read", async () => {
    const hits = await search("sanne", "bonus scheme");
    expect(hits[0]?.doc_id).toBe("d11");
  });

  it("returns at most the limit", async () => {
    expect((await search("anouk", "the policy for staff")).length).toBeLessThanOrEqual(16);
  });
});

describe("LocalExtractor", () => {
  const passage = (id: number, text: string): Passage => ({ passage_id: id, doc_id: `d${id}`, ord: 0, text });

  it("refuses more than 16 passages, like the simulator", async () => {
    const many = Array.from({ length: 17 }, (_, i) => passage(i, "x"));
    await expect(new LocalExtractor(embedder).extract("q", many)).rejects.toThrow(/at most 16/);
  });

  it("returns the closest passage with its score", async () => {
    const passages = [passage(1, "bike lease scheme"), passage(2, "office closes at seven")];
    const best = await new LocalExtractor(embedder).extract("when does the office close", passages);
    expect(best?.passage.passage_id).toBe(2);
    expect(best?.score).toBeGreaterThan(0);
  });
});

describe("ask", () => {
  const deps = (policy = { high: 0, low: 0 }) => ({ db, embedder, extractor: new LocalExtractor(embedder), policy });

  it("answers with the passage and its source", async () => {
    const result = await ask(deps(), "sanne", "bonus scheme");
    expect(result.sources[0]).toMatchObject({ doc_id: "d11", path: "/HR/Payroll/bonus-scheme.md" });
    expect(result.answer).toContain(result.sources[0]?.snippet.replace("…", "").slice(0, 40));
  });

  it("tells an unknown user they are not in the access list (T9)", async () => {
    expect(await ask(deps(), "ghost", "bonus scheme")).toEqual({ answer: UNKNOWN_USER, sources: [] });
  });

  it("says not found when nothing visible answers", async () => {
    expect(await ask(deps({ high: 0.99, low: 0.99 }), "emma", "bonus scheme")).toEqual({ answer: NOT_FOUND, sources: [] });
  });
});
