// Query-time access filter: who is asking → what they may read.
// Written by Carl (AGENTS.md). Everything the retriever searches goes through visiblePassageIds,
// so if this file is right, a leak is impossible by construction.
import type { Db } from "../store/db.ts";
import type { DocId, PrincipalId, UserId } from "../types.ts";

/**
 * The principals a user acts as: the user themself plus every group they belong to.
 * An id that is not a known user (unknown, removed, or a group's id) acts as nobody: [].
 */
export function principalsOf(db: Db, userId: UserId): PrincipalId[] {
  const user = db.prepare("SELECT 1 FROM principals WHERE kind = 'user' AND principal_id = ?").get(userId);
  if (!user) return [];
  const principalsList = db.prepare("SELECT group_id FROM memberships WHERE user_id = ?").pluck().all(userId) as PrincipalId[];
  return [userId, ...principalsList];
}

/** Ids of every passage the user may read. Empty when the user acts as nobody. */
export function visiblePassageIds(db: Db, userId: UserId): number[] {
  const principals = principalsOf(db, userId);
  if (principals.length === 0) return [];
  const passages = db
    .prepare(
      `SELECT DISTINCT p.passage_id
       FROM passages p
       JOIN doc_access a ON a.doc_id = p.doc_id
       JOIN documents d ON d.doc_id = p.doc_id
       WHERE a.principal_id IN (${principals.map(() => "?").join(",")})
         AND d.deleted = 0`,
    )
    .pluck()
    .all(...principals) as number[];
  return passages;
}

/** Whether the user may open one document. Same rule as above, for a single document. */
export function mayOpenDocument(db: Db, docId: DocId, userId: UserId): boolean {
  const principals = principalsOf(db, userId);
  if (principals.length === 0) return false;
  const hit = db
    .prepare(`SELECT 1 FROM doc_access WHERE doc_id = ? AND principal_id IN (${principals.map(() => "?").join(",")})`)
    .get(docId, ...principals);
  return hit !== undefined;
}
