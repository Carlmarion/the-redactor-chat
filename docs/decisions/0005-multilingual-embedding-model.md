# 0005 — Embedding model: multilingual-e5-small, local

Date: 2026-10-13 · Status: accepted

## Context
The brief describes "one small open embedding model". Passages are up to 500 tokens.
The client is in Amsterdam; document languages are not yet known.

## Decision
`multilingual-e5-small` through transformers.js, running locally.
384-dimension vectors, 512-token input, many languages. Downloaded once and cached.
Queries and passages carry the model's required prefixes (`query:` / `passage:`).

## Why
- Multilingual covers English and Dutch without knowing in advance.
- 512 tokens covers our 500-token passages. `all-MiniLM-L6-v2` was considered and rejected:
  it truncates after about 256 tokens.
- Local: no key, no network dependency at runtime, nothing to pay.

## Consequences
The model sits behind the embed port; changing it means re-embedding the corpus.
