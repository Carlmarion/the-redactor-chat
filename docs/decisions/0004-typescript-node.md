# 0004 — TypeScript on Node

Date: 2026-10-13 · Status: accepted

## Context
About 20 focused hours. Every line has to be defended at the demo.

## Decision
TypeScript on Node, vitest for tests, a CLI and a thin HTTP wrapper over the same functions.

## Why
It is the language the team writes fastest and reviews best. The pieces we need exist there:
better-sqlite3, sqlite-vec, transformers.js for local models.

## Rejected
Python has the richer ML ecosystem, but nothing here needs more than a local embedding model,
and slower authoring would cost more than it saves.
