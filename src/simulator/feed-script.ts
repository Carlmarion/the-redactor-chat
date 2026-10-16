// The simulator's scripted-events mode: replays data/sample/feed-script.json against a clock.
// An event is served from its delivery time on. The document source answers with the text a
// document has at a given moment: the corpus, a scripted revision, or nothing once deleted.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocumentSource, SourceDocument } from "../ports.ts";
import { amsterdamIso } from "../time.ts";
import type { DocId } from "../types.ts";

interface ScriptEntry {
  trap?: string;
  deliver_at_s: number;
  modified_at_s?: number;
  modified_at?: string;
  event: Record<string, unknown>;
  text?: string;
}

interface Scheduled {
  /** Infinity until released, in step mode. */
  deliverAt: number;
  trap: string | null;
  /** Exactly what the feed serves: the event plus its modified_at. Never the text (C5). */
  served: Record<string, unknown>;
  docId: DocId | null;
  textFile: string | null;
}

export interface ReplayOptions {
  /** Path of the script; default `<dataDir>/feed-script.json`. */
  scriptPath?: string;
  /** Stretches the script's times: 3 plays it three times slower. */
  pace?: number;
  /** Nothing is delivered until `releaseNext` is called: one event per press of Enter. */
  step?: boolean;
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

  /**
   * `start` is when the replay begins: event times in the script are seconds after it.
   * Revision files named in the script are read relative to `dataDir`.
   * `modified_at` keeps the script's order in step mode too, so duplicates stay duplicates.
   */
  static async load(dataDir: string, start: Date, corpus: DocumentSource, options: ReplayOptions = {}): Promise<FeedScript> {
    const scriptPath = options.scriptPath ?? join(dataDir, "feed-script.json");
    const script = JSON.parse(await readFile(scriptPath, "utf8")) as { events: ScriptEntry[] };
    const t0 = start.getTime();
    const pace = options.pace ?? 1;
    const schedule = script.events
      .sort((a, b) => a.deliver_at_s - b.deliver_at_s)
      .map((entry): Scheduled => {
        const modified_at = entry.modified_at ?? amsterdamIso(new Date(t0 + (entry.modified_at_s ?? entry.deliver_at_s) * pace * 1000));
        const docId = typeof entry.event.doc_id === "string" ? entry.event.doc_id : null;
        const deliverAt = options.step ? Infinity : t0 + entry.deliver_at_s * pace * 1000;
        return { deliverAt, trap: entry.trap ?? null, served: { ...entry.event, modified_at }, docId, textFile: entry.text ?? null };
      });
    return new FeedScript(dataDir, schedule, corpus);
  }

  /**
   * Events delivered by `now` that come after `cursor` (the count already served). A cursor
   * beyond what has been delivered means the reader followed an earlier replay: the answer's
   * lower cursor tells it the feed was reset.
   */
  eventsSince(cursor: string | null, now: number): FeedPage {
    const delivered = this.schedule.filter((s) => s.deliverAt <= now).length;
    const from = Number(cursor ?? 0) || 0;
    if (from > delivered) return { events: [], cursor: String(delivered) };
    return { events: this.schedule.slice(from, delivered).map((s) => s.served), cursor: String(delivered) };
  }

  /** Step mode: delivers the next event now. Returns it, or null when the script is over. */
  releaseNext(now: number): { index: number; trap: string | null; event: Record<string, unknown> } | null {
    const index = this.schedule.findIndex((s) => s.deliverAt === Infinity);
    const next = this.schedule[index];
    if (!next) return null;
    next.deliverAt = now;
    return { index, trap: next.trap, event: next.served };
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
