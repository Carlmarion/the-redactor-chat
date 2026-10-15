# SPEC — The Redactor

Living spec. Describes what the system is and the task list to get there.
Decisions and their reasoning live in [`docs/decisions/`](docs/decisions/).

## 1. Purpose

Staff ask questions and get answers with sources. Documents and access change every day.
Answers stay current, and nobody sees what they shouldn't.

The system reads the client's documents and live change feed, answers a staff member's
question with its sources, and uses only the passages that person may open.

## 2. Contracts

### Ask contract (what the judge calls)

| Call | Input | Output |
|---|---|---|
| `ask` | `user_id`, `question` | `{ answer, sources[] }` |
| `status` | `doc_id` | `{ indexed_version, indexed_at }` |

- `answer`: the best passage, verbatim, or a "not found in documents you can access" message.
- `sources[]`: `{ doc_id, path, title, passage_id, snippet, url }` for every passage the answer is drawn from; `url` may be null.
- `indexed_version`: the `modified_at` of the last state applied to that document.
- `indexed_at`: when that state became answerable (committed to the store).
- Extra `status` fields: `revision` (count of states indexed), `previous_path`, `freshness_seconds`.
- `freshness_seconds`: time from the feed delivering the change to it being answerable (`indexed_at` − `received_at` of the first event behind that state). Computed, not stored. `null` for states from the initial load.
- Unknown or deleted `doc_id` → an explicit status. A document with no readable text (a scan, an image-only file) → `not_searchable`.

Every gap in the contracts and how we read it: [`docs/contract.md`](docs/contract.md).

Exposed two ways, same behaviour:

```
redactor ask <user_id> "<question>"
redactor status <doc_id>
POST /ask        { user_id, question }
GET  /status/:doc_id
```

### Data contract (inputs)

- Document: `{ path, title, folder, allowed }` + its text.
- Change event: `{ doc_id, path, modified_at, action }`. Any action may appear; access changes arrive on the same feed.
- Permission list from IT: who may open which folder.
- Feed: served live from a URL given at start (`redactor serve --feed-url <url>`).

The real corpus, permission list and feed arrive two days before the end.
Until then the system runs on generated sample data and our own feed simulator.
Every input enters through a mapping layer, so the real format plugs in without touching the core.

## 3. Architecture

```
 corpus + permission list ──▶ Loader ──┐
                                        ▼
 feed URL ──▶ Feed watcher ──▶ Indexer ──▶ Store (one SQLite file)
                                  │          documents · passages · vectors · keywords
                                  │          principals · access · events · costs
                         Simulator adapter         ▲
                         (embed · extract ·        │
                          limits · €)        Access resolver ─▶ Retriever ─▶ Answerer
                                                                               │
                                                     CLI / HTTP  ◀─────────────┘
```

| Component | Job |
|---|---|
| Simulator adapter | The only door to embed, extract, feed and any model. Enforces limits and counts euros. |
| Simulator | Our implementation of embed (local multilingual model), extract (scoring), feed (HTTP replay). |
| Document source | Where text is read from: corpus directory now, real source later. |
| Loader | Bootstrap: corpus + permission list → store. |
| Chunker | Document text → passages of at most 500 tokens (model tokenizer). |
| Indexer | Passages → embeddings + keyword index, in one transaction per document. |
| Feed watcher | Long-running loop: polls the feed with a cursor (`FeedReader`), dispatches each event by type to its handler. |
| Reconciler | Brings one document in line with its current state: relabel and/or re-index. |
| Access resolver | `user_id` → principals (the user and their groups) → visible passages. |
| Retriever | Question → at most 16 visible passages (vector + keyword, merged). |
| Answerer | Passages → extract → answer + sources, or "not found". |
| Interface | CLI and thin HTTP wrapper over the same functions. |

## 4. Data model (SQLite)

| Table | Holds |
|---|---|
| `documents` | `doc_id`, `path`, `previous_path`, `title`, `folder`, `url`, `content_hash`, `version` (modified_at), `revision`, `indexed_at`, `source_event_id` (first event behind this state; null = initial load), `deleted` |
| `passages` | `passage_id`, `doc_id`, `ord`, `text`, `token_count` |
| `passage_vec` | sqlite-vec table: `passage_id` → 384-dim embedding |
| `passage_fts` | FTS5 table: `passage_id` → text |
| `principals` | users and groups |
| `memberships` | `user_id` ∈ `group_id` |
| `folder_access` | `folder` → `principal_id` (from the permission list) |
| `doc_access` | `doc_id` → `principal_id` (effective, derived from folder) |
| `events` | every feed event: received, applied or skipped, and why |
| `feed_cursor` | last event position read |
| `cost_ledger` | every simulator call: operation, tokens, euros |

