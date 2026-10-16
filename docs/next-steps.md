# Where the system stops, and what would take it further

Written 2026-10-15, after the first measurements with `redactor eval` (decision 0009).
Each finding below comes from a real answer, not from theory.

## What the measurements showed

**Access holds.** In every configuration we measured, no answer cited a document the person may
not open. Access is decided before anything is ranked, so this does not depend on how good the
ranking is.

**"Best passage" is not "a passage that answers".** The brief's extract mode returns the best
passage among those it is given, and needs no paid model. When nothing a person may read answers
their question, the best passage is still returned, and our answer policy has to decide whether
it is good enough. Two cases from the eval set:

| Question | Asked by | What came back | Why |
|---|---|---|---|
| "When is salary paid in December?" (E08) | anouk: HR, not payroll | The salary section of the HR handbook | The payroll calendar is hidden from her, correctly. The closest passage she may read is about salaries, but not about December |
| "What relocation allowance do new hires get?" (E11) | daan: engineering | The welcome page for new staff | The relocation document is in /HR. The welcome page shares the word "get" and a similar topic |

Neither is a leak. Both are off topic, and a person would expect "not found".

**Similarity alone cannot tell them apart.** The model scores every question–passage pair between
roughly 0.75 and 0.90. One wrong answer scored 0.819 and one right answer 0.818. Shared keywords
help, but cannot be required: an English question about a Dutch document shares no word with it.

**Some sensitive content sits inside documents a person may open.** The answer to E08 contains
pay figures (the approval limit for an offer, the company's raise budget). anouk may open the HR
handbook, so the system is right to show it. Whether an HR member outside payroll should read
those figures is a question about parts of documents, which folder permissions cannot express.

## Direction 1: redaction (passages, not just documents)

Give each passage its own access label, defaulting to its document's, so that one section can be
hidden from people who may open the rest. The answer would then come from the visible part only,
and a hidden section would never be ranked, exactly like a hidden document today.

- **The store already supports it.** Access is a label next to each passage's document; moving
  it to the passage changes one join.
- **The hard part is not the code: who decides which section is sensitive?** The data contract
  has no section-level permissions. Options: the document author marks sections (a heading tag),
  or a model proposes and a person approves. A model must never decide alone.
- Question for the client: are there documents where only some parts are sensitive, and who
  would own that decision?

## Direction 2: a relevance check by a small model

After access is decided and the best passages are found, ask a small model one question: "does
this passage answer the question?" Yes: answer. No: "not found".

- **The model decides what is useful, never what is allowed.** It only ever sees passages the
  person may already read. Letting a model decide access would make it open to instructions
  hidden inside documents, and to different answers for the same question.
- **Cost, at the brief's prices:** model S takes up to 4 passages and 2,250 input tokens, at
  €0.20 per million input tokens: about **€0.0005 per question**. It goes through the same adapter
  as everything else (context limit, throttle, price), and the cost lands in the same ledger.
- **What to measure first:** whether it turns E08 and E11 into "not found" without losing any
  right answer, with `redactor eval`.

## Order we would follow

1. A cheaper rule first: in the medium-similarity zone, require two meaningful shared words
   instead of one. Free; kept only if the eval says so.
2. The relevance check (direction 2): small, cheap, measurable.
3. Redaction (direction 1): the larger change, and the one that needs the client's input.

## Product choices to offer the client

These change what the system does when the client's own drive is wrong, so they are the client's
decision, not ours. Not built.

- **Hold large widenings.** When a document moves from a restricted folder to one most staff can
  open, wait (for example 15 minutes) or ask a person to confirm before it becomes searchable.
  Catches a file moved to the wrong folder by mistake, at the cost of disagreeing with the drive
  for a while.
- **Read before widening.** Before a document becomes visible to many more people, look for
  sensitive content (pay, bank details, health) and alert its owner. The same tooling as the
  relevance check and redaction above.

What is built: every widening of access is logged with who could see the document before and
after, so a mistake is visible within minutes.
