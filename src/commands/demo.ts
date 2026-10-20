// `redactor demo`: the whole system in one terminal, for a person rather than a script.
// A fresh store, the initial load, our feed simulator in step mode and the system following it,
// over the same HTTP adapters as with separate `feed-sim` and `serve`. Enter delivers the next
// event; typed lines ask, check status, show who gained or lost access, and what it cost.

import { rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { foldersSeenBy, people, type Person, type VisibleFolder } from "../access/who-sees-what.ts";
import { ask } from "../ask.ts";
import { status } from "../status.ts";
import { SqliteCostLedger, type CostLine } from "../store/cost-ledger.ts";
import type { Db } from "../store/db.ts";
import type { AskResult, UserId } from "../types.ts";
import { parseDemoLine } from "./demo-line.ts";
import { deliverNext, startFeedSim } from "./feed-sim.ts";
import { ingest } from "./ingest.ts";
import { ensurePortsFree } from "./ports.ts";
import { amsterdamTime, followFeed, startApi, type Say } from "./serve.ts";
import { openSystem } from "./system.ts";

export interface DemoOptions {
  dbPath: string;
  dataDir: string;
  scriptPath?: string;
  feedPort: number;
  apiPort: number;
}

const HELP = `  Enter                        deliver the next event of the day
  ask <user> <question>        answer from what that person may open, e.g.  ask yusuf How many days of paid leave do I get?
  status <doc_id> [<user>]     which version is indexed, when, how fresh; for someone who may not
                               open it, it looks exactly like a document that does not exist
  people                       everyone who can ask, and their teams
  sees <user>                  the folders that person may open right now, e.g.  sees anouk
  access                       every change in who can see a document, in people
  costs                        what the simulator calls would have cost
  quit`;

export async function runDemo(o: DemoOptions): Promise<number> {
  const say: Say = (line) => process.stdout.write(`${amsterdamTime()} ${line}\n`);
  await ensurePortsFree([o.feedPort, o.apiPort], say);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${o.dbPath}${suffix}`, { force: true });

  say(`fresh store at ${o.dbPath}, loading the documents and the permission list…`);
  const system = await openSystem(o.dbPath);
  const loaded = await ingest(system.db, system.embedder, o.dataDir);
  say(`loaded ${loaded.documents} documents (${loaded.passages} passages) for €${loaded.embed_cost.eur}`);

  const feedUrl = `http://localhost:${o.feedPort}/events`;
  const script = await startFeedSim(
    {
      dataDir: o.dataDir,
      port: o.feedPort,
      pace: 1,
      step: true,
      ...(o.scriptPath ? { scriptPath: o.scriptPath } : {}),
    },
    say,
  );
  await startApi(system, o.apiPort, say);
  followFeed(system, feedUrl, undefined, say);
  process.stdout.write(`\n${HELP}\n\n`);

  const lines = createInterface({ input: process.stdin });
  for await (const line of lines) {
    const command = parseDemoLine(line);
    switch (command.kind) {
      case "next":
        say(deliverNext(script));
        break;
      case "ask":
        process.stdout.write(formatAnswer(await ask(system, command.userId, command.question)));
        break;
      case "status":
        process.stdout.write(`${JSON.stringify(status(system.db, command.docId, command.userId))}\n`);
        break;
      case "access":
        process.stdout.write(formatAccessLog(system.db));
        break;
      case "people":
        process.stdout.write(formatPeople(system.db));
        break;
      case "sees":
        process.stdout.write(formatFoldersSeen(system.db, command.userId));
        break;
      case "costs":
        process.stdout.write(formatCosts(system.db));
        break;
      case "help":
        process.stdout.write(`${HELP}\n`);
        break;
      case "quit":
        lines.close();
        break;
      case "unknown":
        process.stdout.write(`not understood: "${command.text}"\n${HELP}\n`);
        break;
    }
  }
  process.exit(0);
}

function formatAnswer({ answer, sources }: AskResult): string {
  const cited = sources.map((s) => `  source: ${s.doc_id} ${s.path}`).join("\n");
  return `\n${answer}\n${cited}\n\n`;
}

function formatAccessLog(db: Db): string {
  const rows = db
    .prepare("SELECT at, doc_id, folder_before, folder_after, people_before, people_after, widened FROM access_log ORDER BY id")
    .all() as {
    at: string;
    doc_id: string;
    folder_before: string | null;
    folder_after: string | null;
    people_before: number;
    people_after: number;
    widened: number;
  }[];
  if (rows.length === 0) return "nobody has gained or lost access yet\n";
  const line = (r: (typeof rows)[number]) =>
    `  ${r.at.slice(11, 19)} ${r.doc_id}: ${r.folder_before ?? "-"} → ${r.folder_after ?? "-"}, ${r.people_before} → ${r.people_after} people${r.widened ? " (widened)" : ""}`;
  return `${rows.map(line).join("\n")}\n`;
}

function formatPeople(db: Db): string {
  const line = (p: Person) => `  ${p.userId.padEnd(8)} ${p.groups.join(", ")}`;
  return `${people(db).map(line).join("\n")}\n`;
}

function formatFoldersSeen(db: Db, userId: UserId): string {
  const folders = foldersSeenBy(db, userId);
  if (folders.length === 0) return `${userId} may open nothing (not in the permission list, or in no folder's rule)\n`;
  const line = (f: VisibleFolder) => `  ${f.folder.padEnd(14)} ${f.documents} document${f.documents === 1 ? "" : "s"}`;
  return `${folders.map(line).join("\n")}\n`;
}

function formatCosts(db: Db): string {
  const { lines, total } = new SqliteCostLedger(db).summary();
  const line = (l: CostLine) => `  ${l.operation}${l.mode ? ` ${l.mode}` : ""}: ${l.requests} requests, ${l.tokens} tokens, €${l.eur}`;
  return `${[...lines, total].map(line).join("\n")}\n  (the brief's fictional prices; nobody pays)\n`;
}
