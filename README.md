# The Redactor

Staff ask a question in plain words and get the answer from the company's documents, with the
document it came from. Documents and access change during the day; answers follow within about
a second, and nobody ever gets an answer from a document they may not open.

This repository runs on a made-up company, **Noordlicht Logistics** (8 people, 21 documents), and
on our own simulator of the client's systems, so everything below works on your computer with no
account, no key and no cost.

- **Part 1, step by step**: from an empty computer to a live demo, in about 15 minutes.
- **Part 2, reference**: every command, the HTTP interface, the feed, the scores.
- **Part 3, where to read more**: the design, the decisions and what comes next.

---

# Part 1 — Step by step

## Step 1. Open a terminal

A terminal is a window where you type commands and press **Enter** to run them.

- **Mac**: press `Cmd` + `Space`, type `Terminal`, press `Enter`.
- **Windows**: open the Start menu, type `PowerShell`, press `Enter`.
- **Linux**: you know where it is.

Every grey box below is a command: copy it, paste it in the terminal, press **Enter**.

## Step 2. Check that Node.js 22 or newer is installed

```sh
node --version
```

- You see `v22.…`, `v23.…` or higher: go to step 3.
- You see `command not found`, or a version below 22: download the **LTS** version from
  [nodejs.org](https://nodejs.org) (the large button), install it, **close the terminal, open a new
  one**, and run `node --version` again.

## Step 3. Get the code

With the repository address you were given (on its web page: green **Code** button → copy the address):

```sh
git clone <repository address> the-redactor-chat
cd the-redactor-chat
```

`cd` moves the terminal into the folder you just downloaded. **Run every command from here on in
this folder.** No `git`? On the repository page: **Code** → **Download ZIP**, unzip it, then in the
terminal type `cd ` (with a space), drag the unzipped folder onto the terminal window, and press **Enter**.

## Step 4. Install

```sh
npm install
```

About a minute. Warnings in yellow are normal; it ends with a line such as `added … packages`.

## Step 5. Start the demo

```sh
./bin/redactor demo
```

On **Windows**, type instead: `npm run redactor -- demo`

**The first time only**, it downloads two small open AI models (about 420 MB, a few minutes,
saved in the folder for next time). A bar fills up while it downloads:
`downloading the AI models  ▕████████████░░░░░░░░░░░░▏ 51%  212 / 415 MB`. Then you see:

```
16:10:47 loaded 21 documents (23 passages) for €0.025777
16:10:47 feed simulator on http://localhost:4100  …
16:10:47 step mode: press Enter to deliver the next event
16:10:47 answering on http://localhost:8080  …

  Enter                        deliver the next event of the day
  ask <user> <question>        …
```

The demo is now waiting for you. **Everything happens in this same window.**

## Step 6. How to use the demo

You do one of two things, as often as you like:

1. **Press Enter on an empty line**: the next change of the company's day happens (a document is
   edited, moved, deleted, someone leaves a team…). The lines that appear say what the system decided.
2. **Type a command, then Enter**:

| To… | Type | Example (copy it as is) |
|---|---|---|
| ask a question as someone | `ask`, the person, the question | `ask yusuf How many days of paid leave do I get?` |
| see which version of a document is in use | `status`, the document | `status d02` |
| … as a given person | `status`, the document, the person | `status d10 anouk` |
| see everyone who can ask, and their teams | `people` | `people` |
| see which folders a person may open right now | `sees`, the person | `sees anouk` |
| see who gained or lost access, in people | `access` | `access` |
| see what it would have cost | `costs` | `costs` |
| see the list of commands | `help` | `help` |
| stop | `quit` | `quit` |

No quotes needed. The people and documents you can use are in step 7.

`status` as a person who may not open the document answers exactly as for a document that does not
exist (`not_indexed`). That is on purpose: otherwise anyone could ask about an id and learn that a
hidden document exists.

## Step 7. Who is who

**People** (the first word after `ask`):

| Person | Teams | May open |
|---|---|---|
| `anouk` | HR, management | Public, HR, Finance, Management |
| `sanne` | HR, payroll | Public, HR, Payroll |
| `bram` | finance | Public, Finance |
| `lotte` | finance | Public, Finance |
| `daan` | engineering | Public, Engineering |
| `emma` | engineering | Public, Engineering |
| `yusuf` | engineering | Public, Engineering |
| `joost` | management | Public, Finance, Management |

Anyone else, for example `ghost`, is not in the access list and sees nothing.

