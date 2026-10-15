// Hybrid retrieval (decision 0003): nearest passages by meaning (sqlite-vec) and by keywords (FTS5),
// both restricted to the passages the user may read BEFORE ranking, then merged by reciprocal rank.

import type { Db } from "../store/db.ts";
import type { Passage } from "../types.ts";

/** Reciprocal rank fusion constant: dampens the weight of the very first ranks. Standard value. */
const RRF_K = 60;

export interface RetrievalQuery {
  text: string;
  vector: Float32Array;
  /** From visiblePassageIds: the only passages either search may look at. */
  visible: number[];
  limit: number;
}

export function retrieve(db: Db, query: RetrievalQuery): Passage[] {
  if (query.visible.length === 0) return [];
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

  const match = keywordQuery(query.text);
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
  return loadPassages(db, ids);
}

/** Each word of the question as a quoted FTS5 term, any of them may match. Null when there are none. */
export function keywordQuery(text: string): string | null {
  const words = text.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
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
