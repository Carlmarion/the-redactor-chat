// What to do with one document event (decision 0006: reconcile, don't replay).
// Hand-written by the engineer. Pure: no database, no network, just the rules.
//
// The event only says "something happened to this document". What we do depends on what we
// already know (`known`) and on what the document source says now (`currentHash`).

export interface DocEvent {
  action: string;
  path: string;
  modified_at: string;
}

/** What the store knows about the document, or null if it has never seen it. */
export interface KnownState {
  version: string;
  path: string;
  content_hash: string | null;
  deleted: boolean;
}

export type Decision =
  | { kind: "ignore"; reason: "stale" }
  | { kind: "delete" }
  | { kind: "reindex" }
  | { kind: "relabel" }
  | { kind: "touch" };

/**
 * Rules, in order:
 * 1. We already hold a version at least as recent as the event → ignore (stale or duplicate).
 * 2. The source no longer has the document (currentHash null) → delete.
 * 3. We have never seen it, or it was deleted → reindex.
 * 4. Its text changed → reindex.
 * 5. Only its path changed → relabel (new access, no re-embedding).
 * 6. Nothing changed → touch (record the new version).
 */
export function decide(event: DocEvent, known: KnownState | null, currentHash: string | null): Decision {
  if(known && Date.parse(known.version) >= Date.parse(event.modified_at)) return {kind: "ignore", reason: "stale"};
  if(currentHash === null) return {kind: "delete"};
  if(!known || known.deleted) return {kind: "reindex"};
  if(currentHash !== known.content_hash) return {kind: "reindex"};
  if(event.path !== known.path) return {kind: "relabel"};
  return {kind: "touch"}
}
