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
- `sources[]`: `{ doc_id, path, title, passage_id }` for every passage the answer is drawn from.
- `indexed_version`: the `modified_at` of the last change applied to that document.
- `indexed_at`: when that change became answerable (committed to the store).
- Unknown `doc_id` → an explicit "not indexed" error.

Exposed two ways, same behaviour:

```
redactor ask <user_id> "<question>"
redactor status <doc_id>
POST /ask        { user_id, question }
GET  /status/:doc_id
```

### Data contract (inputs)

- Document: `{ path, title, folder, allowed }` + its text.
- Change event: `{ doc_id, path, modified_at, action: "update" }`.
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
| Feed watcher | Long-running loop on the feed URL. Decides relabel vs re-index. |
| Access resolver | `user_id` → principals (the user and their groups) → visible passages. |
| Retriever | Question → at most 16 visible passages (vector + keyword, merged). |
| Answerer | Passages → extract → answer + sources, or "not found". |
| Interface | CLI and thin HTTP wrapper over the same functions. |

## 4. Data model (SQLite)

| Table | Holds |
|---|---|
| `documents` | `doc_id`, `path`, `title`, `folder`, `content_hash`, `version` (modified_at), `indexed_at`, `deleted` |
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

1. Record the event.
2. Skip duplicates and anything older than the document's current version.
3. Coalesce: several pending events for one document → apply only the latest.
4. Read the document's current text from the document source.
5. Path changed → recompute access from the new folder (relabel).
6. Text changed → re-chunk, re-embed, replace the passages (one transaction).
7. Set `version = modified_at`, `indexed_at = now`.

Old passages are replaced, never archived with their old access.

## 6. Simulator limits we enforce

| Call | Limit |
|---|---|
| extract | at most 16 passages, else error |
| embed | at most 100 texts or 16,000 tokens a request; token buckets of 50 requests and ~16,700 tokens (1 s burst, continuous refill); €15 per million tokens realtime, half for batch |
| models S / M / L (bonus) | 4 / 8 / 16 passages; 2,250 / 4,250 / 8,250 input tokens; prices as in the brief |

## 7. Assumptions (until the client answers)

- A1. Effective access follows the document's current folder. `allowed` on a sample document is a snapshot of that.
- A2. Entries in access lists may be users or groups.
- A3. `user_id` arrives trusted; identity checks belong to the client's login system.
- A4. The feed is polled every second; freshness target is seconds.
- A5. Documents may be in several languages.
- A6. A deleted document is signalled by a change whose text is no longer readable; it is removed from the store.

## 8. Out of scope

- Revision history of documents.
- User authentication.
- Multi-server deployment.

Bonus, only once the core is done: React demo page, passage-level redaction, "explain" mode through a model S/M/L.

## 9. Tasks

### Tue 13
- [x] Clarify the brief, glossary, open questions
- [x] Stack decision
- [ ] SPEC v1 + decision records 0001–0005
- [ ] Daily update #1
- [ ] Sample data: documents, folders, users, groups, permission list, scripted events with traps

### Wed 14
- [ ] Project skeleton (TS, vitest, CLI)
- [ ] Store schema + migrations
- [ ] Spike: sqlite-vec KNN restricted to a set of passages
- [ ] Loader + mapping layer + chunker
- [ ] Simulator embed + extract behind the adapter, limits + cost ledger
- [ ] End-to-end ingest of sample data

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
