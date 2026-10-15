import type { Db } from "./store/db.ts";
import type { DocId, StatusResult } from "./types.ts";

interface DocumentRow {
  version: string;
  indexed_at: string | null;
  revision: number;
  previous_path: string | null;
  deleted: number;
}

export function status(db: Db, docId: DocId): StatusResult {
  const row = db
    .prepare(
      "SELECT version, indexed_at, revision, previous_path, deleted FROM documents WHERE doc_id = ?",
    )
    .get(docId) as DocumentRow | undefined;

  if (!row || row.indexed_at === null) return { state: "not_indexed" };
  if (row.deleted) {
    return { state: "deleted", indexed_version: row.version, indexed_at: row.indexed_at };
  }
  return {
    state: "indexed",
    indexed_version: row.version,
    indexed_at: row.indexed_at,
    revision: row.revision,
    previous_path: row.previous_path,
  };
}
