# 0001 — Build against our own simulator, behind adapters

Date: 2026-10-13 · Status: accepted

## Context
The client has asked for the system but has not yet opened access to its data.
The corpus, permission list and change feed arrive two days before the end.
The simulator (embed, extract, scripted feed) is ours to deliver.

## Decision
Everything external enters through an interface (port): document source, permission source,
feed, embed, extract, model. Today each port is backed by our own implementation and
generated sample data. When the real inputs arrive, we write a mapping and swap the backing.
The core (store, access, retrieval, answers) never depends on a concrete source.

## Consequences
- Work starts now instead of waiting five days.
- The late integration is a bounded task: a mapping layer, not a rewrite.
- Risk: our sample data shapes may differ from the real ones. Mitigation: keep the mapping
  layer thin and explicit, and budget integration time on the last two days.
