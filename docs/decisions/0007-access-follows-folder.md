# 0007 — Access follows the folder; on doubt, hide

Date: 2026-10-13 · Status: accepted (pending client confirmation)

## Context
Documents carry `allowed`, and the client says permissions follow shared-drive folders.
After a move, the two can disagree. Two readings exist:
- `allowed` is a snapshot of the folder rule at export → the folder should win.
- `allowed` holds direct shares on top of the folder → folder and shares should combine.

## Decision
The folder wins. A document's access is the rule of its closest parent folder that has one.
`allowed` is kept for audit, not used for access.

## Why
Compare the two wrong guesses:
- Folder wins, but `allowed` held direct shares: someone gets "not found" for a document they
  should see. Annoying, safe.
- Combining, but `allowed` was a stale snapshot: a document moved from a public folder to a
  restricted one stays readable by everyone. A leak.
The client's first concern is that nobody sees what they shouldn't.

## Cost of changing
Access is computed by one function from folder rules (and, if needed, direct shares).
Switching readings changes that function and triggers a relabel; nothing is re-embedded.
