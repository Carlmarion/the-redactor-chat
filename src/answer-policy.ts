// Is the best passage the answer? (decision 0011)

export type AnswerBand = "answer" | "closest" | "not_found";

export interface AnswerPolicy {
  /** Likelihood from which the passage is the answer. */
  likely: number;
  /** Likelihood from which the passage is shown as the closest match found. */
  plausible: number;
}

/** Each threshold belongs to the band above it. A score that is not a number (NaN) fails every comparison: not found. */
export function answerBand(score: number, policy: AnswerPolicy): AnswerBand {
  if (score >= policy.likely) return "answer";
  if (score >= policy.plausible) return "closest";
  return "not_found";
}
