# 0003 — Hybrid retrieval inside SQLite: sqlite-vec + FTS5

Date: 2026-10-13 · Status: accepted

## Context
Questions mix meaning ("how much leave do I get?") with exact terms (names, numbers, codes).
Every ranked passage must be one the user may open.

## Decision
- Meaning: embeddings in a sqlite-vec table, nearest-neighbour search.
- Exact terms: FTS5 full-text index.
- Results from both are merged into one ranking (reciprocal rank fusion).
- Access is applied before ranking: only passages from documents the user may open are candidates.

## Why not brute force alone
At sample size, computing cosine in code would work. We choose sqlite-vec because it is still
one store, it gives a real vector-search interface, and it moves directly to pgvector later.

## Open risk
How sqlite-vec restricts a nearest-neighbour search to an allowed set of passages.
Spike on day 2. Fallback: score only the visible passages in code.

## Update 2026-10-14: risk resolved
Spike `test/vec-filter.spike.test.ts`: a KNN query with `rowid IN (SELECT …)` applies the filter
before taking the top k. A hidden passage that is the closest match is excluded, and k is filled
from visible passages only. Access filtering stays inside the query; no fallback needed.

## The four questions (added 2026-10-19)
The vector index is a table inside the SQLite file of decision 0002 (`passage_vec`), next to the
keyword index (`passage_fts`): not a separate store to run.

1. **Why here and not elsewhere?** It sits in the same file as the access labels, so one query
   restricts to what the person may open and ranks by meaning. A separate vector database would
   need the access labels copied into it and kept in step, a second place where a leak can happen.
2. **Down or data lost?** It is derived: rebuilt from the documents with `redactor ingest` (embed
   in batch at €7.50 per million tokens: ~€0.03 here, ~€1,900 for a million passages of 250 tokens). Until rebuilt, `ask` finds nothing,
   and never something it should not. The event log and cost ledger, which are records, are in
   decision 0002.
3. **Much bigger?** sqlite-vec compares the question with every visible passage (exact, no
   approximate index), so time grows in a straight line with the corpus. Measured with
   `npx tsx scripts/bench-vectors.ts` (random vectors, the person may open half, nearest 16, on a laptop):

   | Passages | Query, median |
   |---|---|
   | 10,000 | 5 ms |
   | 100,000 | 55 ms |
   | 1,000,000 | 561 ms |

   Add ~0.4 s for extract's re-reading (decision 0011) and the question's embedding: about a
   second per question at a million passages. One writer at a time: the watcher.
4. **What would make us move, and at what cost?** Questions slower than about a second, or several
   servers writing. Next step: Postgres with pgvector (approximate index, same SQL filter with
   `rowid IN`), keyword search in Postgres too. Cost: a server to run, the store module and its
   queries rewritten (a day or two), and a re-embed of the corpus in batch.
