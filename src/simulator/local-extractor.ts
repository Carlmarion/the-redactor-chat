// A light extract: the best of at most 16 passages by embedding similarity, with the model already
// loaded for embed. The system extracts with the re-reading model (decision 0011); this one keeps
// tests fast and free of a second model download.

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
    if (!q) return null;
    // One passage at a time: in a batch, padding shifts scores by a few thousandths depending on
    // the neighbours, enough to flip an answer near the threshold.
    const vectors: Float32Array[] = [];
    for (const p of passages) vectors.push(...(await this.model.embed([p.text], "passage", "realtime")));

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
