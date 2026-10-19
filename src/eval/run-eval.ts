// Runs the eval set against a fresh in-memory store built from the sample data, so it never
// touches the real store. Phase "loaded": right after the initial load. Phase "replayed": after
// the whole scripted feed has been applied by the real watcher and reconciler.

import { askTraced } from "../ask.ts";
import type { AnswerBand, AnswerPolicy } from "../answer-policy.ts";
import { EventLog } from "../feed/event-log.ts";
import { Reconciler } from "../feed/reconciler.ts";
import { FeedWatcher, WIDEN_SETTLE_MS } from "../feed/watcher.ts";
import { Indexer } from "../ingest/indexer.ts";
import { loadCorpus } from "../ingest/load.ts";
import type { Embedder, Extractor } from "../ports.ts";
import { FeedScript } from "../simulator/feed-script.ts";
import { parseFeedEvent } from "../sources/feed-format.ts";
import { SampleData } from "../sources/sample-data.ts";
import type { Db } from "../store/db.ts";
import { openDb } from "../store/db.ts";
import { status } from "../status.ts";
import { amsterdamIso } from "../time.ts";
import { judge, type EvalQuestion, type EvalSet, type Phase, type StatusCheck, type Verdict } from "./eval-set.ts";

export interface EvalRow {
  id: string;
  user: string;
  score: number | null;
  band: AnswerBand;
  cited: string | null;
  expected: string;
  verdict: Verdict;
}

export interface StatusRow {
  doc_id: string;
  expected: string;
  got: string;
  pass: boolean;
}

export interface EvalRun {
  phase: Phase;
  passage_tokens: number;
  rows: EvalRow[];
  status: StatusRow[];
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

export async function runEval(setup: EvalSetup, set: EvalSet, phase: Phase): Promise<EvalRun> {
  const db = openDb(":memory:");
  const sample = new SampleData(setup.dataDir);
  const indexer = new Indexer(db, setup.embedder, "batch", setup.passageTokens);
  await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, indexer);
  const replayStart = phase === "replayed" ? await replayFeed(db, setup.dataDir, indexer, sample) : null;

  const rows: EvalRow[] = [];
  for (const q of set.questions.filter((q) => q.phase === phase)) {
    const { result, trace } = await askTraced({ ...setup, db }, q.user, q.question);
    rows.push({
      id: q.id,
      user: q.user,
      score: trace.score,
      band: trace.band,
      cited: result.sources[0]?.doc_id ?? null,
      expected: expectation(q),
      verdict: judge(q, result),
    });
  }
  const exportedAt = (await sample.list()).exported_at;
  const statusRows = set.status_checks.filter((c) => c.phase === phase).map((c) => checkStatus(db, c, exportedAt, replayStart));
  return {
    phase,
    passage_tokens: setup.passageTokens,
    rows,
    status: statusRows,
    passed: rows.filter((r) => r.verdict === "pass").length,
    total: rows.length,
    leaks: rows.filter((r) => r.verdict === "leak").length,
  };
}

/** Plays the whole script as if it had started long enough ago, through the real watcher. */
async function replayFeed(db: Db, dataDir: string, indexer: Indexer, sample: SampleData): Promise<number> {
  const start = Date.now() - 3_600_000;
  const script = await FeedScript.load(dataDir, new Date(start), sample);
  let now = Date.now();
  const log = new EventLog(db);
  const watcher = new FeedWatcher(
    db,
    { poll: (cursor) => Promise.resolve(((p) => ({ events: p.events.map(parseFeedEvent), cursor: p.cursor }))(script.eventsSince(cursor, now))) },
    log,
    new Reconciler(db, indexer, { read: (id) => script.documentAt(id, now) }, log),
    { now: () => now },
  );
  await watcher.tick();
  now += WIDEN_SETTLE_MS + 1;
  await watcher.tick();
  return start;
}

function checkStatus(db: Db, c: StatusCheck, exportedAt: string, replayStart: number | null): StatusRow {
  const s = status(db, c.doc_id);
  const path = db.prepare("SELECT path FROM documents WHERE doc_id = ?").pluck().get(c.doc_id) as string | undefined;
  const parts: [string, string, boolean][] = [];
  if (c.expect) parts.push([c.expect, s.state, s.state === c.expect]);
  if (c.path) parts.push([c.path, path ?? "-", path === c.path]);
  const delivery = /deliver_at_s (\d+(?:\.\d+)?)/.exec(c.indexed_version_from ?? "")?.[1];
  if (c.indexed_version_from === "initial load") parts.push([exportedAt, String(s.indexed_version), s.indexed_version === exportedAt]);
  if (delivery && replayStart !== null) {
    const expected = amsterdamIso(new Date(replayStart + Number(delivery) * 1000));
    parts.push([expected, String(s.indexed_version), s.indexed_version === expected]);
  }
  return { doc_id: c.doc_id, expected: parts.map((p) => p[0]).join(" "), got: parts.map((p) => p[1]).join(" "), pass: parts.every((p) => p[2]) };
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
      r.band.padEnd(9),
      (r.cited ?? "-").padEnd(4),
      r.expected.padEnd(12),
      r.verdict.toUpperCase(),
    ].join(" "),
  );
  const checks = run.status.map((s) => `status ${s.doc_id.padEnd(4)} ${s.pass ? "PASS" : "MISS"}  expected ${s.expected}, got ${s.got}`);
  return [
    `${run.phase}, passages ≤ ${run.passage_tokens} tokens: ${run.passed}/${run.total} pass, ${run.leaks} leaks`,
    "id   user   score  band      got  expected     verdict",
    ...lines,
    ...checks,
  ].join("\n");
}
