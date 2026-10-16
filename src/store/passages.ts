// Removing a document's passages everywhere they live. Virtual tables (vectors, keywords) do not
// cascade, so their rows are removed by hand. Call inside a transaction.
import type { DocId } from "../types.ts";
import type { Db } from "./db.ts";

export function dropPassages(db: Db, docId: DocId): void {
  const ids = db.prepare("SELECT passage_id FROM passages WHERE doc_id = ?").pluck().all(docId) as number[];
  const dropVec = db.prepare("DELETE FROM passage_vec WHERE rowid = ?");
  const dropFts = db.prepare("DELETE FROM passage_fts WHERE rowid = ?");
  for (const id of ids) {
    dropVec.run(BigInt(id));
    dropFts.run(id);
  }
  db.prepare("DELETE FROM passages WHERE doc_id = ?").run(docId);
}
