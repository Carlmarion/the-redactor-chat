# 0008 — Read the feed by polling with a cursor

Date: 2026-10-13 · Status: accepted

## Context
The feed is served from a URL given at start. Its transport is not specified.
Freshness is measured in real time.

## Decision
Poll every second: `GET <feed>?since=<cursor>`. Apply the events, then save the cursor in the
store. On restart, resume from the saved cursor. Behind a `FeedReader` interface.

## Why
- The brief describes simulator calls with an `at` parameter: request/response HTTP.
- Polling adds at most one second of delay, the same order as re-embedding a document.
- Streaming (server-sent events) would save about half a second on average, at the cost of
  reconnection handling. Its own resume mechanism (`Last-Event-ID`) maps onto the same cursor,
  so a streaming reader can be added behind the same interface if the client's feed streams.
- Auto-detecting the transport is not built: one reader, chosen once the real feed is known.

## Consequences
Crash-safe without extra machinery: a replayed event is harmless (decision 0006).
