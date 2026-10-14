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
