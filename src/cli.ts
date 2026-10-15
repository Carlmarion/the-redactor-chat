// The judge's door, command-line side. Every command prints JSON on stdout.
import { parseArgs } from "node:util";
import { ask } from "./ask.ts";
import { ANSWER_MIN_SCORE } from "./config.ts";
import { Indexer } from "./ingest/indexer.ts";
import { loadCorpus } from "./ingest/load.ts";
import { MeteredEmbedder } from "./simulator/metered-embedder.ts";
import { LocalEmbedder } from "./simulator/local-embedder.ts";
import { LocalExtractor } from "./simulator/local-extractor.ts";
import { SampleData } from "./sources/sample-data.ts";
import { SqliteCostLedger } from "./store/cost-ledger.ts";
import { openDb, type Db } from "./store/db.ts";
import { status } from "./status.ts";

const USAGE = `redactor <command> [options]

Commands:
  ask <user_id> "<question>"     Answer a question with sources, using only what that user may open
  status <doc_id> [--user <id>]  Show which version of a document is indexed, and when
  ingest                         Load the corpus and permission list into an empty store
  serve --feed-url <url>         Follow the change feed and keep the store fresh

Options:
  --db <path>                    Store file (default: ./redactor.db)
  --data <dir>                   Corpus and permission list for ingest (default: ./data/sample)
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      db: { type: "string", default: "./redactor.db" },
      data: { type: "string", default: "./data/sample" },
      "feed-url": { type: "string" },
      user: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;

  if (values.help || !command) {
    process.stdout.write(USAGE);
    return command || values.help ? 0 : 1;
  }

  switch (command) {
    case "status": {
      const [docId] = rest;
      if (!docId) return fail("status needs a doc_id");
      print(status(openDb(values.db), docId, values.user));
      return 0;
    }
    case "ingest": {
      print(await ingest(openDb(values.db), values.data));
      return 0;
    }
    case "ask": {
      const [userId, question] = rest;
      if (!userId || !question) return fail('ask needs a user_id and a "question"');
      const db = openDb(values.db);
      const model = await LocalEmbedder.load();
      const embedder = new MeteredEmbedder(model, new SqliteCostLedger(db));
      print(await ask({ db, embedder, extractor: new LocalExtractor(model, ANSWER_MIN_SCORE) }, userId, question));
      return 0;
    }
    case "serve":
      return fail(`${command} is not implemented yet`);
    default:
      return fail(`unknown command "${command}"\n\n${USAGE}`);
  }
}

/** Initial load in batch mode: half price, no throttle (the brief's batch embed). */
async function ingest(db: Db, dataDir: string) {
  const sample = new SampleData(dataDir);
  const ledger = new SqliteCostLedger(db);
  const mark = ledger.mark();
  const embedder = new MeteredEmbedder(await LocalEmbedder.load(), ledger);
  const summary = await loadCorpus(db, { corpus: sample, documents: sample, permissions: sample }, new Indexer(db, embedder, "batch"));
  return { ...summary, embed_cost: ledger.totalSince(mark) };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): number {
  process.stderr.write(`redactor: ${message}\n`);
  return 1;
}

process.exitCode = await main(process.argv.slice(2));
