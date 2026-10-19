// Listening on a port, and what to say when it is taken: almost always a `serve`, `feed-sim` or
// `demo` still running elsewhere.

import { createServer, type Server } from "node:net";

type Say = (line: string) => void;

function explain(port: number, e: NodeJS.ErrnoException): string {
  return e.code === "EADDRINUSE" ? `port ${port} is taken, probably by a serve, feed-sim or demo still running: lsof -i :${port}` : String(e);
}

/** Resolves once the server listens; a taken port is said and ends the process. */
export function listen(server: Server, port: number, say: Say): Promise<void> {
  return new Promise((resolve) => {
    server.once("error", (e: NodeJS.ErrnoException) => {
      say(explain(port, e));
      process.exit(1);
    });
    server.listen(port, resolve);
  });
}

/** Checks the ports before any slow work, so a taken port is reported in the first second. */
export async function ensurePortsFree(ports: number[], say: Say): Promise<void> {
  for (const port of ports) {
    const probe = createServer();
    await listen(probe, port, say);
    await new Promise((resolve) => probe.close(resolve));
  }
}
