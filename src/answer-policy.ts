// Is the best passage good enough to be the answer? (decision 0009)

export interface AnswerPolicy {
  /** Similarity at which meaning alone is enough. */
  high: number;
  /** Lowest similarity accepted when the passage also matched a word of the question. */
  low: number;
}

export function shouldAnswer(score: number, sharesKeyword: boolean, policy: AnswerPolicy): boolean {
  return score >= policy.high || (sharesKeyword && score >= policy.low);
}
