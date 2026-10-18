// `redactor ingest`: the initial load in batch mode (half price, no throttle: the brief's batch embed).

import { Indexer } from "../ingest/indexer.ts";
import { loadCorpus } from "../ingest/load.ts";
import type { Embedder } from "../ports.ts";
import { SampleData } from "../sources/sample-data.ts";
import { SqliteCostLedger } from "../store/cost-ledger.ts";
import type { Db } from "../store/db.ts";

/** `embedder` is the metered one, so the load shows up in the cost ledger. */
export async function ingest(db: Db, embedder: Embedder, dataDir: string) {
  const sample = new SampleData(dataDir);
  const ledger = new SqliteCostLedger(db);
  const mark = ledger.mark();
  const summary = await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, embedder, "batch"));
  return { ...summary, embed_cost: ledger.totalSince(mark) };
}
