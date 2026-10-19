// The simulator's extract mode, re-reading (decision 0011): a cross-encoder reads the question and
// each passage together and scores how likely the passage answers it, from 0 to 1. Whether that is
// good enough is our decision (answer-policy.ts). Runs locally; extract has no price in the brief.

import { AutoModelForSequenceClassification, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer } from "@huggingface/transformers";
import { RE_READING_MODEL } from "../config.ts";
import type { ExtractResult, Extractor } from "../ports.ts";
import type { Passage } from "../types.ts";
import { EXTRACT } from "./limits.ts";
import "./local-embedder.ts"; // shares its model cache directory (./.models)

export class ReReadingExtractor implements Extractor {
  private constructor(
    private readonly tokenizer: PreTrainedTokenizer,
    private readonly model: PreTrainedModel,
  ) {}

  /** Loads the model, downloading it once into ./.models. */
  static async load(): Promise<ReReadingExtractor> {
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(RE_READING_MODEL.id),
      AutoModelForSequenceClassification.from_pretrained(RE_READING_MODEL.id, { dtype: "q8" }),
    ]);
    return new ReReadingExtractor(tokenizer, model);
  }

  async extract(question: string, passages: Passage[]): Promise<ExtractResult | null> {
    if (passages.length > EXTRACT.maxPassages) {
      throw new Error(`extract takes at most ${EXTRACT.maxPassages} passages, got ${passages.length}`);
    }
    let best: ExtractResult | null = null;
    // One pair at a time, like the embedding extract: batch padding would shift scores.
    for (const passage of passages) {
      const score = await this.likelihood(question, passage.text);
      if (!best || score > best.score) best = { passage, score };
    }
    return best;
  }

  private async likelihood(question: string, passage: string): Promise<number> {
    const inputs = this.tokenizer([question], { text_pair: [passage], padding: true, truncation: true });
    const { logits } = (await this.model(inputs)) as { logits: { data: ArrayLike<number> } };
    return 1 / (1 + Math.exp(-Number(logits.data[0])));
  }
}
