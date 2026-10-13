# Sample data: Noordlicht Logistics

Generated stand-in for the client's corpus, permission list and change feed, used until the real dump arrives.
Noordlicht Logistics is fictional: 8 staff accounts, 6 groups, 20 documents in English and Dutch.

| File | What it is |
|---|---|
| `documents.json` | Document list in the data-contract shape, plus our `doc_id` (C1) and nullable `url` (C9) |
| `corpus/<doc_id>.md` | Text of each document at export time |
| `permissions.json` | Users, group memberships, folder rules |
| `feed-script.json` | Scripted change events for our feed simulator, with the text each change introduces |
| `revisions/<doc_id>/<n>.md` | Text served by the document source after a scripted change |
| `eval.json` | Questions with who asks, what must and must not be cited, and status checks |

## Who is who

| User | Groups |
|---|---|
| anouk | all-staff, hr-team, management |
| sanne | all-staff, hr-team, payroll |
| bram | all-staff, finance-team (removed at +60 s) |
| lotte | all-staff, finance-team |
| daan, emma, yusuf | all-staff, eng-team |
| joost | all-staff, management |

Folders: `/Public` all-staff · `/HR` hr-team · `/HR/Payroll` payroll · `/Finance` finance-team + management · `/Engineering` eng-team · `/Management` management.

## Traps

| # | When | What happens | What must be true | Eval |
|---|---|---|---|---|
| T1 | +20 s | "Salary bands" (d05), misfiled in /Public, moves to /HR/Payroll | Only payroll sees it afterwards | E03–E05 |
| T2 | +30 s | "Reorganisation plan" (d17) moves from /Management to /Public | Everyone sees it afterwards | E06–E07 |
| T3 | +10 s | Leave policy (d02) edited: 25 → 27 days | The answer changes | E01–E02 |
| T4 | +40 s, +45 s | Duplicate of T3; stale event on d07 older than the export | Both ignored; d07 stays in /Public | status |
| T5 | +50 → +51 s | d20 moves to /Public, is edited, moves to /Engineering/platform | Final path and new text; never public at rest | E19–E20 |
| T6 | +70 s | d16 deleted | Never cited again | E16–E17 |
| T7 | — | HR handbook (d08) has a salary section | Redaction candidate (bonus) | E21 |
| T8 | — | d19 in /HR lists `daan` in `allowed` | Folder wins: daan does not see it | E11–E12 |
| T9 | — | Unknown user `ghost` asks | Sees nothing | E10 |
| T10 | — | anouk is HR but not payroll | No access to /HR/Payroll | E08–E09 |
| T11 | — | English question, Dutch document (d06) | Found | E13 |
| T12 | +60 s | bram leaves finance-team, on the same feed | Loses /Finance | E14–E15 |
| C4 | +80 s, +90 s | `create` (d21, new) and unknown action `rename` (d04) | Both reconciled | E18, status |

## Shapes we invented (to replace when the real feed arrives)

- Access events: `{ "action": "access", "change": { "op": "remove_member", "group", "user" } }`, no `doc_id`.
- A created document has no title in its event; the title is read from the first heading of its text.
- `exported_at` on the document list stamps the initial version of every document.
