import { describe, expect, it } from "vitest";
import { shouldAnswer } from "../src/answer-policy.ts";

const policy = { high: 0.825, low: 0.8 };

describe("shouldAnswer", () => {
  it("answers on meaning alone when the similarity is high (another language, synonyms)", () => {
    expect(shouldAnswer(0.828, false, policy)).toBe(true);
  });

  it("answers a medium similarity only when a word of the question is in the passage", () => {
    expect(shouldAnswer(0.818, true, policy)).toBe(true);
    expect(shouldAnswer(0.819, false, policy)).toBe(false);
  });

  it("never answers below the low bar, shared word or not", () => {
    expect(shouldAnswer(0.79, true, policy)).toBe(false);
  });
});
