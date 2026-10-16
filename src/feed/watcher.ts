// The feed watcher (decision 0008): poll from the cursor, write events down, then work through
// them. Team changes apply at once. Document events are coalesced per document; a change that
// would let new people see a document waits for a quiet second, so a document passing through a
// wider folder is never exposed. A change that only removes people applies at once.

import type { FeedReader } from "../ports.ts";
import type { Db } from "../store/db.ts";
import { amsterdamIso } from "../time.ts";
import type { AccessChange } from "../types.ts";
import { applyAccessChange } from "./access-changes.ts";
import type { EventLog, LoggedEvent } from "./event-log.ts";
import type { Reconciler } from "./reconciler.ts";

/** How long a document must be quiet before a change that widens its access is applied. */
export const WIDEN_SETTLE_MS = 1000;

export interface WatcherOptions {
  now?: () => number;
  settleMs?: number;
}

export class FeedWatcher {
  private readonly now: () => number;
  private readonly settleMs: number;

  constructor(
    private readonly db: Db,
    private readonly reader: FeedReader,
    private readonly log: EventLog,
    private readonly reconciler: Reconciler,
    options: WatcherOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.settleMs = options.settleMs ?? WIDEN_SETTLE_MS;
  }

  /** One round: fetch what is new, then work through everything pending. */
  async tick(): Promise<void> {
    const page = await this.reader.poll(this.log.cursor());
    if (page.events.length > 0 || page.cursor !== this.log.cursor()) {
      this.log.record(page.events, page.cursor, new Date(this.now()));
    }
    await this.work();
  }

  async run(intervalMs: number, signal: AbortSignal, onError: (e: unknown) => void): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.tick();
      } catch (error) {
        onError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  private async work(): Promise<void> {
    const pending = this.log.pending();
    for (const e of pending.filter((p) => p.kind !== "document")) this.applyNonDocument(e);

    const byDoc = new Map<string, LoggedEvent[]>();
    for (const e of pending.filter((p) => p.kind === "document" && p.doc_id)) {
      byDoc.set(e.doc_id ?? "", [...(byDoc.get(e.doc_id ?? "") ?? []), e]);
    }
    for (const events of byDoc.values()) {
      const plan = await this.reconciler.plan(events);
      if (plan.widensTo.length > 0 && !this.quietSince(events)) continue;
      await this.reconciler.apply(plan);
    }
  }

  private applyNonDocument(e: LoggedEvent): void {
    const at = amsterdamIso(new Date(this.now()));
    if (e.kind === "unknown") {
      this.log.close([e.event_id], "unreadable", "event shape not recognised; kept in the log", at);
      return;
    }
    const { change } = JSON.parse(e.payload) as { change: AccessChange };
    this.db.transaction(() => this.log.close([e.event_id], "applied", applyAccessChange(this.db, change), at))();
  }

  /** True once the document's last event is at least `settleMs` old. */
  private quietSince(events: LoggedEvent[]): boolean {
    const last = Math.max(...events.map((e) => Date.parse(e.received_at)));
    return this.now() - last >= this.settleMs;
  }
}
