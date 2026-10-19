// How the vector index behaves when the corpus is much bigger (decision 0003, question 3).
// Fills a throwaway store with random unit vectors (no embedding, no cost), then times the query
// `ask` runs: nearest 16 among the passages one person may open. Run: npx tsx scripts/bench-vectors.ts

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMBEDDING_MODEL } from "../src/config.ts";
import { openDb } from "../src/store/db.ts";

const SIZES = (process.argv[2] ?? "10000,100000,1000000").split(",").map(Number);
const QUESTIONS = 20;
const dims = EMBEDDING_MODEL.dimensions;

function randomUnitVector(): Float32Array {
  const v = Float32Array.from({ length: dims }, () => Math.random() * 2 - 1);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

const dir = mkdtempSync(join(tmpdir(), "redactor-bench-"));
try {
  const db = openDb(join(dir, "bench.db"));
  const insert = db.prepare("INSERT INTO passage_vec (rowid, embedding) VALUES (?, ?)");
  const knn = db.prepare(
    `SELECT rowid FROM passage_vec
     WHERE embedding MATCH ? AND k = 16 AND rowid IN (SELECT value FROM json_each(?))
     ORDER BY distance`,
  );
  let filled = 0;
  for (const size of SIZES) {
    const t0 = performance.now();
    db.transaction(() => {
      for (let id = filled + 1; id <= size; id++) insert.run(BigInt(id), randomUnitVector());
    })();
    filled = size;
    const loadSeconds = (performance.now() - t0) / 1000;

    // The person may open every other passage: half the corpus, passed as the visible list.
    const visible = JSON.stringify(Array.from({ length: size / 2 }, (_, i) => 2 * (i + 1)));
    const times: number[] = [];
    for (let q = 0; q < QUESTIONS; q++) {
      const t = performance.now();
      knn.all(randomUnitVector(), visible);
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? 0;
    const worst = times.at(-1) ?? 0;
    console.log(`${size.toLocaleString("en")} passages: query median ${median.toFixed(0)} ms, worst ${worst.toFixed(0)} ms (filled in ${loadSeconds.toFixed(0)} s)`);
  }
  db.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
