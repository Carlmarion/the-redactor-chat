// The judge's main call: ask(user_id, question) -> {answer, sources[]}.
// Who the user acts as → which passages they may read → search only those → best passage.

import { principalsOf, visiblePassageIds } from "./access/visible-passages.ts";
import type { Embedder, Extractor } from "./ports.ts";
import { retrieve } from "./retrieval/retriever.ts";
import { EXTRACT } from "./simulator/limits.ts";
import type { Db } from "./store/db.ts";
import type { AskResult, Passage, Source, UserId } from "./types.ts";

export const NOT_FOUND = "I could not find this in the documents you can access.";
export const UNKNOWN_USER = "You are not in the access list yet, so I cannot search any documents for you. Please ask IT to add you.";

const SNIPPET_CHARS = 240;

export interface AskDeps {
  db: Db;
  embedder: Embedder;
  extractor: Extractor;
}

export async function ask({ db, embedder, extractor }: AskDeps, userId: UserId, question: string): Promise<AskResult> {
  if (principalsOf(db, userId).length === 0) return { answer: UNKNOWN_USER, sources: [] };

  const visible = visiblePassageIds(db, userId);
  if (visible.length === 0) return { answer: NOT_FOUND, sources: [] };

  const [vector] = await embedder.embed([question], "query", "realtime");
  if (!vector) throw new Error("the embedder returned no vector for the question");

  const candidates = retrieve(db, { text: question, vector, visible, limit: EXTRACT.maxPassages });
  const best = await extractor.extract(question, candidates);
  if (!best) return { answer: NOT_FOUND, sources: [] };

  return { answer: best.passage.text, sources: [toSource(db, best.passage)] };
}

function toSource(db: Db, passage: Passage): Source {
  const doc = db.prepare("SELECT path, title, url FROM documents WHERE doc_id = ?").get(passage.doc_id) as {
    path: string;
    title: string;
    url: string | null;
  };
  const snippet = passage.text.length > SNIPPET_CHARS ? `${passage.text.slice(0, SNIPPET_CHARS).trimEnd()}…` : passage.text;
  return { doc_id: passage.doc_id, path: doc.path, title: doc.title, passage_id: passage.passage_id, snippet, url: doc.url };
}
