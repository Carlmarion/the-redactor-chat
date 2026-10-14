import { describe, expect, it } from "vitest";
import type { CostEntry, Embedder } from "../src/ports.ts";
import { MeteredEmbedder, embedCost, planRequests } from "../src/simulator/metered-embedder.ts";
import type { Clock } from "../src/simulator/token-bucket.ts";

// One token per word, so tests can reason about counts.
const fakeModel: Embedder & { calls: string[][] } = {
  dimensions: 2,
  calls: [],
  countTokens: (text) => text.split(/\s+/).length,
  async embed(texts) {
    this.calls.push(texts);
    return texts.map(() => new Float32Array([1, 0]));
  },
};

const instantClock: Clock = { now: () => 0, sleep: async () => {} };

describe("planRequests", () => {
  it("caps a request at 100 texts", () => {
    expect(planRequests(Array(250).fill(1))).toEqual([[0, 100], [100, 200], [200, 250]]);
  });

  it("caps a request at 16,000 tokens", () => {
    expect(planRequests([9_000, 7_000, 1])).toEqual([[0, 2], [2, 3]]);
  });

  it("refuses a single text above the request limit", () => {
    expect(() => planRequests([16_001])).toThrow(/at most 16000/);
  });
});

describe("embedCost", () => {
  it("prices realtime at €15 and batch at €7.50 per million tokens", () => {
    expect(embedCost(1_200, "realtime")).toBeCloseTo(0.018);
    expect(embedCost(800_000, "batch")).toBeCloseTo(6);
  });
});

describe("MeteredEmbedder", () => {
  it("splits into requests, keeps order, and records one ledger entry per request", async () => {
    fakeModel.calls = [];
    const entries: CostEntry[] = [];
    const embedder = new MeteredEmbedder(fakeModel, { record: (e) => entries.push(e) }, instantClock);

    const vectors = await embedder.embed(Array(150).fill("two words"), "passage", "batch");

    expect(vectors).toHaveLength(150);
    expect(fakeModel.calls.map((c) => c.length)).toEqual([100, 50]);
    expect(entries).toEqual([
      { operation: "embed", mode: "batch", requests: 1, tokens: 200, eur: embedCost(200, "batch") },
      { operation: "embed", mode: "batch", requests: 1, tokens: 100, eur: embedCost(100, "batch") },
    ]);
  });

  it("throttles realtime requests beyond the burst of 50", async () => {
    const slept: number[] = [];
    let t = 0;
    const clock: Clock = { now: () => t, sleep: async (ms) => { slept.push(ms); t += ms; } };
    const embedder = new MeteredEmbedder(fakeModel, { record: () => {} }, clock);

    for (let i = 0; i < 51; i++) await embedder.embed(["one"], "query", "realtime");

    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeCloseTo(20);
  });
});
