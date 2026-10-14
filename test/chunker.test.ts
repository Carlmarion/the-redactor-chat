import { describe, expect, it } from "vitest";
import { chunk } from "../src/ingest/chunker.ts";

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("chunk", () => {
  it("keeps a short document as one passage", () => {
    expect(chunk("# Title\n\nOne short paragraph.", words, 50)).toEqual(["# Title\nOne short paragraph."]);
  });

  it("never exceeds the limit", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} has exactly seven words here.`).join("\n\n");
    const passages = chunk(text, words, 20);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) expect(words(p)).toBeLessThanOrEqual(20);
  });

  it("keeps a heading with the paragraph under it", () => {
    const passages = chunk("## Sick leave\n\nReport sick before 09:30.\n\n## Special leave\n\nTwo days for moving.", words, 8);
    expect(passages).toEqual(["## Sick leave\nReport sick before 09:30.", "## Special leave\nTwo days for moving."]);
  });

  it("splits an oversized paragraph on sentences, then words", () => {
    const passages = chunk("One two three. Four five six. Seven eight nine ten eleven twelve.", words, 4);
    for (const p of passages) expect(words(p)).toBeLessThanOrEqual(4);
    expect(passages.join(" ")).toBe("One two three. Four five six. Seven eight nine ten eleven twelve.");
  });
});