**Documents** (the word after `status`):

| Id | Document | Folder |
|---|---|---|
| `d01`–`d07` | Welcome, leave policy, expenses, remote work, salary bands, office rules (Dutch), passwords | /Public |
| `d08`, `d09`, `d19` | HR handbook, hiring process, relocation support | /HR |
| `d10`, `d11` | Payroll calendar, bonus scheme | /HR/Payroll |
| `d12`, `d13`, `d22` | Budget 2027 draft, supplier payment terms (Dutch), signed office lease (a scan) | /Finance |
| `d14`, `d15`, `d16`, `d20` | On-call rota, deployment guide, September incident, architecture | /Engineering |
| `d17`, `d18` | Reorganisation plan 2027, board minutes | /Management |

## Step 8. The day, change by change

Before the first Enter, try:

```
ask yusuf How many days of paid leave do I get?
```
→ the leave policy, **25 days**, with its source `d02 /Public/handbook/leave-policy.md`.

Then press **Enter** once per row, and type what the row says:

| Enter | What happens in the company | Then type | What you should see |
|---|---|---|---|
| 1 | The leave policy is edited: 25 → 27 days | `ask yusuf How many days of paid leave do I get?` then `status d02` | **27 days**; status: `revision 2`, `freshness_seconds` well under a second |
| 2 | The salary bands move from /Public to /HR/Payroll | `ask emma What is the salary range for a senior engineer?` | the line `d05: relabeled … 8 → 1 people` appeared at once; emma gets **"I could not find this in the documents you can access."** |
| 3 | The reorganisation plan moves from /Management to /Public | `ask daan What happens to the Rotterdam planning desk in 2027?` | first `would open to 6 more people, waiting for a quiet second`, a second later `2 → 8 people`; daan now gets the plan |
| 4, 5 | A repeated event, then one older than what we hold | nothing | both lines say `ignored (stale …)`: nothing changes |
| 6, 7, 8 | Press these three **quickly**: the architecture document is moved to /Public, edited, moved to /Engineering | `ask daan How often does the tracking service receive truck positions?` | one line `d20: reindexed … 3 events merged`: it was never public. Pressed slowly, each step applies and the move to /Public waits its quiet second |
| 9 | bram leaves the finance team | `ask bram What is the marketing budget in the 2027 draft?` | `team change: bram left finance-team`; bram gets **not found** |
| 10 | The September incident report is deleted | `status d16` | `"state":"deleted"` |
| 11 | A new bike lease policy is published | wait a second, then `ask yusuf Can I lease an e-bike through the company?` | the new policy, with its source |
| 12 | A change of a kind we were never told about (`rename`) | `status d04` | handled anyway: `revision 2` |

Then type `access` (every change of who can see what, in people) and `costs`.

Other things to try at any time:

```
ask ghost How many days of paid leave do I get?
status d10 anouk
ask lotte What time does the Amsterdam office close?
```

→ ghost is told they are not in the access list; anouk may not open d10, so it looks unknown to
her; lotte asks in English and gets the answer from a document written in Dutch.

When the best passage only probably answers the question, the answer starts with
**"The closest I found, it may not fully answer your question:"** (decision 0011).

## Step 9. Stop, start again

Type `quit` (or press `Ctrl` + `C`). Run `./bin/redactor demo` again to replay the day from the
start: each run begins with a fresh copy of the company.

**"port 4100 is taken" or "port 8080 is taken"**: another demo (or `serve`, `feed-sim`) is still
running in another terminal window. Close that window, or on Mac and Linux run the `lsof -i :8080`
the message gives and `kill` the number in the `PID` column.

---

# Part 2 — Reference

On Windows, replace `./bin/redactor` with `npm run redactor --` in every command below.

## The ask contract

The two calls the client's brief defines, from the command line or over HTTP:

- `ask(user_id, question) -> { answer, sources[] }`
- `status(doc_id) -> { indexed_version, indexed_at }` (plus `state`, `revision`, `freshness_seconds`)

```sh
./bin/redactor ingest                                                    # load the documents and the permission list into ./redactor.db
./bin/redactor ask yusuf "How many days of paid leave do I get?"         # quotes needed here
./bin/redactor status d02
./bin/redactor status d02 d05 --user emma                                # several documents, as a given person
```

```json
{
  "answer": "# Leave policy\nApplies to all permanent staff from 1 January 2026. …",
  "sources": [
    { "doc_id": "d02", "path": "/Public/handbook/leave-policy.md", "title": "Leave policy",
      "passage_id": 2, "snippet": "# Leave policy\nApplies to …", "url": "https://drive.example/noordlicht/d02" }
  ]
}
```

