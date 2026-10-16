// Write-time access labels (decision 0007). A document is governed by its closest parent
// folder that has a rule; its principals are that folder's. No rule anywhere → nobody (fail closed).
// The `allowed` list exported with a document is not used here: the folder wins (C3).

import type { Db } from "../store/db.ts";
import type { DocId, PrincipalId } from "../types.ts";

/** The closest parent folder of `path` that has a rule, or null. */
export function governingFolder(path: string, ruledFolders: Iterable<string>): string | null {
  let best: string | null = null;
  for (const folder of ruledFolders) {
    const isParent = path.startsWith(folder.endsWith("/") ? folder : `${folder}/`);
    if (isParent && (best === null || folder.length > best.length)) best = folder;
  }
  return best;
}

export interface FolderRule {
  folder: string | null;
  principals: PrincipalId[];
}

/** The rule that governs a path, from the folder rules in the store. No rule → nobody. */
export function ruleFor(db: Db, path: string): FolderRule {
  const rules = db.prepare("SELECT folder, principal_id FROM folder_access").all() as {
    folder: string;
    principal_id: PrincipalId;
  }[];
  const folder = governingFolder(path, new Set(rules.map((r) => r.folder)));
  return { folder, principals: rules.filter((r) => r.folder === folder).map((r) => r.principal_id) };
}

/** Recomputes a document's governing folder and access labels. Call inside a transaction. */
export function labelDocument(db: Db, docId: DocId, path: string): FolderRule {
  const { folder, principals } = ruleFor(db, path);

  db.prepare("DELETE FROM doc_access WHERE doc_id = ?").run(docId);
  const insert = db.prepare("INSERT INTO doc_access (doc_id, principal_id) VALUES (?, ?)");
  for (const principal of principals) insert.run(docId, principal);
  db.prepare("UPDATE documents SET folder = ? WHERE doc_id = ?").run(folder, docId);
  return { folder, principals };
}
