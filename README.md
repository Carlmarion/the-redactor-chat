# The Redactor

A living knowledge base: staff ask questions and get answers with sources, from documents that change every day, using only what each person may open.

> Work in progress. Design: [`SPEC.md`](SPEC.md) · decisions: [`docs/decisions/`](docs/decisions/) · contract reading: [`docs/contract.md`](docs/contract.md).

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
./bin/redactor serve --feed-url <url>        # (in progress)
```

`status` is meant for operators: it takes no user, so it never shows a document's path or title.

Timestamps are Amsterdam time with offset. Money is in euros.

## Development

```sh
npm test
npm run typecheck
npm run lint
```

How this project is built with an AI assistant, and the quality gate every change passes:
[`AGENTS.md`](AGENTS.md).
