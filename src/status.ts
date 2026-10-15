import type { Db } from "./store/db.ts";
import type { DocId, StatusResult } from "./types.ts";

interface DocumentRow {
  version: string;
  indexed_at: string | null;
  revision: number;
  deleted: number;
  passages: number;
  received_at: string | null;
}

export function status(db: Db, docId: DocId): StatusResult {
  const row = db
    .prepare(
      `SELECT d.version, d.indexed_at, d.revision, d.deleted,
              (SELECT count(*) FROM passages p WHERE p.doc_id = d.doc_id) AS passages,
              e.received_at
       FROM documents d LEFT JOIN events e ON e.event_id = d.source_event_id
       WHERE d.doc_id = ?`,
    )
    .get(docId) as DocumentRow | undefined;

  if (!row || row.indexed_at === null) return { state: "not_indexed", indexed_version: null, indexed_at: null };
  const stamp = { indexed_version: row.version, indexed_at: row.indexed_at };
  if (row.deleted) return { state: "deleted", ...stamp };
  if (row.passages === 0) return { state: "not_searchable", ...stamp, reason: "no_readable_text" };
  return {
    state: "indexed",
    ...stamp,
    revision: row.revision,
    freshness_seconds: row.received_at === null ? null : secondsBetween(row.received_at, row.indexed_at),
  };
}

function secondsBetween(from: string, to: string): number {
  return Math.round(Date.parse(to) - Date.parse(from)) / 1000;
}
