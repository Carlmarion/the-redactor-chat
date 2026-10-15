// Every external input enters through one of these interfaces (decision 0001).
// Today each is backed by our own simulator and sample data; the client's systems plug in later.

import type { DocId, FeedEvent, Passage, PermissionSnapshot } from "./types.ts";

export interface SourceDocument {
  text: string;
  title: string | null;
}

/** Where a document's current text is read from. Events never carry text (C5). */
export interface DocumentSource {
  read(docId: DocId): Promise<SourceDocument | null>;
}

export interface PermissionSource {
  load(): Promise<PermissionSnapshot>;
}

/** Polls the feed from a cursor (decision 0008). A null cursor means "from the start". */
export interface FeedReader {
  poll(cursor: string | null): Promise<{ events: FeedEvent[]; cursor: string | null }>;
}

export type EmbedKind = "query" | "passage";
export type EmbedMode = "realtime" | "batch";

export interface Embedder {
  readonly dimensions: number;
  countTokens(text: string): number;
  embed(texts: string[], kind: EmbedKind, mode: EmbedMode): Promise<Float32Array[]>;
}

export interface ExtractResult {
  passage: Passage;
  score: number;
}

/** Returns the best passage for a question, or null when none answers it. At most 16 passages. */
export interface Extractor {
  extract(question: string, passages: Passage[]): Promise<ExtractResult | null>;
}
