// The judge's door, HTTP side (same behaviour as the command line):
//   POST /ask              { user_id, question }  → { answer, sources }
//   GET  /status/<doc_id>  [?user_id=<id>]        → { indexed_version, indexed_at, ... }

import { createServer, type IncomingMessage, type Server } from "node:http";
import { ask, type AskDeps } from "../ask.ts";
import { status } from "../status.ts";

export function apiServer(deps: AskDeps): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body, null, 2));
    };

    if (req.method === "POST" && url.pathname === "/ask") {
      readJson(req).then(
        async (body) => {
          const { user_id, question } = body as { user_id?: unknown; question?: unknown };
          if (typeof user_id !== "string" || typeof question !== "string" || !question.trim()) {
            return send(400, { error: 'expected { "user_id": "...", "question": "..." }' });
          }
          send(200, await ask(deps, user_id, question));
        },
        () => send(400, { error: "the body must be JSON" }),
      ).catch((error: unknown) => send(500, { error: String(error) }));
      return;
    }
    const doc = /^\/status\/([^/]+)$/.exec(url.pathname);
    if (req.method === "GET" && doc?.[1]) {
      return send(200, status(deps.db, decodeURIComponent(doc[1]), url.searchParams.get("user_id") ?? undefined));
    }
    send(404, { error: "routes: POST /ask, GET /status/<doc_id>" });
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  return JSON.parse(raw) as unknown;
}
