import { describe, expect, it } from "vitest";
import { parseDemoLine } from "../src/commands/demo-line.ts";

describe("parseDemoLine", () => {
  it("an empty line delivers the next event", () => {
    expect(parseDemoLine("")).toEqual({ kind: "next" });
    expect(parseDemoLine("   ")).toEqual({ kind: "next" });
  });

  it("ask takes a user and the rest of the line as the question, quotes or not", () => {
    expect(parseDemoLine("ask emma What is the salary range?")).toEqual({ kind: "ask", userId: "emma", question: "What is the salary range?" });
    expect(parseDemoLine('ask emma "What is the salary range?"')).toEqual({ kind: "ask", userId: "emma", question: "What is the salary range?" });
  });

  it("status takes a document and an optional user", () => {
    expect(parseDemoLine("status d02")).toEqual({ kind: "status", docId: "d02" });
    expect(parseDemoLine("status d10 anouk")).toEqual({ kind: "status", docId: "d10", userId: "anouk" });
  });

  it("sees takes exactly one user", () => {
    expect(parseDemoLine("sees anouk")).toEqual({ kind: "sees", userId: "anouk" });
    expect(parseDemoLine("sees")).toEqual({ kind: "unknown", text: "sees" });
    expect(parseDemoLine("sees anouk emma")).toEqual({ kind: "unknown", text: "sees anouk emma" });
  });

  it("knows the read-only views and quitting", () => {
    expect(parseDemoLine("access")).toEqual({ kind: "access" });
    expect(parseDemoLine("costs")).toEqual({ kind: "costs" });
    expect(parseDemoLine("people")).toEqual({ kind: "people" });
    expect(parseDemoLine("help")).toEqual({ kind: "help" });
    expect(parseDemoLine("quit")).toEqual({ kind: "quit" });
  });

  it("anything incomplete or unknown is answered with the help, never guessed", () => {
    expect(parseDemoLine("ask emma")).toEqual({ kind: "unknown", text: "ask emma" });
    expect(parseDemoLine("status")).toEqual({ kind: "unknown", text: "status" });
    expect(parseDemoLine("delete d02")).toEqual({ kind: "unknown", text: "delete d02" });
  });
});
