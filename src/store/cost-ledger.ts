import type { CostEntry, CostLedger } from "../ports.ts";
import type { Db } from "./db.ts";

export class SqliteCostLedger implements CostLedger {
  private readonly insert;

  constructor(db: Db) {
    this.insert = db.prepare(
      "INSERT INTO cost_ledger (at, operation, mode, requests, tokens, eur) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  record(entry: CostEntry): void {
    this.insert.run(new Date().toISOString(), entry.operation, entry.mode, entry.requests, entry.tokens, entry.eur);
  }
}
