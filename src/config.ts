// The embedding model fixes the vector size the store is created with. One owner for both.
export const EMBEDDING_MODEL = {
  id: "Xenova/multilingual-e5-small",
  dimensions: 384,
} as const;

/** Passage size the indexer cuts to. At most the brief's 500-token cap; chosen on the eval set. */
export const PASSAGE_TOKENS = 250;

/** Extract's re-reading model (decision 0011): multilingual, reads question and passage together. */
export const RE_READING_MODEL = { id: "Xenova/bge-reranker-base" } as const;

/**
 * When the best passage is the answer (decision 0011), on extract's 0-to-1 likelihood:
 * likely → the answer; plausible → the closest match, said so; below → not found.
 */
export const ANSWER_POLICY = { likely: 0.5, plausible: 0.05 } as const;
