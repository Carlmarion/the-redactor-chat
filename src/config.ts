// The embedding model fixes the vector size the store is created with. One owner for both.
export const EMBEDDING_MODEL = {
  id: "Xenova/multilingual-e5-small",
  dimensions: 384,
} as const;

/**
 * Minimum question↔passage similarity for an answer. The model scores everything between ~0.75
 * and ~0.90 (decision 0005), so this is measured on the eval set, not guessed.
 */
export const ANSWER_MIN_SCORE = 0.82;
