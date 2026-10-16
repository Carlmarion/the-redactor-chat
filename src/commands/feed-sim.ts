// `redactor feed-sim`: our simulator's scripted feed, timed (optionally slowed) or one event
// per press of Enter for a demo at human speed.

import { createInterface } from "node:readline";
import { FeedScript } from "../simulator/feed-script.ts";
import { feedServer } from "../simulator/feed-server.ts";
import { SampleData } from "../sources/sample-data.ts";

export interface FeedSimOptions {
  dataDir: string;
  port: number;
  scriptPath?: string;
  pace: number;
  step: boolean;
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/Amsterdam" });

export async function runFeedSim(o: FeedSimOptions): Promise<never> {
  const script = await FeedScript.load(o.dataDir, new Date(), new SampleData(o.dataDir), {
    ...(o.scriptPath ? { scriptPath: o.scriptPath } : {}),
    pace: o.pace,
    step: o.step,
  });
  const say = (line: string) => process.stderr.write(`${line}\n`);
  feedServer(script).listen(o.port, () => {
    say(`feed simulator on http://localhost:${o.port}  (events: /events, documents: /documents/<doc_id>)`);
    say(o.step ? "step mode: press Enter to deliver the next event" : `timed replay, last event at ${clock(script.endsAt)}`);
  });
  if (o.step) {
    createInterface({ input: process.stdin }).on("line", () => {
      const released = script.releaseNext(Date.now());
      if (!released) return say("the script is over");
      const e = released.event;
      const what = e.action === "access" ? `access ${JSON.stringify(e.change)}` : `${String(e.doc_id)} ${String(e.action)} ${String(e.path)}`;
      say(`#${released.index + 1} ${released.trap ?? ""}  ${what}`);
    });
  }
  return new Promise<never>(() => undefined);
}
