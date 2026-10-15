// The initial load: permission list first (access labels depend on it), then every document
// in the corpus export. Each document is indexed on its own, so one bad file stops nothing.

import type { CorpusSource, DocumentSource, PermissionSource } from "../ports.ts";
import type { Db } from "../store/db.ts";
import { replacePermissions } from "../store/permissions.ts";
import type { DocId, PrincipalId } from "../types.ts";
import type { Indexer } from "./indexer.ts";

export interface LoadSources {
  corpus: CorpusSource;
  documents: DocumentSource;
  permissions: PermissionSource;
}

/** A document whose exported `allowed` list differs from its folder rule. The folder wins (C3). */
export interface AccessMismatch {
  doc_id: DocId;
  allowed: PrincipalId[];
  granted: PrincipalId[];
}

export interface LoadSummary {
  documents: number;
  passages: number;
  not_searchable: DocId[];
  missing: DocId[];
  access_mismatches: AccessMismatch[];
}

export async function loadCorpus(db: Db, sources: LoadSources, indexer: Indexer): Promise<LoadSummary> {
  const snapshot = await sources.permissions.load();
  db.transaction(() => replacePermissions(db, snapshot))();

  const { exported_at, documents } = await sources.corpus.list();
  const summary: LoadSummary = { documents: 0, passages: 0, not_searchable: [], missing: [], access_mismatches: [] };
  const granted = db.prepare("SELECT principal_id FROM doc_access WHERE doc_id = ? ORDER BY principal_id").pluck();

  for (const entry of documents) {
    const source = await sources.documents.read(entry.doc_id);
    if (!source) {
      summary.missing.push(entry.doc_id);
      continue;
    }
    const outcome = await indexer.index({
      doc_id: entry.doc_id,
      path: entry.path,
      title: source.title ?? entry.title,
      url: entry.url,
      text: source.text,
      version: exported_at,
      source_event_id: null,
    });
    summary.documents += 1;
    summary.passages += outcome.passages;
    if (!outcome.searchable) summary.not_searchable.push(entry.doc_id);

    const actual = granted.all(entry.doc_id) as PrincipalId[];
    if (!sameSet(entry.allowed, actual)) {
      summary.access_mismatches.push({ doc_id: entry.doc_id, allowed: entry.allowed, granted: actual });
    }
  }
  return summary;
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}
