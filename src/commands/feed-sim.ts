// `redactor feed-sim`: our simulator's scripted feed, timed (optionally slowed) or one event
// per press of Enter for a demo at human speed.

import { createInterface } from "node:readline";
import { FeedScript } from "../simulator/feed-script.ts";
import { feedServer } from "../simulator/feed-server.ts";
import { SampleData } from "../sources/sample-data.ts";
import { amsterdamIso } from "../time.ts";
import { portTaken, type Say } from "./serve.ts";

export interface FeedSimOptions {
  dataDir: string;
  port: number;
  scriptPath?: string;
  pace: number;
  step: boolean;
}

export async function runFeedSim(o: FeedSimOptions): Promise<never> {
  const say: Say = (line) => process.stderr.write(`${line}\n`);
  const script = await startFeedSim(o, say);
  if (o.step) createInterface({ input: process.stdin }).on("line", () => say(deliverNext(script)));
  return new Promise<never>(() => undefined);
}

/** Loads the script and serves it over HTTP; in step mode nothing is delivered until `deliverNext`. */
export async function startFeedSim(o: FeedSimOptions, say: Say): Promise<FeedScript> {
  const start = new Date();
  const script = await FeedScript.load(o.dataDir, start, new SampleData(o.dataDir), {
    ...(o.scriptPath ? { scriptPath: o.scriptPath } : {}),
    pace: o.pace,
    step: o.step,
  });
  feedServer(script)
    .on("error", portTaken(o.port, say))
    .listen(o.port, () => {
      say(`feed simulator on http://localhost:${o.port}  (events: /events, documents: /documents/<doc_id>)`);
      say(o.step ? "step mode: press Enter to deliver the next event" : `timed replay from ${amsterdamIso(start)} to ${amsterdamIso(new Date(script.endsAt))} (Amsterdam time; any time in between works as ?at=)`);
    });
  return script;
}

/** Step mode: delivers the next event now and says which one. */
export function deliverNext(script: FeedScript): string {
  const released = script.releaseNext(Date.now());
  if (!released) return "the script is over";
  const e = released.event;
  const what = e.action === "access" ? `access ${JSON.stringify(e.change)}` : `${String(e.doc_id)} ${String(e.action)} ${String(e.path)}`;
  return `event #${released.index + 1} ${released.trap ?? ""}  ${what}`;
}
