// The first run downloads the local models (about 420 MB). Without a word on screen, a first-time
// reader sees a frozen terminal; this shows one bar filling up in place for every model being
// downloaded at once. Not a terminal (a log file): one line at the start, one at the end.
// Once the models are in the cache directory (./.models, set here for every model), nothing is printed.

import { existsSync } from "node:fs";
import { env, type ProgressCallback } from "@huggingface/transformers";

env.cacheDir = new URL("../../.models/", import.meta.url).pathname;

const BAR_WIDTH = 24;
const MB = 1_000_000;

export interface ModelDownload {
  /** Loading options: report the download, or nothing when the model is already on disk. */
  options: { progress_callback?: ProgressCallback };
  /** Call once the model is loaded, even on failure: the last download to finish closes the bar. */
  finish(): void;
}

// Shared by every model loading in this process, so concurrent downloads fill one bar.
const files = new Map<string, { loaded: number; total: number }>();
let downloading = 0;
let shownPercent = -1;

export function startDownload(modelId: string, out: NodeJS.WriteStream = process.stderr): ModelDownload {
  if (existsSync(`${env.cacheDir}${modelId}`)) return { options: {}, finish: () => {} };
  if (downloading++ === 0 && !out.isTTY) out.write("downloading the AI models (first run only)…\n");
  const progress_callback: ProgressCallback = (info) => {
    // Each loading call reports every file it needs, with sizes known from the start; files shared
    // between calls (the tokenizer) are counted once.
    if (info.status !== "progress_total") return;
    for (const [file, bytes] of Object.entries(info.files)) files.set(`${modelId}/${file}`, bytes);
    if (out.isTTY) drawBar(out);
  };
  return {
    options: { progress_callback },
    finish: () => {
      if (--downloading > 0) return;
      if (out.isTTY) out.write("\n");
      else out.write(`models downloaded (${Math.round(totals().total / MB)} MB)\n`);
      files.clear();
      shownPercent = -1;
    },
  };
}

function totals(): { loaded: number; total: number } {
  let loaded = 0;
  let total = 0;
  for (const file of files.values()) {
    loaded += file.loaded;
    total += file.total;
  }
  return { loaded, total };
}

/** Redraws the bar on its own line, only when the percent changes. */
function drawBar(out: NodeJS.WriteStream): void {
  const { loaded, total } = totals();
  const percent = total === 0 ? 0 : Math.floor((loaded / total) * 100);
  if (percent === shownPercent) return;
  shownPercent = percent;
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(BAR_WIDTH - filled);
  out.write(
    `\r\x1b[2Kdownloading the AI models (first run only)  ▕${bar}▏ ${String(percent).padStart(3)}%  ${Math.round(loaded / MB)} / ${Math.round(total / MB)} MB`,
  );
}
