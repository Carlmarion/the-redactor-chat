# 0010 — Access is removed at once, granted after a quiet second; every change is logged

Date: 2026-10-16 · Status: accepted

## Context
Feed events for one document can arrive in bursts. In our script, d20 moves to /Public, is
edited, and moves to /Engineering/platform within one second (trap T5). Applying each event as it
arrives would make an engineering document searchable by all staff for about a second. The opposite
case matters as much: a document moved out of /Public into /HR/Payroll (T1) must stop being visible
at once, or every second of delay is a second of leak.

## Decision
- Before applying a document change, compare **who could see it before and who could after, as
  people** (groups expanded). Comparing labels is not enough: "payroll" replacing "all-staff" is a
  narrowing.
- A change that **adds people** waits until the document has been quiet for **1 second**. If more
  events arrive meanwhile, only the final state is applied.
- A change that **only removes people**, or leaves them unchanged, applies at once.
- Every change in who can see a document is written to `access_log`: folder before and after,
  number of people before and after, who was added, and the event that caused it.

## The four questions
1. **Why here?** The watcher already coalesces events per document; the settle rule is one check
   before applying. The log lives in the same store, written in the same transaction as the change.
2. **If it fails or is lost?** Without the delay, a passing move is exposed for about a second.
   The access log is a record, not derived data: lost with the file unless backed up (decision 0002).
3. **Much bigger?** One audience comparison per changed document: two small queries. The log grows
   with access changes, not with questions.
4. **What would change it?** The client may want a longer hold for large widenings, or a person to
   confirm them (`docs/next-steps.md`). That is a product decision: it means disagreeing with their
   drive for a while. The settle time is one constant.

## What it cannot do
It cannot tell a mistaken move from an intended one. If someone puts a sensitive file in /Public
and leaves it there, the drive says everyone may read it, and the system follows the drive.
The access log is how such a mistake gets noticed.
