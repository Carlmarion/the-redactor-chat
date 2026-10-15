# The contract as we implement it

The brief's data and ask contracts are vague on purpose. This page lists every gap we found,
how we read it, and why. Each line is an assumption until the client confirms it.
Open questions to the client are tracked in the daily updates.

## Inbound: documents, events, permissions

| # | Given | Gap | Our reading | Why |
|---|---|---|---|---|
| C1 | Documents `{path, title, folder, allowed}`; events `{doc_id, …}` | Documents have no `doc_id` | Every document has a separate, **stable** `doc_id` (like a drive file id). We keep the previous path ourselves | An event carries a new `path`; if the id were the path, a move could not be expressed |
| C2 | Documents have `folder` and `path` | How do they relate? | `folder` is a parent of `path`. Folders nest. A document's governing folder is its **closest parent folder with an access rule**. Documents **can move between folders** | Wrongly assuming no cross-folder moves leaks; handling them costs nothing under reconciliation |
| C3 | Documents carry `allowed`; "permissions follow our shared drive folders" | Two sources of access can disagree | **The folder wins.** `allowed` is read as a snapshot of the folder rule at export time. On any doubt, hide | A wrong guess here can only over-hide, never leak (see decision 0007) |
| C4 | `action: "update"` | Only one value shown, yet the field exists | The real feed may carry any create / update / delete / access action. **Unknown actions are logged and reconciled anyway** | A field with one possible value is a hint |
| C5 | — | Neither documents nor events contain the text | Text is read from a **document source** when reconciling | Events are notifications, not content (decision 0006) |
| C6 | `modified_at` | Time zone, ordering, duplicates | ISO 8601 with offset, Amsterdam time. Order not guaranteed, duplicates possible. **Processing is idempotent** | The brief fixes Amsterdam time; feeds redeliver |
| C7 | "Reads it live from a URL given at start" | Transport undefined | **Polling** with a `since` cursor, behind a `FeedReader` interface. Optional `at` | Calls take an `at` parameter: request/response HTTP (decision 0008) |
| C8 | Access changes daily | How do team or folder access changes arrive? | **On the same feed**, as their own event type. The watcher dispatches by type | "Documents and access change every day": one feed |
| C12 | "The corpus … from IT" | Document formats unspecified: a shared drive holds scans, images, PDFs | We index **text**. Image alt text and captions are kept as text. A document with no readable text is indexed as **`not_searchable`**, logged with its reason, and visible in `status`. No OCR | A silent gap is worse than a visible one: staff would be told "nothing found" when the answer is in a scan |

## Outbound: ask and status

| # | Given | Gap | Our reading |
|---|---|---|---|
| C9 | `sources[]` | Shape undefined | `{ doc_id, path, title, passage_id, snippet, url }`, with `url` nullable |
| C10 | `answer` | No-answer case, unknown user | Explicit messages: "not found in documents you can access". Unknown user sees nothing |
| C11 | `status(doc_id) -> {indexed_version, indexed_at}` | Type of version; unknown or deleted doc | `indexed_version` = `modified_at` of the last state applied (comparable with the feed). Extra fields: `revision` (count of states indexed), `previous_path`, `freshness_seconds` (feed delivery → answerable, computed; null after the initial load). Unknown or deleted doc → explicit status |

```json
{
  "indexed_version": "2026-10-13T14:02:11+02:00",
  "indexed_at": "2026-10-13T14:02:12.204+02:00",
  "revision": 4,
  "previous_path": "/Public/salary-bands.md",
  "freshness_seconds": 1.2
}
```

`revision` counts the states we indexed, not edits at the source: coalesced events count once.

`freshness_seconds` is measured from the **first** event behind the state, so coalescing never hides waiting time.
It uses our clock only (`received_at` → `indexed_at`); `modified_at` is the client's clock and can be days old for a late event.
