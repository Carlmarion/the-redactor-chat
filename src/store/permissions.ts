// Stores the permission list from IT: who exists, who is in which group, which folder grants whom.
import type { PermissionSnapshot } from "../types.ts";
import type { Db } from "./db.ts";

/** Replaces every principal, membership and folder rule with the snapshot. Call inside a transaction. */
export function replacePermissions(db: Db, snapshot: PermissionSnapshot): void {
  db.exec("DELETE FROM memberships; DELETE FROM folder_access; DELETE FROM principals;");
  const principal = db.prepare("INSERT INTO principals (principal_id, kind) VALUES (?, ?)");
  const member = db.prepare("INSERT INTO memberships (user_id, group_id) VALUES (?, ?)");
  const rule = db.prepare("INSERT INTO folder_access (folder, principal_id) VALUES (?, ?)");

  for (const user of snapshot.users) principal.run(user, "user");
  for (const [group, users] of Object.entries(snapshot.groups)) {
    principal.run(group, "group");
    for (const user of users) member.run(user, group);
  }
  for (const [folder, principals] of Object.entries(snapshot.folders)) {
    for (const p of principals) rule.run(folder, p);
  }
}