Access is a label next to a passage, never inside its embedding.
An access change rewrites labels and costs nothing; only a text change re-embeds.

## 5. Pipelines

### Ask

1. Resolve `user_id` → principals. Unknown user → sees nothing.
2. Restrict to passages whose document grants one of those principals. **Filter before ranking.**
3. Rank visible passages: vector similarity + keyword match, merged.
4. Keep the top 16 at most.
5. Extract → best passage + source. Below the confidence threshold → "not found in documents you can access".
6. Return `{ answer, sources }`.

### Change event

An event is a doorbell: it says something changed, not what. We reconcile, never replay.

1. Poll `<feed>?since=<cursor>`, record each event.
2. Dispatch by type. Document event → reconcile that document. Access event → reload the permission list and relabel affected documents. Unknown type → log, then reconcile the document if one is named.
3. Skip duplicates and anything older than the document's current version.
4. Coalesce: several pending events for one document → one reconciliation.
5. Read the current state: path from the latest event, text from the document source.
6. Folder changed → recompute access (relabel, €0).
7. Text changed → re-chunk, re-embed, replace the passages (one transaction).
8. Set `version = modified_at`, `revision += 1`, `previous_path`, `indexed_at = now`, `source_event_id` = first event of the batch.
9. Save the cursor.

Old passages are replaced, never archived with their old access.

## 6. Simulator limits we enforce

| Call | Limit |
|---|---|
| extract | at most 16 passages, else error |
| embed | at most 100 texts or 16,000 tokens a request; token buckets of 50 requests and ~16,700 tokens (1 s burst, continuous refill); €15 per million tokens realtime, half for batch |
| models S / M / L (bonus) | 4 / 8 / 16 passages; 2,250 / 4,250 / 8,250 input tokens; prices as in the brief |

## 7. Assumptions (until the client answers)

- A1. Access follows the document's closest parent folder with a rule; `allowed` is a snapshot, kept for audit. On doubt, hide (decision 0007).
- A2. Entries in access lists may be users or groups.
- A3. `user_id` arrives trusted; identity checks belong to the client's login system.
- A4. The feed is polled every second; freshness target is seconds (decision 0008).
- A5. Documents may be in several languages.
- A6. A deleted document is signalled by a delete action or by text that is no longer readable; it is removed from the store.
- A7. `doc_id` is stable across moves; documents can move between folders.
- A8. Access changes (team membership, folder rules) arrive on the same feed as their own event type.
- A9. The system reads text. Image alt text and captions count as text. A document with no readable text (a scan, an image-only file) is recorded as `not_searchable`, never silently dropped.

## 8. Out of scope

- Reading text inside images (OCR) and describing images with a model.
- Revision history of documents (old text is never kept with its old access; a safe history is a discussion point for later).
- User authentication.
- Multi-server deployment.

Bonus, only once the core is done: React demo page, passage-level redaction, "explain" mode through a model S/M/L.

## 9. Tasks

### Tue 13
- [x] Clarify the brief, glossary, open questions
- [x] Stack decision
- [x] SPEC v1 + decision records 0001–0005
- [x] Contract interpretation + decision records 0006–0008
- [x] Daily update #1
- [x] Sample data with traps + eval set ([`data/sample/`](data/sample/))

### Wed 14
- [x] Project skeleton (TS, vitest, CLI)
- [x] Store schema + migrations
- [x] Spike: sqlite-vec KNN restricted to a set of passages
- [x] Loader + mapping layer + chunker
- [ ] Simulator embed + extract behind the adapter, limits + cost ledger
- [x] End-to-end ingest of sample data

### Thu 15
- [ ] Access resolver + filter
- [ ] Leak tests (move, group removal, unknown user)

### Fri 16
- [ ] Retriever (hybrid) + answerer + `ask`
- [ ] Feed simulator (HTTP, scripted, `at`)
- [ ] Feed watcher + `status`
- [ ] Freshness tests driven by `at`
- [ ] Core green

### Sat 17 – Sun 18
- [ ] Buffer / bonus
- [ ] Inspect the real dump, write the mapping

### Mon 19 – Tue 20
- [ ] Integrate real corpus, permission list, feed
- [ ] Evals on real data
- [ ] README final, demo script for Tomas
