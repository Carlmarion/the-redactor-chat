// Every external input enters through one of these interfaces (decision 0001).
// Today each is backed by our own simulator and sample data; the client's systems plug in later.

import type { DocId, FeedEvent, Passage, PermissionSnapshot, PrincipalId } from "./types.ts";

/** One document as listed in the corpus export: `{path, title, folder, allowed}` plus our id (C1). */
export interface CorpusEntry {
  doc_id: DocId;
  path: string;
  title: string;
  /** Kept for audit only: access follows the folder rules (C3). */
  allowed: PrincipalId[];
  url: string | null;
}

/** The corpus export: which documents exist, as of when. */
export interface CorpusSource {
  list(): Promise<{ exported_at: string; documents: CorpusEntry[] }>;
}

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
  countTokens(text: string, kind?: EmbedKind): number;
  embed(texts: string[], kind: EmbedKind, mode: EmbedMode): Promise<Float32Array[]>;
}

export interface CostEntry {
  operation: "embed";
  mode: EmbedMode;
  requests: number;
  tokens: number;
  eur: number;
}

/** Where the adapter records what each simulator call would cost. */
export interface CostLedger {
  record(entry: CostEntry): void;
}

export interface ExtractResult {
  passage: Passage;
  score: number;
}

/** Returns the best passage for a question, or null when none answers it. At most 16 passages. */
export interface Extractor {
  extract(question: string, passages: Passage[]): Promise<ExtractResult | null>;
}
