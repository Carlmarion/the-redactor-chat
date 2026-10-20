// Who the people are and which folders each may open, for a person exploring the demo.
// Read through principalsOf, the same rule the access filter applies to every question.

import type { Db } from "../store/db.ts";
import type { PrincipalId, UserId } from "../types.ts";
import { principalsOf } from "./visible-passages.ts";

export interface Person {
  userId: UserId;
  groups: PrincipalId[];
}

export interface VisibleFolder {
  folder: string;
  documents: number;
}

/** Every user in the permission list, with their groups, in alphabetical order. */
export function people(db: Db): Person[] {
  const rows = db
    .prepare(
      `SELECT u.principal_id AS userId, m.group_id AS groupId
       FROM principals u LEFT JOIN memberships m ON m.user_id = u.principal_id
       WHERE u.kind = 'user'
       ORDER BY u.principal_id, m.group_id`,
    )
    .all() as { userId: UserId; groupId: PrincipalId | null }[];
  const byUser = new Map<UserId, PrincipalId[]>();
  for (const { userId, groupId } of rows) {
    const groups = byUser.get(userId) ?? [];
    if (groupId) groups.push(groupId);
    byUser.set(userId, groups);
  }
  return [...byUser].map(([userId, groups]) => ({ userId, groups }));
}

/** The folders whose documents the user may open, with how many live documents each holds. Unknown user → none. */
export function foldersSeenBy(db: Db, userId: UserId): VisibleFolder[] {
  const principals = principalsOf(db, userId);
  if (principals.length === 0) return [];
  return db
    .prepare(
      `SELECT d.folder AS folder, COUNT(DISTINCT d.doc_id) AS documents
       FROM documents d JOIN doc_access a ON a.doc_id = d.doc_id
       WHERE a.principal_id IN (SELECT value FROM json_each(?))
         AND d.deleted = 0
       GROUP BY d.folder
       ORDER BY d.folder`,
    )
    .all(JSON.stringify(principals)) as VisibleFolder[];
}
