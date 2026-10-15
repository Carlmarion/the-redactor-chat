// The one store (decision 0002). Most tables are derived: they can be rebuilt from the corpus,
// the permission list and the feed. `events` and `cost_ledger` are records of what happened
// and cannot be rebuilt; they are the part to back up.

import { EMBEDDING_MODEL } from "../config.ts";

export const SCHEMA_VERSION = 2;

export const SCHEMA = `
-- folder = the governing folder: the closest parent folder with an access rule (decision 0007).
CREATE TABLE documents (
  doc_id        TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  previous_path TEXT,
  title         TEXT NOT NULL,
  folder        TEXT,
  url           TEXT,
  content_hash  TEXT,
  version       TEXT NOT NULL,
  revision      INTEGER NOT NULL DEFAULT 0,
  indexed_at    TEXT,
  -- First feed event behind the current state; null when it came from the initial load.
  source_event_id INTEGER REFERENCES events(event_id),
  deleted       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE passages (
  passage_id  INTEGER PRIMARY KEY,
  doc_id      TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  text        TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  UNIQUE (doc_id, ord)
);

-- rowid = passage_id
CREATE VIRTUAL TABLE passage_vec USING vec0(embedding float[${EMBEDDING_MODEL.dimensions}] distance_metric=cosine);

-- rowid = passage_id
CREATE VIRTUAL TABLE passage_fts USING fts5(text, tokenize = 'unicode61 remove_diacritics 2');

CREATE TABLE principals (
  principal_id TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('user', 'group'))
);

CREATE TABLE memberships (
  user_id  TEXT NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES principals(principal_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE folder_access (
  folder       TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  PRIMARY KEY (folder, principal_id)
);

-- Effective access, derived from folder_access (decision 0007). A label, never inside an embedding.
CREATE TABLE doc_access (
  doc_id       TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL,
  PRIMARY KEY (doc_id, principal_id)
);
CREATE INDEX doc_access_by_principal ON doc_access (principal_id, doc_id);

CREATE TABLE events (
  event_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  kind        TEXT NOT NULL,
  doc_id      TEXT,
  action      TEXT,
  path        TEXT,
  modified_at TEXT,
  payload     TEXT NOT NULL,
  outcome     TEXT,
  reason      TEXT,
  applied_at  TEXT
);
CREATE INDEX events_by_doc ON events (doc_id, modified_at);

CREATE TABLE feed_cursor (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT
);

CREATE TABLE cost_ledger (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  operation TEXT NOT NULL,
  mode      TEXT NOT NULL,
  requests  INTEGER NOT NULL,
  tokens    INTEGER NOT NULL,
  eur       REAL NOT NULL
);
`;
