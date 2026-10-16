// The simulator's scripted-events mode: replays data/sample/feed-script.json against a clock.
// An event is served from its delivery time on. The document source answers with the text a
// document has at a given moment: the corpus, a scripted revision, or nothing once deleted.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocumentSource, SourceDocument } from "../ports.ts";
import { amsterdamIso } from "../time.ts";
import type { DocId } from "../types.ts";

interface ScriptEntry {
  deliver_at_s: number;
  modified_at_s?: number;
  modified_at?: string;
  event: Record<string, unknown>;
  text?: string;
}

interface Scheduled {
  deliverAt: number;
  /** Exactly what the feed serves: the event plus its modified_at. Never the text (C5). */
  served: Record<string, unknown>;
  docId: DocId | null;
  textFile: string | null;
}

export interface FeedPage {
  events: Record<string, unknown>[];
  cursor: string;
}

export class FeedScript {
  private constructor(
    private readonly dataDir: string,
    private readonly schedule: Scheduled[],
    private readonly corpus: DocumentSource,
  ) {}

  /** `start` is when the replay begins: event times in the script are seconds after it. */
  static async load(dataDir: string, start: Date, corpus: DocumentSource): Promise<FeedScript> {
    const script = JSON.parse(await readFile(join(dataDir, "feed-script.json"), "utf8")) as { events: ScriptEntry[] };
    const t0 = start.getTime();
    const schedule = script.events
      .map((entry): Scheduled => {
        const modified_at = entry.modified_at ?? amsterdamIso(new Date(t0 + (entry.modified_at_s ?? entry.deliver_at_s) * 1000));
        const docId = typeof entry.event.doc_id === "string" ? entry.event.doc_id : null;
        return { deliverAt: t0 + entry.deliver_at_s * 1000, served: { ...entry.event, modified_at }, docId, textFile: entry.text ?? null };
      })
      .sort((a, b) => a.deliverAt - b.deliverAt);
    return new FeedScript(dataDir, schedule, corpus);
  }

  /** Events delivered by `now` that come after `cursor` (the count already served). */
  eventsSince(cursor: string | null, now: number): FeedPage {
    const from = Number(cursor ?? 0) || 0;
    let to = from;
    while (to < this.schedule.length && (this.schedule[to]?.deliverAt ?? Infinity) <= now) to++;
    return { events: this.schedule.slice(from, to).map((s) => s.served), cursor: String(to) };
  }

  /** The document's text as of `now`, or null if it does not exist (yet, or any more). */
  async documentAt(docId: DocId, now: number): Promise<SourceDocument | null> {
    const delivered = this.schedule.filter((s) => s.docId === docId && s.deliverAt <= now);
    const last = delivered.at(-1);
    if (last?.served.action === "delete") return null;
    const revision = delivered.filter((s) => s.textFile).at(-1);
    if (revision?.textFile) return { text: await readFile(join(this.dataDir, revision.textFile), "utf8"), title: null };
    return this.corpus.read(docId);
  }

  /** When the last scripted event is delivered: the end of the replay. */
  get endsAt(): number {
    return this.schedule.at(-1)?.deliverAt ?? 0;
  }
}
