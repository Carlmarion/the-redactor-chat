// The embedding model fixes the vector size the store is created with. One owner for both.
export const EMBEDDING_MODEL = {
  id: "Xenova/multilingual-e5-small",
  dimensions: 384,
} as const;

/** Passage size the indexer cuts to. At most the brief's 500-token cap; chosen on the eval set. */
export const PASSAGE_TOKENS = 250;

/**
 * When a passage is good enough to be the answer (decision 0009). The model scores everything
 * between ~0.75 and ~0.90 (decision 0005), so one cut-off cannot separate right from wrong.
 * Two ways in: a high similarity on meaning alone (synonyms, other languages), or a lower one
 * backed by a word the question and the passage share.
 */
export const ANSWER_POLICY = { high: 0.825, low: 0.8 } as const;
