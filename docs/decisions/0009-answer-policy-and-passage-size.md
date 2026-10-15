# 0009 — When a passage is the answer, and how big passages are

Date: 2026-10-15 · Status: accepted, to re-measure on the client's data

## Context
The answer is the best passage, word for word. The model scores every question–passage pair
between roughly 0.75 and 0.90 (decision 0005), so the "not found" cut-off cannot be guessed.
We measured it with `redactor eval` on the 13 questions of the initial-load phase.

## What we measured

| Passages ≤ | Pass | Leaks | Notes |
|---|---|---|---|
| 500 tokens | 10/13 | 0 | E21 cites the hiring process instead of the HR handbook |
| 250 tokens | 11/13 | 0 | E21 fixed; nothing else changes |
| 150 tokens | 11/13 | 0 | the Dutch (E13) and alt-text (E22) answers lose score |

With one cut-off, a wrong answer (E11, 0.819) and a right one (E22, 0.818) are 0.001 apart.
Keywords as a strict filter would lose the cross-language case (E13: English question, Dutch
document, no shared word). A first keyword signal matched every passage, because words like
"the" and "what" match everything.

## Decision
- Passages of at most **250 tokens**: best score, shorter answers.
- A passage is the answer if its similarity is **≥ 0.825**, or **≥ 0.80 and it shares a meaningful
  word** with the question. A word is meaningful when it appears in at most a quarter of the
  passages: measured on the corpus, so no word list and any language.
- Below that: "not found in documents you can access".

## Known limitation
E11 ("relocation allowance", asked by someone who may not open the relocation document) answers
with the visible welcome document instead of "not found". It is off topic, never a leak: the
hidden document cannot appear. The shared word is "get", which our 23-passage sample is too small
to recognise as common. We do not tune further on 13 questions: that would be learning our own
test by heart. What would go further: [`../next-steps.md`](../next-steps.md).

## The four questions
1. **Why here?** The policy sits in our code, after the simulator's extract, so the same rule
   holds whichever simulator answers.
2. **If it is wrong?** Too strict: "not found" when an answer exists. Too loose: an off-topic
   visible passage. Neither reveals a hidden document; access is decided before ranking.
3. **Much bigger?** The common-word filter improves with size. The thresholds may drift with a
   different corpus, so they are re-measured.
4. **What makes us change it?** The client's corpus and feed: `redactor eval` runs again on their
   data on Monday, and the numbers here are updated as a dated note.
