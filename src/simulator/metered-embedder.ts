// The adapter in front of embed: enforces the brief's request limits, throttles realtime calls,
// and records what every request would cost.
import type { CostLedger, EmbedKind, EmbedMode, Embedder } from "../ports.ts";
import { EMBED } from "./limits.ts";
import { TokenBucket, systemClock, type Clock } from "./token-bucket.ts";

/**
 * Groups texts into requests of at most 100 texts and 16,000 tokens, keeping order.
 * Returns the index ranges [start, end) of each request.
 */
export function planRequests(tokenCounts: number[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  let tokens = 0;
  tokenCounts.forEach((count, i) => {
    if (count > EMBED.maxTokensPerRequest) {
      throw new Error(`Text ${i} has ${count} tokens; a request holds at most ${EMBED.maxTokensPerRequest}`);
    }
    const full = i - start === EMBED.maxTextsPerRequest || tokens + count > EMBED.maxTokensPerRequest;
    if (full) {
      ranges.push([start, i]);
      start = i;
      tokens = 0;
    }
    tokens += count;
  });
  if (start < tokenCounts.length) ranges.push([start, tokenCounts.length]);
  return ranges;
}

export function embedCost(tokens: number, mode: EmbedMode): number {
  return (tokens / 1_000_000) * EMBED.eurPerMillionTokens[mode];
}

export class MeteredEmbedder implements Embedder {
  readonly dimensions: number;
  private readonly requestBucket: TokenBucket;
  private readonly tokenBucket: TokenBucket;

  constructor(
    private readonly inner: Embedder,
    private readonly ledger: CostLedger,
    clock: Clock = systemClock,
  ) {
    this.dimensions = inner.dimensions;
    this.requestBucket = new TokenBucket(EMBED.requestsPerSecond, clock);
    this.tokenBucket = new TokenBucket(EMBED.tokensPerSecond, clock);
  }

  countTokens(text: string, kind: EmbedKind = "passage"): number {
    return this.inner.countTokens(text, kind);
  }

  /** Realtime requests are throttled; batch requests are not, and cost half (the brief's batch mode). */
  async embed(texts: string[], kind: EmbedKind, mode: EmbedMode): Promise<Float32Array[]> {
    const counts = texts.map((t) => this.countTokens(t, kind));
    const vectors: Float32Array[] = [];
    for (const [start, end] of planRequests(counts)) {
      const tokens = counts.slice(start, end).reduce((a, b) => a + b, 0);
      if (mode === "realtime") {
        await this.requestBucket.take(1);
        await this.tokenBucket.take(tokens);
      }
      vectors.push(...(await this.inner.embed(texts.slice(start, end), kind, mode)));
      this.ledger.record({ operation: "embed", mode, requests: 1, tokens, eur: embedCost(tokens, mode) });
    }
    return vectors;
  }
}
