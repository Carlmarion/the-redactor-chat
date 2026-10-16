// What `ask` and `serve` both need: the store, the model loaded once, the metered embedder,
// the extractor and the answer policy.

import type { AskDeps } from "../ask.ts";
import { ANSWER_POLICY } from "../config.ts";
import { MeteredEmbedder } from "../simulator/metered-embedder.ts";
import { LocalEmbedder } from "../simulator/local-embedder.ts";
import { LocalExtractor } from "../simulator/local-extractor.ts";
import { SqliteCostLedger } from "../store/cost-ledger.ts";
import { openDb } from "../store/db.ts";

export interface System extends AskDeps {
  embedder: MeteredEmbedder;
}

export async function openSystem(dbPath: string): Promise<System> {
  const db = openDb(dbPath);
  const model = await LocalEmbedder.load();
  return {
    db,
    embedder: new MeteredEmbedder(model, new SqliteCostLedger(db)),
    extractor: new LocalExtractor(model),
    policy: ANSWER_POLICY,
  };
}
