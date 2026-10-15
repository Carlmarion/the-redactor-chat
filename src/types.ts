// Shapes of the two judge-facing calls and of what flows between components.
// Field-by-field reasoning: docs/contract.md.

export type DocId = string;
export type UserId = string;
export type PrincipalId = string;

export interface Source {
  doc_id: DocId;
  path: string;
  title: string;
  passage_id: number;
  snippet: string;
  url: string | null;
}

export interface AskResult {
  answer: string;
  sources: Source[];
}

/**
 * Always carries `indexed_version` and `indexed_at` (null when never indexed), so a caller that
 * reads only the contract's two fields never breaks. Never carries a path or title: `status`
 * takes no user, so it must not reveal where a document lives or what it is called (C11).
 */
export type StatusResult =
  | {
      state: "indexed";
      indexed_version: string;
      indexed_at: string;
      revision: number;
      /** Feed delivery → answerable, in seconds. Null when the state came from the initial load. */
      freshness_seconds: number | null;
    }
  /** Indexed, but no readable text: a scan or an image-only file (C12). */
  | { state: "not_searchable"; indexed_version: string; indexed_at: string; reason: "no_readable_text" }
  | { state: "deleted"; indexed_version: string; indexed_at: string }
  | { state: "not_indexed"; indexed_version: null; indexed_at: null };

/** A change event as served by the feed. Any action may appear (C4). */
export type FeedEvent =
  | { kind: "document"; doc_id: DocId; path: string; modified_at: string; action: string }
  | { kind: "access"; modified_at: string; change: AccessChange }
  | { kind: "unknown"; modified_at: string | null; raw: unknown };

export type AccessChange =
  | { op: "add_member" | "remove_member"; group: PrincipalId; user: UserId }
  | { op: "set_folder_rule"; folder: string; principals: PrincipalId[] };

export interface PermissionSnapshot {
  users: UserId[];
  groups: Record<PrincipalId, UserId[]>;
  folders: Record<string, PrincipalId[]>;
}

export interface Passage {
  passage_id: number;
  doc_id: DocId;
  ord: number;
  text: string;
}
