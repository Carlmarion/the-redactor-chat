# Try it yourself

Everything below runs on the generated sample company (Noordlicht Logistics, `data/sample/`).
Each command prints JSON; logs go to the terminal they run in.

## 1. Set up and load

```sh
npm install
rm -f redactor.db redactor.db-wal redactor.db-shm   # only when switching datasets
./bin/redactor ingest      # 21 documents; d22 is a scan (not searchable); d19's own list disagrees with its folder
```

## 2. Ask, without the feed

```sh
./bin/redactor ask yusuf "How many days of paid leave do I get?"
./bin/redactor ask lotte "What time does the Amsterdam office close?"       # English question, Dutch document
./bin/redactor ask bram  "What is the marketing budget in the 2027 draft?"  # finance: answered
./bin/redactor ask emma  "What is the marketing budget in the 2027 draft?"  # engineering: not in her folders
./bin/redactor ask ghost "How many days of paid leave do I get?"            # not in the access list
./bin/redactor status d22                       # the scan: not_searchable
./bin/redactor status d10 --user anouk          # a document she may not open looks unknown
```

## 3. Watch the feed, one event at a time

```sh
./bin/redactor demo
```

One terminal. **Enter** delivers the next event; the system's decisions appear as they happen.
Type questions in the same terminal (`help` lists everything):

| Enter | Event | Then type |
|---|---|---|
| 1 | Leave policy edited: 25 → 27 days (T3) | `ask yusuf How many days of paid leave do I get?`, then `status d02`: revision 2, freshness |
| 2 | Salary bands move into /HR/Payroll (T1) | `ask emma What is the salary range for a senior engineer?`: never the salary bands again. Applied at once |
| 3 | Reorganisation plan moves to /Public (T2) | Watch: "waiting for a quiet second", then 2 → 8 people. `ask daan What happens to the Rotterdam planning desk in 2027?` |
| 4, 5 | A duplicate, then an event older than the export (T4) | nothing happens: both ignored |
| 6, 7, 8 | d20: moved to /Public, edited, moved to /Engineering/platform (T5) | Press quickly: one re-index, never public. Slowly: each step applies, and the move to /Public waits its quiet second |
| 9 | bram leaves finance-team (T12) | `ask bram What is the marketing budget in the 2027 draft?`: not found |
| 10 | Incident report deleted (T6) | `status d16`: deleted |
| 11 | Bike lease policy created (C4) | after a quiet second, `ask yusuf Can I lease an e-bike through the company?` |
| 12 | An action we do not know, `rename` (C4) | reconciled anyway: `status d04` |

Then `access` (who gained or lost access, in people) and `costs` (what it would have cost).

The demo uses the same HTTP adapters as separate processes, and answers on `:8080` meanwhile:

```sh
curl -s -X POST localhost:8080/ask -d '{"user_id":"yusuf","question":"How many days of paid leave do I get?"}'
curl -s localhost:8080/status/d02
```

## 4. Outage and restart

With the feed and the system as separate processes, in two terminals:

```sh
./bin/redactor ingest                                                   # a fresh ./redactor.db (rm it first to start over)
./bin/redactor feed-sim --step                                          # 1: Enter delivers the next event
./bin/redactor serve --feed-url http://localhost:4100/events            # 2: logs every decision
```

Stop `serve` (Ctrl+C), deliver a few events, start `serve` again: it catches up from where it
stopped. Restart `feed-sim` instead: `serve` says "feed was reset … reading again from the start",
and nothing is applied twice.

## 5. The scores

```sh
./bin/redactor eval                     # after the initial load
./bin/redactor eval --phase replayed    # after the whole feed, plus status checks
npm test
```
