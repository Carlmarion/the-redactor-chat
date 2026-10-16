// The eval set (data/sample/eval.json) and how one answer is judged against it.

import { readFile } from "node:fs/promises";
import type { AskResult, DocId, UserId } from "../types.ts";

export type Phase = "loaded" | "replayed";

export interface EvalQuestion {
  id: string;
  trap: string;
  phase: Phase;
  user: UserId;
  question: string;
  must_cite?: DocId[];
  must_not_cite?: DocId[];
  must_contain?: string[];
  expect_no_sources?: boolean;
}

/** `leak` is the one verdict that must never appear. `off_topic` passes but is worth a look. */
export type Verdict = "pass" | "off_topic" | "miss" | "leak";

export interface StatusCheck {
  phase: Phase;
  doc_id: DocId;
  /** "initial load", or "event at deliver_at_s <n>". */
  indexed_version_from?: string;
  path?: string;
  expect?: string;
}

export interface EvalSet {
  questions: EvalQuestion[];
  status_checks: StatusCheck[];
}

export async function loadEvalSet(path: string): Promise<EvalSet> {
  const set = JSON.parse(await readFile(path, "utf8")) as Partial<EvalSet>;
  return { questions: set.questions ?? [], status_checks: set.status_checks ?? [] };
}

export function judge(q: EvalQuestion, result: AskResult): Verdict {
  const cited = result.sources.map((s) => s.doc_id);
  if (cited.some((d) => q.must_not_cite?.includes(d))) return "leak";
  if (q.expect_no_sources) return cited.length === 0 ? "pass" : "miss";
  if (q.must_cite?.length) {
    const citesRight = cited.some((d) => q.must_cite?.includes(d));
    const containsAll = (q.must_contain ?? []).every((text) => result.answer.includes(text));
    return citesRight && containsAll ? "pass" : "miss";
  }
  return cited.length === 0 ? "pass" : "off_topic";
}
