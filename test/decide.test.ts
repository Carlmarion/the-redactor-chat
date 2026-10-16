// The rules for one document event, one test per rule, named after the trap that needs it.
import { describe, expect, it } from "vitest";
import { decide, type DocEvent, type KnownState } from "../src/feed/decide.ts";

const known: KnownState = {
  version: "2026-10-16T10:00:00+02:00",
  path: "/Public/handbook/leave-policy.md",
  content_hash: "hash-v1",
  deleted: false,
};
const event = (over: Partial<DocEvent> = {}): DocEvent => ({
  action: "update",
  path: known.path,
  modified_at: "2026-10-16T10:00:10+02:00",
  ...over,
});

describe("decide", () => {
  it("ignores an event older than what we hold (T4, stale)", () => {
    expect(decide(event({ modified_at: "2026-10-12T17:00:00+02:00" }), known, "hash-v2")).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("ignores the same event delivered twice (T4, duplicate)", () => {
    expect(decide(event({ modified_at: known.version }), known, "hash-v1")).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("compares times, not text: the same moment written with another offset is still a duplicate", () => {
    expect(decide(event({ modified_at: "2026-10-16T08:00:00Z" }), known, "hash-v1")).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("checks staleness first: an old event never deletes, even if the document is gone", () => {
    expect(decide(event({ modified_at: "2026-10-12T17:00:00+02:00" }), known, null)).toEqual({ kind: "ignore", reason: "stale" });
  });

  it("deletes when the source no longer has the document (T6)", () => {
    expect(decide(event({ action: "delete" }), known, null)).toEqual({ kind: "delete" });
  });

  it("deletes when the text is gone, whatever the action says (A6)", () => {
    expect(decide(event({ action: "update" }), known, null)).toEqual({ kind: "delete" });
  });

  it("indexes a document it has never seen (C4, create)", () => {
    expect(decide(event({ action: "create" }), null, "hash-new")).toEqual({ kind: "reindex" });
  });

  it("indexes a deleted document that comes back", () => {
    expect(decide(event(), { ...known, deleted: true }, "hash-v1")).toEqual({ kind: "reindex" });
  });

  it("re-indexes when the text changed (T3)", () => {
    expect(decide(event(), known, "hash-v2")).toEqual({ kind: "reindex" });
  });

  it("re-indexes when both text and path changed (T5)", () => {
    expect(decide(event({ path: "/Engineering/platform/architecture.md" }), known, "hash-v2")).toEqual({ kind: "reindex" });
  });

  it("only relabels when just the path changed: new access, no re-embedding (T1, T2)", () => {
    expect(decide(event({ path: "/HR/Payroll/leave-policy.md" }), known, "hash-v1")).toEqual({ kind: "relabel" });
  });

  it("touches when nothing changed, whatever the action is called (C4, rename)", () => {
    expect(decide(event({ action: "rename" }), known, "hash-v1")).toEqual({ kind: "touch" });
  });
});
