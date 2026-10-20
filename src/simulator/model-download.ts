// The first run downloads the local models (about 420 MB). Without a word on screen, a first-time
// reader sees a frozen terminal; this says which model is downloading and how far it is.
// Once the models are in the cache directory (./.models, set in local-embedder.ts), nothing is printed.

import { existsSync } from "node:fs";
import { env, type ProgressCallback } from "@huggingface/transformers";

const STEP_PERCENT = 25;
const SMALL_FILE_BYTES = 1_000_000;

/** Loading options that report the model's first download; none when it is already on disk. */
export function downloadProgress(modelId: string, write: (line: string) => void = toStderr): { progress_callback?: ProgressCallback } {
  if (existsSync(`${env.cacheDir}${modelId}`)) return {};
  write(`downloading the model ${modelId} (first run only)…`);
  const shown = new Map<string, number>();
  const progress_callback: ProgressCallback = (info) => {
    if (info.status !== "progress" || info.total < SMALL_FILE_BYTES) return;
    const step = Math.floor(info.progress / STEP_PERCENT) * STEP_PERCENT;
    if (step <= (shown.get(info.file) ?? -1)) return;
    shown.set(info.file, step);
    write(`  ${modelId} ${info.file}: ${step}% of ${Math.round(info.total / 1_000_000)} MB`);
  };
  return { progress_callback };
}

function toStderr(line: string): void {
  process.stderr.write(`${line}\n`);
}
