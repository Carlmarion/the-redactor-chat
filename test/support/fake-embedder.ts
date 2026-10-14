// Deterministic stand-in for the model: one token per word, and a vector derived from the words.
import type { Embedder } from "../../src/ports.ts";

export class FakeEmbedder implements Embedder {
  readonly dimensions = 384;
  calls = 0;

  countTokens(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  embed(texts: string[]): Promise<Float32Array[]> {
    this.calls += 1;
    return Promise.resolve(
      texts.map((text) => {
        const v = new Float32Array(this.dimensions);
        for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
          let h = 0;
          for (const c of word) h = (h * 31 + c.charCodeAt(0)) % this.dimensions;
          v[h] = (v[h] ?? 0) + 1;
        }
        return v;
      }),
    );
  }
}
