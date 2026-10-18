// `redactor serve`: answers over HTTP with the model loaded once, and, given a feed URL,
// follows the feed in the same process so answers stay current.

import { EventLog } from "../feed/event-log.ts";
import { Reconciler } from "../feed/reconciler.ts";
import { FeedWatcher } from "../feed/watcher.ts";
import { apiServer } from "../http/api-server.ts";
import { Indexer } from "../ingest/indexer.ts";
import { HttpDocumentSource, HttpFeedReader } from "../sources/http-feed.ts";
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
  startApi(system, o.port, say);
  if (o.feedUrl) followFeed(system, o.feedUrl, o.documentsUrl, say);
  return new Promise<never>(() => undefined);
}

export function startApi(system: System, port: number, say: Say): void {
  apiServer(system)
    .on("error", portTaken(port, say))
    .listen(port, () => say(`answering on http://localhost:${port}  (POST /ask, GET /status/<doc_id>)`));
}

/** A port already in use is almost always a `serve`, `feed-sim` or `demo` still running elsewhere. */
export function portTaken(port: number, say: Say) {
  return (e: NodeJS.ErrnoException) => {
    say(e.code === "EADDRINUSE" ? `port ${port} is taken, probably by a serve, feed-sim or demo still running: lsof -i :${port}` : String(e));
    process.exit(1);
  };
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
