// The simulator over HTTP. Every call takes an optional `at` (ISO time): "answer as if it were then".
//   GET /events?since=<cursor>&at=<iso>  → { events, cursor }
//   GET /documents/<doc_id>?at=<iso>     → { doc_id, text } or 404

import { createServer, type Server } from "node:http";
import type { FeedScript } from "./feed-script.ts";

export function feedServer(script: FeedScript, now: () => number = Date.now): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const at = url.searchParams.get("at");
    const moment = at === null ? now() : Date.parse(at);
    if (Number.isNaN(moment)) return send(400, { error: "at must be an ISO 8601 time" });

    if (req.method === "GET" && url.pathname === "/events") {
      return send(200, script.eventsSince(url.searchParams.get("since"), moment));
    }
    const doc = /^\/documents\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && doc?.[1]) {
      const docId = decodeURIComponent(doc[1]);
      void script.documentAt(docId, moment).then(
        (found) => (found ? send(200, { doc_id: docId, text: found.text }) : send(404, { error: `no document ${docId}` })),
        (error: unknown) => send(500, { error: String(error) }),
      );
      return;
    }
    send(404, { error: "unknown route" });
  });
}
