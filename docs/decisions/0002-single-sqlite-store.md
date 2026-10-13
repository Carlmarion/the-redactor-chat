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
