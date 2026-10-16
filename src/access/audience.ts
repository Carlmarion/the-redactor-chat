// Who, as people, a set of principals reaches. Used to tell whether a change widens access:
// "payroll" replacing "all-staff" is a narrowing, which comparing labels alone cannot see.

import type { Db } from "../store/db.ts";
import type { DocId, PrincipalId, UserId } from "../types.ts";

export function audienceOf(db: Db, principals: PrincipalId[]): Set<UserId> {
  if (principals.length === 0) return new Set();
  const users = db
    .prepare(
      `SELECT principal_id FROM principals
       WHERE kind = 'user' AND principal_id IN (SELECT value FROM json_each(?))
       UNION
       SELECT m.user_id FROM memberships m
       JOIN principals u ON u.principal_id = m.user_id AND u.kind = 'user'
       WHERE m.group_id IN (SELECT value FROM json_each(?))`,
    )
    .pluck()
    .all(JSON.stringify(principals), JSON.stringify(principals)) as UserId[];
  return new Set(users);
}

export function documentAudience(db: Db, docId: DocId): Set<UserId> {
  const principals = db.prepare("SELECT principal_id FROM doc_access WHERE doc_id = ?").pluck().all(docId) as PrincipalId[];
  return audienceOf(db, principals);
}

/** People in `after` who were not in `before`. Empty means the change only keeps or removes access. */
export function newcomers(before: Set<UserId>, after: Set<UserId>): UserId[] {
  return [...after].filter((u) => !before.has(u)).sort();
}
