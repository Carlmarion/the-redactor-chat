// Hybrid retrieval (decision 0003): nearest passages by meaning (sqlite-vec) and by keywords (FTS5),
// both restricted to the passages the user may read BEFORE ranking, then merged by reciprocal rank.

import type { Db } from "../store/db.ts";
import type { Passage } from "../types.ts";

/** Reciprocal rank fusion constant: dampens the weight of the very first ranks. Standard value. */
const RRF_K = 60;

/**
 * A word found in more than this share of passages ("the", "what", "de") says nothing about
 * which passage answers. Measured on the corpus itself, so it works in any language, no word list.
 */
const COMMON_WORD_SHARE = 0.25;

export interface RetrievalQuery {
  text: string;
  vector: Float32Array;
  /** From visiblePassageIds: the only passages either search may look at. */
  visible: number[];
  limit: number;
}

export interface Retrieved {
  /** Best first, at most `limit`. */
  passages: Passage[];
  /** Passages the keyword search found: a second, independent signal for the answer policy. */
  keywordHits: Set<number>;
}

export function retrieve(db: Db, query: RetrievalQuery): Retrieved {
  if (query.visible.length === 0) return { passages: [], keywordHits: new Set() };
  const visible = JSON.stringify(query.visible);

  const byMeaning = db
    .prepare(
      `SELECT rowid FROM passage_vec
       WHERE embedding MATCH ? AND k = ?
         AND rowid IN (SELECT value FROM json_each(?))
       ORDER BY distance`,
    )
    .pluck()
    .all(query.vector, query.limit, visible) as number[];

  const match = keywordQuery(informativeWords(db, questionWords(query.text)));
  const byKeywords = match
    ? (db
        .prepare(
          `SELECT rowid FROM passage_fts
           WHERE passage_fts MATCH ?
             AND rowid IN (SELECT value FROM json_each(?))
           ORDER BY rank LIMIT ?`,
        )
        .pluck()
        .all(match, visible, query.limit) as number[])
    : [];

  const ids = fuse([byMeaning, byKeywords]).slice(0, query.limit);
  return { passages: loadPassages(db, ids), keywordHits: new Set(byKeywords) };
}

/** The question's words as the keyword index stores them: lower case, accents removed, once each. */
export function questionWords(text: string): string[] {
  const words = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words)];
}

/** Keeps the words that occur in the corpus but not in too many passages. */
export function informativeWords(db: Db, words: string[]): string[] {
  if (words.length === 0) return [];
  const total = db.prepare("SELECT count(*) FROM passages").pluck().get() as number;
  const counts = db
    .prepare("SELECT term, doc FROM passage_vocab WHERE term IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(words)) as { term: string; doc: number }[];
  return counts.filter((c) => c.doc <= Math.max(1, total * COMMON_WORD_SHARE)).map((c) => c.term);
}

/** Each word as a quoted FTS5 term, any of them may match. Quoting keeps "OR", "NOT" or quotes inert. */
export function keywordQuery(words: string[]): string | null {
  return words.length ? words.map((w) => `"${w}"`).join(" OR ") : null;
}

/** Reciprocal rank fusion: a passage ranked high by either list rises; ranked by both, it rises most. */
export function fuse(rankings: number[][]): number[] {
  const scores = new Map<number, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function loadPassages(db: Db, ids: number[]): Passage[] {
  if (ids.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT passage_id, doc_id, ord, text FROM passages
       WHERE passage_id IN (SELECT value FROM json_each(?))`,
    )
    .all(JSON.stringify(ids)) as Passage[];
  const byId = new Map(rows.map((r) => [r.passage_id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
