// `redactor serve`: answers over HTTP with the model loaded once, and, given a feed URL,
// follows the feed in the same process so answers stay current.

import { EventLog } from "../feed/event-log.ts";
import { Reconciler } from "../feed/reconciler.ts";
import { FeedWatcher } from "../feed/watcher.ts";
import { apiServer } from "../http/api-server.ts";
import { Indexer } from "../ingest/indexer.ts";
import { HttpDocumentSource, HttpFeedReader } from "../sources/http-feed.ts";
import { openSystem } from "./system.ts";

export interface ServeOptions {
  dbPath: string;
  port: number;
  feedUrl?: string;
  documentsUrl?: string;
}

export async function runServe(o: ServeOptions): Promise<never> {
  const system = await openSystem(o.dbPath);
  const say = (line: string) => process.stderr.write(`${amsterdamTime()} ${line}\n`);

  apiServer(system).listen(o.port, () => say(`answering on http://localhost:${o.port}  (POST /ask, GET /status/<doc_id>)`));

  if (o.feedUrl) {
    const documentsUrl = o.documentsUrl ?? new URL("/documents", o.feedUrl).toString();
    const log = new EventLog(system.db);
    const reconciler = new Reconciler(system.db, new Indexer(system.db, system.embedder, "realtime"), new HttpDocumentSource(documentsUrl), log);
    const watcher = new FeedWatcher(system.db, new HttpFeedReader(o.feedUrl), log, reconciler, { notify: say });
    say(`following ${o.feedUrl} (documents: ${documentsUrl}), polling every second`);
    void watcher.run(1000, new AbortController().signal, (e) => say(`feed unreachable or failing: ${String(e)}`));
  }
  return new Promise<never>(() => undefined);
}

function amsterdamTime(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam" });
}
