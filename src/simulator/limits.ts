// Simulator limits and prices from the brief. One place, so the adapter and the tests agree.

export const EMBED = {
  maxTextsPerRequest: 100,
  maxTokensPerRequest: 16_000,
  requestsPerSecond: 3_000 / 60,
  tokensPerSecond: 1_000_000 / 60,
  eurPerMillionTokens: { realtime: 15, batch: 7.5 },
} as const;

export const EXTRACT = {
  maxPassages: 16,
} as const;

export const PASSAGE_MAX_TOKENS = 500;
