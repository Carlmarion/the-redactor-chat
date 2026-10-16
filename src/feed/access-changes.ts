// Team and folder changes arriving on the feed (A8). Memberships are read at question time,
// so joining or leaving a team takes effect on the very next question, with nothing to relabel.
// A folder rule change relabels the documents it governs.

import { labelDocument } from "../access/doc-access.ts";
import type { Db } from "../store/db.ts";
import type { AccessChange } from "../types.ts";

/** Applies one change. Returns a sentence for the event log. Call inside a transaction. */
export function applyAccessChange(db: Db, change: AccessChange): string {
  const principal = db.prepare("INSERT OR IGNORE INTO principals (principal_id, kind) VALUES (?, ?)");
  switch (change.op) {
    case "add_member":
      principal.run(change.user, "user");
      principal.run(change.group, "group");
      db.prepare("INSERT OR IGNORE INTO memberships (user_id, group_id) VALUES (?, ?)").run(change.user, change.group);
      return `${change.user} joined ${change.group}`;
    case "remove_member":
      db.prepare("DELETE FROM memberships WHERE user_id = ? AND group_id = ?").run(change.user, change.group);
      return `${change.user} left ${change.group}`;
    case "set_folder_rule": {
      db.prepare("DELETE FROM folder_access WHERE folder = ?").run(change.folder);
      const rule = db.prepare("INSERT INTO folder_access (folder, principal_id) VALUES (?, ?)");
      for (const p of change.principals) rule.run(change.folder, p);
      const docs = db.prepare("SELECT doc_id, path FROM documents WHERE deleted = 0").all() as { doc_id: string; path: string }[];
      for (const d of docs) labelDocument(db, d.doc_id, d.path);
      return `${change.folder} now open to ${change.principals.join(", ") || "nobody"}`;
    }
  }
}
