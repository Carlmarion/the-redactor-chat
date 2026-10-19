// Runs the real re-reading model (downloaded once into ./.models). Slower than the other tests.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ReReadingExtractor } from "../src/simulator/rereading-extractor.ts";
import type { Passage } from "../src/types.ts";

const passage = (passage_id: number, text: string): Passage => ({ passage_id, doc_id: `d${passage_id}`, ord: 0, text });
const onCall = passage(14, "One engineer is on call each week. On-call pay is €250 per week plus €40 per hour of incident work.");
const salaryBands = passage(5, "Salary bands 2026. Senior engineer: €68,000 to €82,000 a year. Medior engineer: €54,000 to €66,000.");
const question = "What is the salary range for a senior engineer?";

describe("ReReadingExtractor", () => {
  let extractor: ReReadingExtractor;

  beforeAll(async () => {
    extractor = await ReReadingExtractor.load();
  }, 300_000);

  it("prefers the passage that answers over one that only shares its topic", async () => {
    expect((await extractor.extract(question, [onCall, salaryBands]))?.passage.doc_id).toBe("d5");
  });

  it("scores the real on-call document as unlikely for a salary question (emma, after the salary bands move)", async () => {
    const d14 = passage(14, readFileSync(new URL("../data/sample/corpus/d14.md", import.meta.url), "utf8"));
    expect((await extractor.extract(question, [d14]))?.score).toBeLessThan(0.05);
  });

  it("refuses more than 16 passages, like the brief's extract", async () => {
    await expect(extractor.extract(question, Array.from({ length: 17 }, (_, i) => passage(i, "text")))).rejects.toThrow(/at most 16/);
  });
});
