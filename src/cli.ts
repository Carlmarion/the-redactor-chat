// The judge's door, command-line side. Every command prints JSON on stdout.
import { parseArgs } from "node:util";
import { ask } from "./ask.ts";
import { ANSWER_POLICY, PASSAGE_TOKENS } from "./config.ts";
import { loadEvalSet, type Phase } from "./eval/eval-set.ts";
import { formatRun, runEval } from "./eval/run-eval.ts";
import { Indexer } from "./ingest/indexer.ts";
import { loadCorpus } from "./ingest/load.ts";
import { MeteredEmbedder } from "./simulator/metered-embedder.ts";
import { LocalEmbedder } from "./simulator/local-embedder.ts";
import { LocalExtractor } from "./simulator/local-extractor.ts";
import { FeedScript } from "./simulator/feed-script.ts";
import { feedServer } from "./simulator/feed-server.ts";
import { SampleData } from "./sources/sample-data.ts";
import { SqliteCostLedger } from "./store/cost-ledger.ts";
import { openDb, type Db } from "./store/db.ts";
import { status } from "./status.ts";

const USAGE = `redactor <command> [options]

Commands:
  ask <user_id> "<question>"     Answer a question with sources, using only what that user may open
  status <doc_id>... [--user <id>]  Which version of each document is indexed, and when
  ingest                         Load the corpus and permission list into an empty store
  serve --feed-url <url>         Follow the change feed and keep the store fresh
  eval [--phase loaded]          Run the eval set on a fresh in-memory store; never touches --db
  feed-sim [--port 4100]         Our simulator's scripted feed: replays <data>/feed-script.json from now

Options:
  --db <path>                    Store file (default: ./redactor.db)
  --data <dir>                   Corpus, permission list and eval set (default: ./data/sample)
  --passage-tokens <n,n>         eval only: passage sizes to compare (default: the configured size)
  --json                         eval only: print the runs as JSON
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
      phase: { type: "string", default: "loaded" },
      "passage-tokens": { type: "string" },
      json: { type: "boolean" },
      port: { type: "string", default: "4100" },
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
      if (rest.length === 0) return fail("status needs at least one doc_id");
      const db = openDb(values.db);
      // One id: exactly the contract's shape. Several: one entry per id, each through the same gate.
      print(rest.length === 1 ? status(db, rest[0] ?? "", values.user) : Object.fromEntries(rest.map((id) => [id, status(db, id, values.user)])));
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
      print(await ask({ db, embedder, extractor: new LocalExtractor(model), policy: ANSWER_POLICY }, userId, question));
      return 0;
    }
    case "eval": {
      const model = await LocalEmbedder.load();
      const questions = await loadEvalSet(`${values.data}/eval.json`);
      const sizes = (values["passage-tokens"] ?? String(PASSAGE_TOKENS)).split(",").map(Number);
      const runs = [];
      for (const passageTokens of sizes) {
        const setup = { dataDir: values.data, embedder: model, extractor: new LocalExtractor(model), policy: ANSWER_POLICY, passageTokens };
        runs.push(await runEval(setup, questions, values.phase as Phase));
      }
      if (values.json) print(runs);
      else process.stdout.write(`${runs.map(formatRun).join("\n\n")}\n`);
      return runs.some((r) => r.leaks > 0) ? 2 : 0;
    }
    case "feed-sim": {
      const script = await FeedScript.load(values.data, new Date(), new SampleData(values.data));
      const port = Number(values.port);
      feedServer(script).listen(port, () => {
        process.stderr.write(
          `feed simulator on http://localhost:${port}\n` +
            `  events:    http://localhost:${port}/events\n` +
            `  documents: http://localhost:${port}/documents/<doc_id>\n` +
            `  last scripted event at ${new Date(script.endsAt).toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam" })}\n`,
        );
      });
      return new Promise<number>(() => undefined);
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
