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
A guided tour of everything below: [`docs/try-it.md`](docs/try-it.md).

```sh
./bin/redactor ingest [--data data/sample]       # load the corpus and permission list (first run downloads the model, ~145 MB)
./bin/redactor ask <user_id> "<question>"        # answer with sources, from what that user may open (~3 s: loads the model)
./bin/redactor status <doc_id>... [--user <id>]  # which version is indexed, when, how fresh; with --user, hidden docs look unknown
./bin/redactor serve [--port 8080] [--feed-url <url>]
                                                 # HTTP: POST /ask {user_id, question}, GET /status/<doc_id>[?user_id=]
                                                 # with --feed-url, also follows the feed (documents from <feed origin>/documents)
./bin/redactor feed-sim [--step | --pace <n>]    # our simulator's scripted feed; --step: one event per Enter
./bin/redactor costs                             # what the simulator calls would have cost, in euros
./bin/redactor eval [--phase loaded|replayed]    # the eval set on a fresh in-memory store; exit 2 on any leak
```

### Over HTTP

```sh
./bin/redactor serve --feed-url http://localhost:4100/events
curl -X POST localhost:8080/ask -d '{"user_id":"yusuf","question":"How many days of paid leave do I get?"}'
curl localhost:8080/status/d02
```

`status` is meant for operators: without a user it never shows a document's path or title.

Timestamps are Amsterdam time with offset. Money is in euros.

## Following the feed

The client provides no feed of its own: the change feed is served by our simulator, and will replay
the client's day of changes once their dump arrives. In two terminals:

```sh
./bin/redactor feed-sim                                        # terminal 1: the scripted day starts now (--step: one event per Enter)
./bin/redactor serve --feed-url http://localhost:4100/events   # terminal 2: keeps the store fresh, answers on :8080
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
