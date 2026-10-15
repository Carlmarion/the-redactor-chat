// The simulator's embed mode: one small open multilingual model, run locally (decision 0005).
import { AutoTokenizer, pipeline, env, type FeatureExtractionPipeline, type PreTrainedTokenizer } from "@huggingface/transformers";
import { EMBEDDING_MODEL } from "../config.ts";
import type { EmbedKind, Embedder } from "../ports.ts";

// e5 models are trained with these prefixes; leaving them out degrades retrieval.
const PREFIX: Record<EmbedKind, string> = { query: "query: ", passage: "passage: " };

env.cacheDir = new URL("../../.models/", import.meta.url).pathname;

export class LocalEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_MODEL.dimensions;

  private constructor(
    private readonly tokenizer: PreTrainedTokenizer,
    private readonly extractor: FeatureExtractionPipeline,
  ) {}

  /** Loads the model, downloading it once into ./.models. */
  static async load(): Promise<LocalEmbedder> {
    const [tokenizer, extractor] = await Promise.all([
      AutoTokenizer.from_pretrained(EMBEDDING_MODEL.id),
      pipeline("feature-extraction", EMBEDDING_MODEL.id, { dtype: "q8" }),
    ]);
    return new LocalEmbedder(tokenizer, extractor);
  }

  /** Tokens as the model counts them, prefix included. */
  countTokens(text: string, kind: EmbedKind = "passage"): number {
    return this.tokenizer.encode(PREFIX[kind] + text).length;
  }

  async embed(texts: string[], kind: EmbedKind): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const output = await this.extractor(
      texts.map((t) => PREFIX[kind] + t),
      { pooling: "mean", normalize: true },
    );
    const flat = output.data as Float32Array;
    return texts.map((_, i) => flat.slice(i * this.dimensions, (i + 1) * this.dimensions));
  }
}
