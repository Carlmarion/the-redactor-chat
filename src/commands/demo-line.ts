// What a line typed in `redactor demo` means. Anything incomplete or unknown is reported, never guessed.

import type { DocId, UserId } from "../types.ts";

export type DemoCommand =
  | { kind: "next" }
  | { kind: "ask"; userId: UserId; question: string }
  | { kind: "status"; docId: DocId; userId?: UserId }
  | { kind: "access" }
  | { kind: "costs" }
  | { kind: "help" }
  | { kind: "quit" }
  | { kind: "unknown"; text: string };

const VIEWS: Partial<Record<string, DemoCommand>> = {
  access: { kind: "access" },
  costs: { kind: "costs" },
  help: { kind: "help" },
  quit: { kind: "quit" },
};

export function parseDemoLine(line: string): DemoCommand {
  const text = line.trim();
  if (text === "") return { kind: "next" };
  const [word = "", first, ...rest] = text.split(/\s+/);
  const unknown: DemoCommand = { kind: "unknown", text };

  if (word === "ask") {
    const question = rest.join(" ").replace(/^"(.*)"$/, "$1");
    return first && question ? { kind: "ask", userId: first, question } : unknown;
  }
  if (word === "status") {
    if (!first) return unknown;
    const [userId] = rest;
    return userId ? { kind: "status", docId: first, userId } : { kind: "status", docId: first };
  }
  const view = VIEWS[word];
  return view && !first ? view : unknown;
}
