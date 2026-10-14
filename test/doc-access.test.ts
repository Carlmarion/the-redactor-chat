import { describe, expect, it } from "vitest";
import { governingFolder, labelDocument } from "../src/access/doc-access.ts";
import { openDb } from "../src/store/db.ts";
import { replacePermissions } from "../src/store/permissions.ts";

const ruled = ["/Public", "/HR", "/HR/Payroll", "/Finance"];

describe("governingFolder", () => {
  it("picks the closest parent folder with a rule", () => {
    expect(governingFolder("/HR/Payroll/bonus.md", ruled)).toBe("/HR/Payroll");
    expect(governingFolder("/HR/hiring.md", ruled)).toBe("/HR");
    expect(governingFolder("/Public/announcements/reorg.md", ruled)).toBe("/Public");
  });

  it("does not mistake a name prefix for a parent", () => {
    expect(governingFolder("/HRarchive/old.md", ruled)).toBeNull();
  });

  it("returns null when no parent has a rule", () => {
    expect(governingFolder("/Secret/plan.md", ruled)).toBeNull();
  });
});

describe("labelDocument", () => {
  function store() {
    const db = openDb(":memory:");
    replacePermissions(db, {
      users: ["anouk", "sanne"],
      groups: { "hr-team": ["anouk", "sanne"], payroll: ["sanne"] },
      folders: { "/HR": ["hr-team"], "/HR/Payroll": ["payroll"] },
    });
    db.prepare("INSERT INTO documents (doc_id, path, title, version) VALUES ('d1', '/HR/x.md', 'X', 'v1')").run();
    return db;
  }

  it("labels a document with its governing folder's principals only", () => {
    const db = store();
    expect(labelDocument(db, "d1", "/HR/Payroll/x.md")).toEqual({ folder: "/HR/Payroll", principals: ["payroll"] });
    expect(db.prepare("SELECT principal_id FROM doc_access").pluck().all()).toEqual(["payroll"]);
  });

  it("relabels on a move, dropping the old access", () => {
    const db = store();
    labelDocument(db, "d1", "/HR/x.md");
    labelDocument(db, "d1", "/HR/Payroll/x.md");
    expect(db.prepare("SELECT principal_id FROM doc_access").pluck().all()).toEqual(["payroll"]);
  });

  it("fails closed: a document outside every ruled folder is visible to nobody", () => {
    const db = store();
    expect(labelDocument(db, "d1", "/Nowhere/x.md")).toEqual({ folder: null, principals: [] });
    expect(db.prepare("SELECT count(*) FROM doc_access").pluck().get()).toBe(0);
  });
});
