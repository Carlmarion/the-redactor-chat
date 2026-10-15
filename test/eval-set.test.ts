import { describe, expect, it } from "vitest";
import { judge, type EvalQuestion } from "../src/eval/eval-set.ts";
import type { AskResult } from "../src/types.ts";

const q = (extra: Partial<EvalQuestion>): EvalQuestion => ({ id: "E", trap: "T", phase: "loaded", user: "u", question: "?", ...extra });
const citing = (doc_id: string, answer = "text"): AskResult => ({
  answer,
  sources: [{ doc_id, path: "/p", title: "t", passage_id: 1, snippet: "s", url: null }],
});
const nothing: AskResult = { answer: "not found", sources: [] };

describe("judge", () => {
  it("flags citing a forbidden document as a leak, before anything else", () => {
    expect(judge(q({ must_cite: ["d1"], must_not_cite: ["d2"] }), citing("d2"))).toBe("leak");
  });

  it("passes a right citation only when the answer holds every required phrase", () => {
    expect(judge(q({ must_cite: ["d1"], must_contain: ["25 days"] }), citing("d1", "you get 25 days"))).toBe("pass");
    expect(judge(q({ must_cite: ["d1"], must_contain: ["25 days"] }), citing("d1", "you get 27 days"))).toBe("miss");
  });

  it("calls an answer to a question that should find nothing off topic, not a failure", () => {
    expect(judge(q({ must_not_cite: ["d2"] }), citing("d9"))).toBe("off_topic");
    expect(judge(q({ must_not_cite: ["d2"] }), nothing)).toBe("pass");
  });

  it("expects no sources at all when told so", () => {
    expect(judge(q({ expect_no_sources: true }), citing("d1"))).toBe("miss");
  });
});