`indexed_version` is the time of the change we hold at the source; `indexed_at`, when it became
searchable; `freshness_seconds`, how long that took from the moment we received the change.

```json
{ "state": "indexed", "indexed_version": "2026-10-19T15:14:23.069+02:00",
  "indexed_at": "2026-10-19T15:14:23.495+02:00", "revision": 2, "freshness_seconds": 0.027 }
```

Each `ask` from the command line loads the models (about 5 s). For instant answers, use HTTP.

## Over HTTP, following the feed

The system reads the change feed live **from a URL given at start**: `--feed-url`. Our simulator
serves the feed; the client's day of changes would be replayed by it the same way. In two terminals:

```sh
./bin/redactor feed-sim                                        # terminal 1: the day starts now (--step: one change per Enter)
./bin/redactor serve --feed-url http://localhost:4100/events   # terminal 2: follows the feed, answers on port 8080
```

In a third terminal:

```sh
curl -X POST localhost:8080/ask -d '{"user_id":"yusuf","question":"How many days of paid leave do I get?"}'
curl localhost:8080/status/d02
curl "localhost:8080/status/d10?user_id=anouk"
```

`serve` prints every decision as it happens. Access is removed at once and granted after a quiet
second; every change of who can see a document is logged (decision 0010). Without a user, `status`
never shows a document's path or title.

**Outage and restart**: stop `serve` (`Ctrl` + `C`), let a few changes happen, start it again: it
catches up from where it stopped. Restart `feed-sim` instead: `serve` says `feed was reset …
reading again from the start`, and nothing is applied twice.

## The feed simulator

```sh
./bin/redactor feed-sim                    # the scripted day, 12 changes over 90 seconds, starting now
./bin/redactor feed-sim --step             # one change per Enter
./bin/redactor feed-sim --pace 3           # three times slower
```

Every call takes an optional `at` (an ISO time, Amsterdam or UTC) and answers as if it were then:
a whole day can be checked without waiting for it.

```sh
curl localhost:4100/events                                          # the changes so far: { events, cursor }
curl "localhost:4100/events?since=3"                                # only those after cursor 3
curl localhost:4100/documents/d02                                   # a document's current text (events never carry it)
curl "localhost:4100/events?at=$(date -u -v+2M +%Y-%m-%dT%H:%M:%SZ)" # Mac: as it will be in 2 minutes
```

## Costs, scores and tests

```sh
./bin/redactor costs                     # what the simulator calls would have cost, at the brief's fictional prices
./bin/redactor eval                      # 13 questions after the initial load: right answer, or a leak?
./bin/redactor eval --phase replayed     # 9 questions after the whole day of changes, plus status checks
npm test                                 # 122 tests
npx tsx scripts/bench-vectors.ts         # search time at 10,000, 100,000 and 1,000,000 passages
```

`eval` ends with an error code if any answer comes from a document the person may not open.

## All options

```
./bin/redactor <command> [options]
  demo                                 everything in one terminal (fresh ./demo.db each run)
  ingest                               load the documents and permission list
  ask <user_id> "<question>"           answer with sources
  status <doc_id>... [--user <id>]     indexed version, when, how fresh
  serve [--port 8080] [--feed-url <url>] [--documents-url <url>]
  feed-sim [--port 4100] [--step | --pace <n>] [--script <file>]
  costs
  eval [--phase loaded|replayed] [--json]
  --db <path>     the store (default ./redactor.db)
  --data <dir>    the documents, permissions, feed script and eval set (default ./data/sample)
```

Timestamps are Amsterdam time. Money is in euros. Nobody pays anything: prices are the brief's.

---

# Part 3 — Where to read more

| Document | What it holds |
|---|---|
| [`SPEC.md`](SPEC.md) | how the system is designed, component by component |
| [`docs/decisions/`](docs/decisions/) | why each choice, written when it was made; each data store answers the four questions |
| [`docs/contract.md`](docs/contract.md) | how we read the parts of the brief it leaves open, and what we assumed |
| [`docs/next-steps.md`](docs/next-steps.md) | the limits we found and what we would build next: **proposals, not built** |
| [`AGENTS.md`](AGENTS.md) | how this project was built with an AI assistant, and the quality gate every change passed |

Development: `npm test`, `npm run typecheck`, `npm run lint`.
