// Every event the feed delivers is written down first, then worked on. The log is the audit
// trail (what arrived, when, and what we did with it) and the queue of work still to do.

import type { Db } from "../store/db.ts";
import { amsterdamIso } from "../time.ts";
import type { FeedEvent } from "../types.ts";

export interface LoggedEvent {
  event_id: number;
  received_at: string;
  kind: FeedEvent["kind"];
  doc_id: string | null;
  action: string | null;
  path: string | null;
  modified_at: string | null;
  payload: string;
}

export type Outcome = "ignored" | "deleted" | "reindexed" | "relabeled" | "touched" | "applied" | "unreadable";

export class EventLog {
  constructor(private readonly db: Db) {}

  /** Records a page of events and the cursor after it, together: none is lost or read twice. */
  record(events: FeedEvent[], cursor: string | null, receivedAt: Date): void {
    const insert = this.db.prepare(
      `INSERT INTO events (received_at, kind, doc_id, action, path, modified_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      for (const e of events) {
        const doc = e.kind === "document" ? e : null;
        insert.run(amsterdamIso(receivedAt), e.kind, doc?.doc_id ?? null, doc?.action ?? null, doc?.path ?? null, e.modified_at, JSON.stringify(e));
      }
      this.db.prepare("INSERT INTO feed_cursor (id, cursor) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET cursor = excluded.cursor").run(cursor);
    })();
  }

  cursor(): string | null {
    return (this.db.prepare("SELECT cursor FROM feed_cursor WHERE id = 1").pluck().get() as string | undefined) ?? null;
  }

  /** Events not worked on yet, oldest first. */
  pending(): LoggedEvent[] {
    return this.db
      .prepare(
        "SELECT event_id, received_at, kind, doc_id, action, path, modified_at, payload FROM events WHERE outcome IS NULL ORDER BY event_id",
      )
      .all() as LoggedEvent[];
  }

  close(eventIds: number[], outcome: Outcome, reason: string | null, appliedAt: string): void {
    const update = this.db.prepare("UPDATE events SET outcome = ?, reason = ?, applied_at = ? WHERE event_id = ?");
    for (const id of eventIds) update.run(outcome, reason, appliedAt, id);
  }
}
