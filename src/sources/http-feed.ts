// Readers for a feed and a document source served over HTTP (decision 0008): ours today,
// the client's when it arrives. Only the URLs and feed-format.ts should need to change.

import type { DocumentSource, FeedReader, SourceDocument } from "../ports.ts";
import type { DocId, FeedEvent } from "../types.ts";
import { parseFeedEvent } from "./feed-format.ts";

export class HttpFeedReader implements FeedReader {
  constructor(private readonly eventsUrl: string) {}

  async poll(cursor: string | null): Promise<{ events: FeedEvent[]; cursor: string | null }> {
    const url = new URL(this.eventsUrl);
    if (cursor !== null) url.searchParams.set("since", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`feed answered ${res.status} for ${url.toString()}`);
    const page = (await res.json()) as { events: unknown[]; cursor: string | null };
    return { events: page.events.map(parseFeedEvent), cursor: page.cursor };
  }
}

export class HttpDocumentSource implements DocumentSource {
  constructor(private readonly documentsUrl: string) {}

  async read(docId: DocId): Promise<SourceDocument | null> {
    const res = await fetch(`${this.documentsUrl.replace(/\/$/, "")}/${encodeURIComponent(docId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`document source answered ${res.status} for ${docId}`);
    const body = (await res.json()) as { text: string; title?: string | null };
    return { text: body.text, title: body.title ?? null };
  }
}
