// What `ask`, `ingest`, `serve` and `demo` need: the store, the model loaded once, the metered
// embedder, the extractor and the answer policy.

import type { AskDeps } from "../ask.ts";
import { ANSWER_POLICY } from "../config.ts";
import { MeteredEmbedder } from "../simulator/metered-embedder.ts";
import { LocalEmbedder } from "../simulator/local-embedder.ts";
import { ReReadingExtractor } from "../simulator/rereading-extractor.ts";
import { SqliteCostLedger } from "../store/cost-ledger.ts";
import { openDb } from "../store/db.ts";

export interface System extends AskDeps {
  embedder: MeteredEmbedder;
}

export async function openSystem(dbPath: string): Promise<System> {
  const db = openDb(dbPath);
  const [model, extractor] = await Promise.all([LocalEmbedder.load(), ReReadingExtractor.load()]);
  return {
    db,
    embedder: new MeteredEmbedder(model, new SqliteCostLedger(db)),
    extractor,
    policy: ANSWER_POLICY,
  };
}
