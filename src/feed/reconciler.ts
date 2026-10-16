// Brings one document in line with its current state (decision 0006). Several events for the
// same document are coalesced: the latest says what to do, the first says since when we waited.
// Planning reads; applying writes, in one transaction per document.

import { basename } from "node:path";
import { audienceOf, documentAudience, newcomers } from "../access/audience.ts";
import { labelDocument, ruleFor } from "../access/doc-access.ts";
import { contentHash, type Indexer } from "../ingest/indexer.ts";
import type { DocumentSource, SourceDocument } from "../ports.ts";
import type { Db } from "../store/db.ts";
import { dropPassages } from "../store/passages.ts";
import { amsterdamIso } from "../time.ts";
import type { DocId, UserId } from "../types.ts";
import { decide, type Decision, type KnownState } from "./decide.ts";
import type { EventLog, LoggedEvent, Outcome } from "./event-log.ts";

export interface Plan {
  docId: DocId;
  events: LoggedEvent[];
  latest: LoggedEvent & { path: string; modified_at: string; action: string };
  decision: Decision;
  current: SourceDocument | null;
  /** People who could not see the document and would after this change. */
  widensTo: UserId[];
}

interface KnownRow extends KnownState {
  title: string;
  url: string | null;
  folder: string | null;
}

const OUTCOME: Record<Decision["kind"], Outcome> = {
  ignore: "ignored",
  delete: "deleted",
  reindex: "reindexed",
  relabel: "relabeled",
  touch: "touched",
};

export class Reconciler {
  constructor(
    private readonly db: Db,
    private readonly indexer: Indexer,
    private readonly documents: DocumentSource,
    private readonly log: EventLog,
  ) {}

  /** `events`: the pending document events of one document. */
  async plan(events: LoggedEvent[]): Promise<Plan> {
    const latest = latestOf(events);
    const docId = latest.doc_id ?? "";
    const known = this.known(docId);
    const current = await this.documents.read(docId);
    const decision = decide(latest, known, current ? contentHash(current.text) : null);
    const changesAccess = decision.kind === "reindex" || decision.kind === "relabel";
    const widensTo = changesAccess
      ? newcomers(documentAudience(this.db, docId), audienceOf(this.db, ruleFor(this.db, latest.path).principals))
      : [];
    return { docId, events, latest, decision, current, widensTo };
  }

  /** Applies the plan and returns one line saying what happened, for the operator. */
  async apply(plan: Plan): Promise<string> {
    const { docId, latest, decision } = plan;
    const known = this.known(docId);
    const first = plan.events[0]?.event_id ?? null;
    const ids = plan.events.map((e) => e.event_id);
    const peopleBefore = documentAudience(this.db, docId);
    const now = amsterdamIso();

    if (decision.kind === "ignore" || (decision.kind === "delete" && !known)) {
      const reason = decision.kind === "ignore" ? "stale: we hold a version at least as recent" : "nothing to delete";
      this.log.close(ids, "ignored", reason, now);
      return `${docId}: ignored (${reason})`;
    }
    if (decision.kind === "reindex") {
      const text = plan.current?.text ?? "";
      await this.indexer.index({
        doc_id: docId,
        path: latest.path,
        title: plan.current?.title ?? firstHeading(text) ?? known?.title ?? basename(latest.path),
        url: known?.url ?? null,
        text,
        version: latest.modified_at,
        source_event_id: first,
      });
    }
    this.db.transaction(() => {
      if (decision.kind === "delete") {
        dropPassages(this.db, docId);
        this.db.prepare("DELETE FROM doc_access WHERE doc_id = ?").run(docId);
        this.stamp(docId, latest.modified_at, now, first, { deleted: true, revision: true });
      }
      if (decision.kind === "relabel") {
        this.db.prepare("UPDATE documents SET previous_path = path, path = ? WHERE doc_id = ?").run(latest.path, docId);
        labelDocument(this.db, docId, latest.path);
        this.stamp(docId, latest.modified_at, now, first, { revision: true });
      }
      if (decision.kind === "touch") this.stamp(docId, latest.modified_at, now, first, {});
      const appliedAt = (this.db.prepare("SELECT indexed_at FROM documents WHERE doc_id = ?").pluck().get(docId) as string | undefined) ?? now;
      this.logAccessChange(docId, known?.folder ?? null, peopleBefore, first, appliedAt);
      this.log.close(ids, OUTCOME[decision.kind], null, appliedAt);
    })();
    const people = `${peopleBefore.size} → ${documentAudience(this.db, docId).size} people can see it`;
    const merged = ids.length > 1 ? `, ${ids.length} events merged` : "";
    return `${docId}: ${OUTCOME[decision.kind]} (${latest.action} ${latest.path}${merged}; ${people})`;
  }

  private known(docId: DocId): KnownRow | null {
    const row = this.db
      .prepare("SELECT version, path, content_hash, deleted, title, url, folder FROM documents WHERE doc_id = ?")
      .get(docId) as (Omit<KnownRow, "deleted"> & { deleted: number }) | undefined;
    return row ? { ...row, deleted: row.deleted === 1 } : null;
  }

  private stamp(docId: DocId, version: string, at: string, sourceEventId: number | null, opts: { deleted?: boolean; revision?: boolean }): void {
    this.db
      .prepare(
        `UPDATE documents SET version = ?, indexed_at = ?, source_event_id = ?,
           deleted = CASE WHEN ? THEN 1 ELSE deleted END,
           revision = revision + CASE WHEN ? THEN 1 ELSE 0 END
         WHERE doc_id = ?`,
      )
      .run(version, at, sourceEventId, opts.deleted ? 1 : 0, opts.revision ? 1 : 0, docId);
  }

  /** Writes a line to the access log when the set of people who can see the document changed. */
  private logAccessChange(docId: DocId, folderBefore: string | null, before: Set<UserId>, cause: number | null, at: string): void {
    const after = documentAudience(this.db, docId);
    const added = newcomers(before, after);
    const removed = newcomers(after, before);
    if (added.length === 0 && removed.length === 0) return;
    const folderAfter = this.db.prepare("SELECT folder FROM documents WHERE doc_id = ?").pluck().get(docId) as string | null;
    this.db
      .prepare(
        `INSERT INTO access_log (at, doc_id, folder_before, folder_after, people_before, people_after, newcomers, widened, cause_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(at, docId, folderBefore, folderAfter, before.size, after.size, JSON.stringify(added), added.length > 0 ? 1 : 0, cause);
  }
}

/** The event that says what the document looks like now: the most recent `modified_at`. */
function latestOf(events: LoggedEvent[]): Plan["latest"] {
  const sorted = [...events].sort((a, b) => Date.parse(a.modified_at ?? "") - Date.parse(b.modified_at ?? "") || a.event_id - b.event_id);
  const latest = sorted.at(-1);
  if (!latest?.path || !latest.modified_at || !latest.action) throw new Error("a document event needs a path, a time and an action");
  return latest as Plan["latest"];
}

function firstHeading(text: string): string | null {
  return /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? null;
}
