# 0002 — One store: a single SQLite file

Date: 2026-10-13 · Status: accepted

## Context
We need to hold documents, passages, vectors, a keyword index, access lists, events and costs.
The judge must run the system from the README.

## Decision
One SQLite file (better-sqlite3, WAL mode). Vectors through sqlite-vec, keywords through FTS5,
both inside the same file (see 0003).

## The four questions
1. **Why here?** No server to install or run. Transactions let us replace a document's
   passages and its access in one atomic step, so no reader ever sees a half-updated document.
   Access filtering is a join, which a relational store does natively.
2. **Down or lost?** The store holds derived data; the client's drive is the source of truth.
   A lost file is rebuilt from the corpus and the feed. While rebuilding, answers are unavailable,
   never wrong.
3. **Much bigger?** One writer at a time. Our only writer is the feed watcher, which applies
   events in order anyway, so writes queue naturally; readers are not blocked (WAL).
   Fine up to a few million passages on one machine.
4. **What makes us move, at what cost?** Several servers, several writers, or vector search too
   slow. Next step: Postgres + pgvector. The SQL is mostly portable and the concepts are the same;
   the cost is a schema port, a migration script and one service to run.

## Rejected
- Postgres + pgvector now: more to install and defend, no gain at this size.
- Redis: an in-memory cache, not a primary store; nothing here needs it yet.
- A dedicated vector database: a second store to keep in sync with access changes.

## Update 2026-10-15: what is derived and what is not

Answer 2 above was too broad. Most tables are **derived**: passages, vectors, keywords and access
labels are rebuilt from the drive and the permission list by re-ingesting. Two are **records** of
what happened and exist nowhere else: `events` (when each change arrived and was applied) and
`cost_ledger`. Losing the file loses them. In production they are backed up continuously
(for example Litestream, which streams the SQLite file to object storage).

Rebuilding also stops being cheap with size. Our sample is 3,429 tokens (€0.03, 2 s).
One billion tokens is €7,500 at batch price and hours of work, with answers incomplete meanwhile;
the same index restored from a backup is a ~6 GB copy. Small: rebuild. Large: restore from backup,
rebuild only as a last resort.

During development a schema change means "delete the file and re-ingest". In production it means
a migration.
