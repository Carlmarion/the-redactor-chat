# 0011 — Extract re-reads each candidate; three answers: the answer, the closest match, not found

Date: 2026-10-19 · Status: accepted, to re-measure on the client's data · Replaces the thresholds of 0009

## Context
After the feed, a person who loses access to a document gets an off-topic answer instead of
"not found". Example: once the salary bands move to /HR/Payroll, emma asks for the salary range of
a senior engineer and gets the on-call pay passage. Never a leak, but misleading.

The cause is how extract scored: the question and each passage were turned into vectors separately
and compared. "Salary range for a senior engineer" and "€250 a week on-call pay for engineers"
both summarise as *money, engineers*: 0.846, above the cut-off. Right and off-topic answers overlap
(off topic 0.82–0.85, right 0.82–0.89), so no cut-off separates them.

Tried and dropped (measured, code thrown away):
- **Two shared words**: applies only between 0.80 and 0.825; the worst cases are above it.
- **The question's rarest word must be in the passage**: it already is in all four off-topic cases
  ("engineer" is in the on-call passage). Catches 0 of 4.

## Decision
Extract re-reads: a cross-encoder model (`Xenova/bge-reranker-base`, multilingual, local) reads the
question and each candidate passage *together* and says how likely the passage answers it, from 0
to 1. It re-reads only the at most 16 candidates the search already found, so search stays fast.

| Likelihood | What the person gets |
|---|---|
| ≥ 0.5 | the passage, as the answer |
| 0.05 to 0.5 | the passage, introduced as "the closest I found, it may not fully answer your question" |
| < 0.05 | "I could not find this in the documents you can access." |

The middle band is the honest answer to a thin margin: the closest off-topic case scores 0.039,
the lowest right answer 0.080.

## What we measured (`redactor eval`)

| Phase | Before | After | Leaks |
|---|---|---|---|
| loaded (13) | 11 | 13 | 0 |
| replayed (9) | 6 | 8 | 0 |

Off-topic cases now: E04 0.039, E08 0.007, E11 0.003, E15 0.003. Right answers: 0.75–0.999, and
E22 (escalation ladder, from image alt text) 0.080 in the middle band. E05 still cites the HR
handbook's salary section for sanne instead of the salary bands: the handbook does mention a senior
engineer offer; a ranking choice between two documents she may read.

## Known limitation: scores move with the wording
Probing the model with excerpts of the on-call document for emma's salary question:

| Passage given | Likelihood |
|---|---|
| the whole document, with its title "On-call rota and escalation" | 0.039 |
| its first paragraph and the pay line | 0.636 |
| two short sentences: one engineer on call, on-call pay €250 a week | 0.892 |
| the pay line alone | 0.269 |
| "Full-time staff get 25 days of paid annual leave" (unrelated) | 0.227 |

The model (quantised, base size) reads short passages about money and engineers as likely
answers. A heading travels with the paragraph under it, which helps, and the eval holds; but on
another corpus some off-topic answers will land in the middle band, labelled as the closest match,
or above it. Re-measured on the client's data. What goes further: a larger re-reading model, or
the relevance check by a small language model (`../next-steps.md`).

## Cost
Extract has no price in the brief ("no paid model is needed"), and this model runs locally:
**€0 per question**. It costs time and disk: about 0.3–0.5 s per question for 8–16 candidates, and
a 289 MB download on first run (next to the 129 MB embedding model). Embedding the question is
still the only paid call. The fictional S/M/L models are not used.

## The four questions
1. **Why here?** Extract is the simulator's job ("question and passages in, best passage out"),
   behind the `Extractor` port. The thresholds stay in our code (`answer-policy.ts`).
2. **If it is wrong or down?** Too strict: more "closest match" or "not found". Too loose: an
   off-topic passage, labelled as a closest match when unsure. Never a hidden document: access is
   decided before ranking. If the model cannot load, `ask` fails loudly instead of guessing.
3. **Much bigger?** Cost grows with candidates per question (at most 16), not with the corpus.
   On a busy service it needs a GPU or a hosted re-ranker; the port stays.
4. **What makes us change it?** The client's data: thresholds re-measured with `redactor eval`. If
   their simulator's extract replaces ours, its score must be mapped onto the same three bands.
