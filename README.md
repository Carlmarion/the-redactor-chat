# The Redactor

A living knowledge base: staff ask questions and get answers with sources, from documents that change every day, using only what each person may open.

> Work in progress. Design: [`SPEC.md`](SPEC.md) · decisions: [`docs/decisions/`](docs/decisions/) · contract reading: [`docs/contract.md`](docs/contract.md) · limits found and next steps: [`docs/next-steps.md`](docs/next-steps.md).

## Requirements

Node.js 22 or later.

## Setup

```sh
npm install
```

## Commands

Every command prints JSON. The store is a single file, `./redactor.db` by default (`--db <path>` to change it).

```sh
./bin/redactor ingest [--data data/sample]    # load the corpus and permission list (first run downloads the model, ~145 MB)
./bin/redactor status <doc_id>... [--user <id>]  # which version is indexed, when, how fresh; several ids at once; with --user, hidden docs look unknown
./bin/redactor eval [--passage-tokens 500,250]   # run the eval set on a fresh in-memory store (never touches --db); exit 2 on any leak
./bin/redactor ask <user_id> "<question>"    # answer with sources, from what that user may open (~3 s: loads the model)
./bin/redactor serve --feed-url <url>        # follow the change feed and keep the store fresh (documents read from <feed origin>/documents)
./bin/redactor feed-sim [--port 4100] [--script <file>]  # our simulator's scripted feed: replays data/sample/feed-script.json (or <file>) from now
```

`status` is meant for operators: it takes no user, so it never shows a document's path or title.

Timestamps are Amsterdam time with offset. Money is in euros.

## Following the feed

The client provides no feed of its own: the change feed is served by our simulator, and will replay
the client's day of changes once their dump arrives. In two terminals:

```sh
./bin/redactor feed-sim                                        # terminal 1: the scripted day starts now
./bin/redactor serve --feed-url http://localhost:4100/events   # terminal 2: keeps the store fresh
./bin/redactor status d02                                      # any time: freshness_seconds after its edit at +10 s
```

Access is removed at once and granted after a quiet second, and every change in who can see a
document is logged in `access_log` (decision 0010).

## The feed simulator

Until the client's feed arrives, `feed-sim` serves our scripted day of changes over HTTP.
Every call takes an optional `at` (ISO time) and answers as if it were then.

```sh
curl localhost:4100/events                 # events delivered so far: { events, cursor }
curl "localhost:4100/events?since=3"       # only those after the cursor
curl localhost:4100/documents/d02          # the document's current text (events never carry it)
```

## Development

```sh
npm test
npm run typecheck
npm run lint
```

How this project is built with an AI assistant, and the quality gate every change passes:
[`AGENTS.md`](AGENTS.md).
