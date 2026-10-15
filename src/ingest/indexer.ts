// Makes one state of a document answerable. Text is cut and embedded first (slow, async);
// then passages, vectors, keywords, access labels and the status stamp are written in one
// transaction, so a reader sees either the old state or the new one, never a mix.

import { createHash } from "node:crypto";
import { labelDocument } from "../access/doc-access.ts";
import { PASSAGE_TOKENS } from "../config.ts";
import { PASSAGE_MAX_TOKENS } from "../simulator/limits.ts";
import { amsterdamIso } from "../time.ts";
import type { EmbedMode, Embedder } from "../ports.ts";
import type { Db } from "../store/db.ts";
import type { DocId } from "../types.ts";
import { chunk } from "./chunker.ts";
import { hasReadableText, toPlainText } from "./plain-text.ts";

export interface DocumentState {
  doc_id: DocId;
  path: string;
  title: string;
  url: string | null;
  text: string;
  /** `modified_at` of this state; the export time for the initial load. */
  version: string;
  /** First feed event behind this state; null for the initial load. */
  source_event_id: number | null;
}

export interface IndexOutcome {
  passages: number;
  searchable: boolean;
}

export class Indexer {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
    private readonly mode: EmbedMode,
    private readonly passageTokens: number = PASSAGE_TOKENS,
  ) {
    if (passageTokens > PASSAGE_MAX_TOKENS) throw new Error(`passages are capped at ${PASSAGE_MAX_TOKENS} tokens`);
  }

  async index(state: DocumentState): Promise<IndexOutcome> {
    const plain = toPlainText(state.text);
    const passages = hasReadableText(plain) ? chunk(plain, (t) => this.embedder.countTokens(t, "passage"), this.passageTokens) : [];
    const vectors = await this.embedder.embed(passages, "passage", this.mode);
    this.db.transaction(() => this.write(state, passages, vectors))();
    return { passages: passages.length, searchable: passages.length > 0 };
  }

  private write(state: DocumentState, passages: string[], vectors: Float32Array[]): void {
    const { db } = this;
    const previous = db.prepare("SELECT path, previous_path FROM documents WHERE doc_id = ?").get(state.doc_id) as
      | { path: string; previous_path: string | null }
      | undefined;
    const previousPath = previous && previous.path !== state.path ? previous.path : (previous?.previous_path ?? null);

    db.prepare(
      `INSERT INTO documents (doc_id, path, previous_path, title, url, content_hash, version, revision, indexed_at, source_event_id, deleted)
       VALUES (@doc_id, @path, @previous_path, @title, @url, @content_hash, @version, 1, @indexed_at, @source_event_id, 0)
       ON CONFLICT (doc_id) DO UPDATE SET
         path = excluded.path, previous_path = excluded.previous_path, title = excluded.title, url = excluded.url,
         content_hash = excluded.content_hash, version = excluded.version, revision = revision + 1,
         indexed_at = excluded.indexed_at, source_event_id = excluded.source_event_id, deleted = 0`,
    ).run({
      doc_id: state.doc_id,
      path: state.path,
      previous_path: previousPath,
      title: state.title,
      url: state.url,
      content_hash: createHash("sha256").update(state.text).digest("hex"),
      version: state.version,
      indexed_at: amsterdamIso(),
      source_event_id: state.source_event_id,
    });

    this.replacePassages(state.doc_id, passages, vectors);
    labelDocument(db, state.doc_id, state.path);
  }

  /** Virtual tables do not cascade, so their rows are removed by hand. */
  private replacePassages(docId: DocId, passages: string[], vectors: Float32Array[]): void {
    const { db } = this;
    const oldIds = db.prepare("SELECT passage_id FROM passages WHERE doc_id = ?").pluck().all(docId) as number[];
    const dropVec = db.prepare("DELETE FROM passage_vec WHERE rowid = ?");
    const dropFts = db.prepare("DELETE FROM passage_fts WHERE rowid = ?");
    for (const id of oldIds) {
      dropVec.run(BigInt(id));
      dropFts.run(id);
    }
    db.prepare("DELETE FROM passages WHERE doc_id = ?").run(docId);

    const insert = db.prepare("INSERT INTO passages (doc_id, ord, text, token_count) VALUES (?, ?, ?, ?)");
    const insertVec = db.prepare("INSERT INTO passage_vec (rowid, embedding) VALUES (?, ?)");
    const insertFts = db.prepare("INSERT INTO passage_fts (rowid, text) VALUES (?, ?)");
    passages.forEach((text, ord) => {
      const id = BigInt(insert.run(docId, ord, text, this.embedder.countTokens(text, "passage")).lastInsertRowid);
      const vector = vectors[ord];
      if (!vector) throw new Error(`No vector for passage ${ord} of ${docId}`);
      insertVec.run(id, vector);
      insertFts.run(id, text);
    });
  }
}
