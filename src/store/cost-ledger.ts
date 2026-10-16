import type { CostEntry, CostLedger } from "../ports.ts";
import { amsterdamIso } from "../time.ts";
import type { Db } from "./db.ts";

export class SqliteCostLedger implements CostLedger {
  private readonly insert;

  constructor(private readonly db: Db) {
    this.insert = db.prepare(
      "INSERT INTO cost_ledger (at, operation, mode, requests, tokens, eur) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  record(entry: CostEntry): void {
    this.insert.run(amsterdamIso(), entry.operation, entry.mode, entry.requests, entry.tokens, entry.eur);
  }

  /** A bookmark in the ledger, to total what a run spent with `totalSince`. */
  mark(): number {
    return this.db.prepare("SELECT coalesce(max(id), 0) FROM cost_ledger").pluck().get() as number;
  }

  totalSince(mark: number): { tokens: number; eur: number } {
    return this.db
      .prepare("SELECT coalesce(sum(tokens), 0) AS tokens, round(coalesce(sum(eur), 0), 6) AS eur FROM cost_ledger WHERE id > ?")
      .get(mark) as { tokens: number; eur: number };
  }

  /** What the simulator calls would have cost, per operation and mode, plus the total. */
  summary(): { lines: CostLine[]; total: CostLine } {
    const lines = this.db
      .prepare(
        `SELECT operation, mode, sum(requests) AS requests, sum(tokens) AS tokens, round(sum(eur), 6) AS eur
         FROM cost_ledger GROUP BY operation, mode ORDER BY operation, mode`,
      )
      .all() as CostLine[];
    const total = lines.reduce(
      (t, l) => ({ ...t, requests: t.requests + l.requests, tokens: t.tokens + l.tokens, eur: Math.round((t.eur + l.eur) * 1e6) / 1e6 }),
      { operation: "total", mode: "", requests: 0, tokens: 0, eur: 0 },
    );
    return { lines, total };
  }
}

export interface CostLine {
  operation: string;
  mode: string;
  requests: number;
  tokens: number;
  eur: number;
}
