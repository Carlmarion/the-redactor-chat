// The judge's main call: ask(user_id, question) -> {answer, sources[]}.
// Who the user acts as → which passages they may read → search only those → best passage.

import { principalsOf, visiblePassageIds } from "./access/visible-passages.ts";
import { answerBand, type AnswerBand, type AnswerPolicy } from "./answer-policy.ts";
import type { Embedder, Extractor } from "./ports.ts";
import { retrieve } from "./retrieval/retriever.ts";
import { EXTRACT } from "./simulator/limits.ts";
import type { Db } from "./store/db.ts";
import type { AskResult, Passage, Source, UserId } from "./types.ts";

export const NOT_FOUND = "I could not find this in the documents you can access.";
export const CLOSEST = "The closest I found, it may not fully answer your question:";
export const UNKNOWN_USER = "You are not in the access list yet, so I cannot search any documents for you. Please ask IT to add you.";

const SNIPPET_CHARS = 240;

export interface AskDeps {
  db: Db;
  embedder: Embedder;
  extractor: Extractor;
  policy: AnswerPolicy;
}

/** What the answer was based on: for evals and calibration, never shown to staff. */
export interface AskTrace {
  score: number | null;
  band: AnswerBand;
}

export async function ask(deps: AskDeps, userId: UserId, question: string): Promise<AskResult> {
  return (await askTraced(deps, userId, question)).result;
}

export async function askTraced(
  { db, embedder, extractor, policy }: AskDeps,
  userId: UserId,
  question: string,
): Promise<{ result: AskResult; trace: AskTrace }> {
  const none = (answer: string, trace: AskTrace = { score: null, band: "not_found" }) => ({
    result: { answer, sources: [] },
    trace,
  });
  if (principalsOf(db, userId).length === 0) return none(UNKNOWN_USER);

  const visible = visiblePassageIds(db, userId);
  if (visible.length === 0) return none(NOT_FOUND);

  const [vector] = await embedder.embed([question], "query", "realtime");
  if (!vector) throw new Error("the embedder returned no vector for the question");

  const passages = retrieve(db, { text: question, vector, visible, limit: EXTRACT.maxPassages });
  const best = await extractor.extract(question, passages);
  if (!best) return none(NOT_FOUND);

  const trace = { score: best.score, band: answerBand(best.score, policy) };
  if (trace.band === "not_found") return none(NOT_FOUND, trace);
  const answer = trace.band === "closest" ? `${CLOSEST}\n\n${best.passage.text}` : best.passage.text;
  return { result: { answer, sources: [toSource(db, best.passage)] }, trace };
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
