// `redactor serve`: answers over HTTP with the model loaded once, and, given a feed URL,
// follows the feed in the same process so answers stay current.

import { EventLog } from "../feed/event-log.ts";
import { Reconciler } from "../feed/reconciler.ts";
import { FeedWatcher } from "../feed/watcher.ts";
import { apiServer } from "../http/api-server.ts";
import { Indexer } from "../ingest/indexer.ts";
import { HttpDocumentSource, HttpFeedReader } from "../sources/http-feed.ts";
import { listen } from "./ports.ts";
import { openSystem, type System } from "./system.ts";

export interface ServeOptions {
  dbPath: string;
  port: number;
  feedUrl?: string;
  documentsUrl?: string;
}

export type Say = (line: string) => void;

export async function runServe(o: ServeOptions): Promise<never> {
  const system = await openSystem(o.dbPath);
  const say: Say = (line) => process.stderr.write(`${amsterdamTime()} ${line}\n`);
  await startApi(system, o.port, say);
  if (o.feedUrl) followFeed(system, o.feedUrl, o.documentsUrl, say);
  return new Promise<never>(() => undefined);
}

export async function startApi(system: System, port: number, say: Say): Promise<void> {
  await listen(apiServer(system), port, say);
  say(`answering on http://localhost:${port}  (POST /ask, GET /status/<doc_id>)`);
}

/** Polls the feed every second and reconciles; every decision is told through `say`. */
export function followFeed(system: System, feedUrl: string, documentsUrl: string | undefined, say: Say): void {
  const documents = documentsUrl ?? new URL("/documents", feedUrl).toString();
  const log = new EventLog(system.db);
  const reconciler = new Reconciler(system.db, new Indexer(system.db, system.embedder, "realtime"), new HttpDocumentSource(documents), log);
  const watcher = new FeedWatcher(system.db, new HttpFeedReader(feedUrl), log, reconciler, { notify: say });
  say(`following ${feedUrl} (documents: ${documents}), polling every second`);
  void watcher.run(1000, new AbortController().signal, (e) => say(`feed unreachable or failing: ${String(e)}`));
}

export function amsterdamTime(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/Amsterdam",
  });
}
