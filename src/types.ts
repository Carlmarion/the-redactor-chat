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

export type StatusResult =
  | {
      state: "indexed";
      indexed_version: string;
      indexed_at: string;
      revision: number;
      previous_path: string | null;
    }
  | { state: "deleted"; indexed_version: string; indexed_at: string }
  | { state: "not_indexed" };

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
