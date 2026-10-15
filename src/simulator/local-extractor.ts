// The simulator's extract mode: takes a question and at most 16 passages, returns the best passage
// and its score. Whether that passage is good enough is our decision (answer-policy.ts), not the
// simulator's. Runs the embedding model internally; extract has no price in the brief.

import type { Embedder, ExtractResult, Extractor } from "../ports.ts";
import type { Passage } from "../types.ts";
import { EXTRACT } from "./limits.ts";

export class LocalExtractor implements Extractor {
  constructor(private readonly model: Embedder) {}

  async extract(question: string, passages: Passage[]): Promise<ExtractResult | null> {
    if (passages.length > EXTRACT.maxPassages) {
      throw new Error(`extract takes at most ${EXTRACT.maxPassages} passages, got ${passages.length}`);
    }
    if (passages.length === 0) return null;

    const [q] = await this.model.embed([question], "query", "realtime");
    const vectors = await this.model.embed(passages.map((p) => p.text), "passage", "realtime");
    if (!q) return null;

    let best: ExtractResult | null = null;
    for (const [i, passage] of passages.entries()) {
      const v = vectors[i];
      if (!v) continue;
      const score = cosine(q, v);
      if (!best || score > best.score) best = { passage, score };
    }
    return best;
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
