# 0006 — Events are doorbells: reconcile, don't replay

Date: 2026-10-13 · Status: accepted

## Context
A change event says that a document changed, not what changed. Events can arrive duplicated,
late, out of order, or in bursts (a move, then an edit, then another move).

## Decision
On any event for a document, we do not apply the event. We **reconcile** the document:
1. Read its current state (path from the latest event, text from the document source).
2. Compare with what we hold: path → folder → access, and a hash of the text.
3. Folder changed → relabel access (no embedding, €0). Text changed → re-chunk and re-embed.
4. Stamp `indexed_version` with the latest `modified_at`, increment `revision`.

Several pending events for one document collapse into one reconciliation (coalescing).
Events older than the version we hold are skipped.

## Consequences
- Idempotent: replaying an event changes nothing.
- Order-safe: only the final state matters.
- Intermediate states are never indexed. A document that passes through a public folder for two
  seconds is never exposed.
- Risk: the document source lags behind the event and serves old text under a new version.
  Guard: when the source exposes a modification time, refuse to stamp a version newer than it.
