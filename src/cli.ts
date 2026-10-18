// The judge's door, command-line side. Every command prints JSON on stdout; progress and
// logs go to stderr.
import { parseArgs } from "node:util";
import { ask } from "./ask.ts";
import { runDemo } from "./commands/demo.ts";
import { runFeedSim } from "./commands/feed-sim.ts";
import { ingest } from "./commands/ingest.ts";
import { runServe } from "./commands/serve.ts";
import { openSystem } from "./commands/system.ts";
import { ANSWER_POLICY, PASSAGE_TOKENS } from "./config.ts";
import { loadEvalSet, type Phase } from "./eval/eval-set.ts";
import { formatRun, runEval } from "./eval/run-eval.ts";
import { LocalEmbedder } from "./simulator/local-embedder.ts";
import { LocalExtractor } from "./simulator/local-extractor.ts";
import { MeteredEmbedder } from "./simulator/metered-embedder.ts";
import { SqliteCostLedger } from "./store/cost-ledger.ts";
import { openDb, type Db } from "./store/db.ts";
import { status } from "./status.ts";

const USAGE = `redactor <command> [options]

Commands:
  demo                              Everything in one terminal: a fresh store (./demo.db), the initial
                                    load, the scripted feed one event per Enter, questions typed in
  ingest                            Load the corpus and permission list into the store
  ask <user_id> "<question>"        Answer with sources, using only what that user may open
  status <doc_id>... [--user <id>]  Which version of each document is indexed, when, how fresh
  serve [--port 8080] [--feed-url <url>] [--documents-url <url>]
                                    Answer over HTTP (POST /ask, GET /status/<doc_id>) and, with a
                                    feed URL, follow the feed to stay current
                                    (documents default: <feed origin>/documents)
  feed-sim [--port 4100] [--step | --pace <n>] [--script <file>]
                                    Our simulator's scripted feed. --step: one event per Enter.
                                    --pace 3: three times slower
  costs                             What the simulator calls would have cost, in euros
  eval [--phase loaded|replayed]    Run the eval set on a fresh in-memory store; never touches --db

Options:
  --db <path>                       Store file (default: ./redactor.db; demo: ./demo.db, reset each run)
  --data <dir>                      Corpus, permission list, feed script, eval set (default: ./data/sample)
  --passage-tokens <n,n>            eval only: passage sizes to compare
  --json                            eval only: print the runs as JSON
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      db: { type: "string" },
      data: { type: "string", default: "./data/sample" },
      "feed-url": { type: "string" },
      "documents-url": { type: "string" },
      user: { type: "string" },
      phase: { type: "string", default: "loaded" },
      "passage-tokens": { type: "string" },
      json: { type: "boolean" },
      port: { type: "string" },
      script: { type: "string" },
      step: { type: "boolean" },
      pace: { type: "string", default: "1" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  const dbPath = values.db ?? "./redactor.db";

  if (values.help || !command) {
    process.stdout.write(USAGE);
    return command || values.help ? 0 : 1;
  }

  switch (command) {
    case "demo":
      return runDemo({
        dbPath: values.db ?? "./demo.db",
        dataDir: values.data,
        ...(values.script ? { scriptPath: values.script } : {}),
        feedPort: 4100,
        apiPort: Number(values.port ?? 8080),
      });
    case "ingest": {
      const db = openDb(dbPath);
      print(await ingest(db, new MeteredEmbedder(await LocalEmbedder.load(), new SqliteCostLedger(db)), values.data));
      return 0;
    }
    case "ask": {
      const [userId, question] = rest;
      if (!userId || !question) return fail('ask needs a user_id and a "question"');
      print(await ask(await openSystem(dbPath), userId, question));
      return 0;
    }
    case "status": {
      if (rest.length === 0) return fail("status needs at least one doc_id");
      const db = openDb(dbPath);
      // One id: exactly the contract's shape. Several: one entry per id, each through the same gate.
      print(rest.length === 1 ? status(db, rest[0] ?? "", values.user) : Object.fromEntries(rest.map((id) => [id, status(db, id, values.user)])));
      return 0;
    }
    case "serve":
      return runServe({
        dbPath,
        port: Number(values.port ?? 8080),
        ...(values["feed-url"] ? { feedUrl: values["feed-url"] } : {}),
        ...(values["documents-url"] ? { documentsUrl: values["documents-url"] } : {}),
      });
    case "feed-sim":
      return runFeedSim({
        dataDir: values.data,
        port: Number(values.port ?? 4100),
        ...(values.script ? { scriptPath: values.script } : {}),
        pace: Number(values.pace),
        step: values.step ?? false,
      });
    case "costs":
      print(costs(openDb(dbPath)));
      return 0;
    case "eval":
      return evaluate(values.data, values.phase as Phase, values["passage-tokens"], values.json ?? false);
    default:
      return fail(`unknown command "${command}"\n\n${USAGE}`);
  }
}

function costs(db: Db) {
  const { lines, total } = new SqliteCostLedger(db).summary();
  return {
    explained: {
      batch: "initial load: half price, no throttle",
      realtime: "questions and feed updates: full price, throttled to the brief's limits",
      eur: "what the simulator would charge at the brief's fictional prices; nobody pays",
    },
    lines,
    total,
  };
}

async function evaluate(dataDir: string, phase: Phase, passageTokens: string | undefined, json: boolean): Promise<number> {
  const model = await LocalEmbedder.load();
  const set = await loadEvalSet(`${dataDir}/eval.json`);
  const runs = [];
  for (const size of (passageTokens ?? String(PASSAGE_TOKENS)).split(",").map(Number)) {
    const setup = { dataDir, embedder: model, extractor: new LocalExtractor(model), policy: ANSWER_POLICY, passageTokens: size };
    runs.push(await runEval(setup, set, phase));
  }
  if (json) print(runs);
  else process.stdout.write(`${runs.map(formatRun).join("\n\n")}\n`);
  return runs.some((r) => r.leaks > 0) ? 2 : 0;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): number {
  process.stderr.write(`redactor: ${message}\n`);
  return 1;
}

process.exitCode = await main(process.argv.slice(2));
