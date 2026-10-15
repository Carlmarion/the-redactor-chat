// Runs the eval set against a fresh in-memory store built from the sample data, so it never
// touches the real store. One row per question, with what the answer was based on.

import { askTraced } from "../ask.ts";
import type { AnswerPolicy } from "../answer-policy.ts";
import { Indexer } from "../ingest/indexer.ts";
import { loadCorpus } from "../ingest/load.ts";
import type { Embedder, Extractor } from "../ports.ts";
import { SampleData } from "../sources/sample-data.ts";
import { openDb } from "../store/db.ts";
import { judge, type EvalQuestion, type Phase, type Verdict } from "./eval-set.ts";

export interface EvalRow {
  id: string;
  user: string;
  score: number | null;
  shares_keyword: boolean;
  cited: string | null;
  expected: string;
  verdict: Verdict;
}

export interface EvalRun {
  passage_tokens: number;
  rows: EvalRow[];
  passed: number;
  total: number;
  leaks: number;
}

export interface EvalSetup {
  dataDir: string;
  embedder: Embedder;
  extractor: Extractor;
  policy: AnswerPolicy;
  passageTokens: number;
}

export async function runEval(setup: EvalSetup, questions: EvalQuestion[], phase: Phase): Promise<EvalRun> {
  const db = openDb(":memory:");
  const sample = new SampleData(setup.dataDir);
  const indexer = new Indexer(db, setup.embedder, "batch", setup.passageTokens);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, indexer);

  const rows: EvalRow[] = [];
  for (const q of questions.filter((q) => q.phase === phase)) {
    const { result, trace } = await askTraced({ ...setup, db }, q.user, q.question);
    rows.push({
      id: q.id,
      user: q.user,
      score: trace.score,
      shares_keyword: trace.sharesKeyword,
      cited: result.sources[0]?.doc_id ?? null,
      expected: expectation(q),
      verdict: judge(q, result),
    });
  }
  return {
    passage_tokens: setup.passageTokens,
    rows,
    passed: rows.filter((r) => r.verdict === "pass").length,
    total: rows.length,
    leaks: rows.filter((r) => r.verdict === "leak").length,
  };
}

function expectation(q: EvalQuestion): string {
  if (q.expect_no_sources) return "nothing";
  if (q.must_cite?.length) return q.must_cite.join("|");
  return `not ${q.must_not_cite?.join(",") ?? "-"}`;
}

/** A plain-text table for people; `--json` prints the run itself. */
export function formatRun(run: EvalRun): string {
  const lines = run.rows.map((r) =>
    [
      r.id.padEnd(4),
      r.user.padEnd(6),
      (r.score?.toFixed(3) ?? "  -  ").padEnd(6),
      (r.shares_keyword ? "word" : "    ").padEnd(5),
      (r.cited ?? "-").padEnd(4),
      r.expected.padEnd(12),
      r.verdict.toUpperCase(),
    ].join(" "),
  );
  return [
    `passages ≤ ${run.passage_tokens} tokens: ${run.passed}/${run.total} pass, ${run.leaks} leaks`,
    "id   user   score  key   got  expected     verdict",
    ...lines,
  ].join("\n");
}
