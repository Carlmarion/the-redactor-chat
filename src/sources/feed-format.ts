// Mapping layer for the change feed: whatever the wire carries becomes a FeedEvent.
// Shapes we cannot read are kept as "unknown" (logged, never dropped silently, C4).

import type { AccessChange, FeedEvent } from "../types.ts";

const ACCESS_OPS = new Set(["add_member", "remove_member", "set_folder_rule"]);

export function parseFeedEvent(raw: unknown): FeedEvent {
  const e = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const modified_at = typeof e.modified_at === "string" ? e.modified_at : null;
  const change = e.change as Record<string, unknown> | undefined;

  if (e.action === "access" && modified_at && change && ACCESS_OPS.has(String(change.op))) {
    return { kind: "access", modified_at, change: change as unknown as AccessChange };
  }
  if (typeof e.doc_id === "string" && typeof e.path === "string" && typeof e.action === "string" && modified_at) {
    return { kind: "document", doc_id: e.doc_id, path: e.path, modified_at, action: e.action };
  }
  return { kind: "unknown", modified_at, raw };
}
