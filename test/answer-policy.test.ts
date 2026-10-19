import { describe, expect, it } from "vitest";
import { answerBand } from "../src/answer-policy.ts";

const policy = { likely: 0.5, plausible: 0.05 };

describe("answerBand", () => {
  it("a likely passage is the answer", () => {
    expect(answerBand(0.944, policy)).toBe("answer"); // E01, leave days
  });

  it("a plausible passage is shown as the closest match", () => {
    expect(answerBand(0.08, policy)).toBe("closest"); // E22, the escalation ladder
  });

  it("an unlikely passage is not found", () => {
    expect(answerBand(0.039, policy)).toBe("not_found"); // E04, emma's salary question → on-call pay
  });

  it("each threshold belongs to the band above it", () => {
    expect(answerBand(0.5, policy)).toBe("answer");
    expect(answerBand(0.05, policy)).toBe("closest");
  });

  it("a score that is not a number is never an answer", () => {
    expect(answerBand(Number.NaN, policy)).toBe("not_found");
  });
});
