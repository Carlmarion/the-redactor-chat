// The first-run download report: one bar redrawn in place in a terminal, two lines in a log.
import { describe, expect, it } from "vitest";
import { barLine, startDownload } from "../src/simulator/model-download.ts";

function fakeOut(isTTY: boolean) {
  const writes: string[] = [];
  return { writes, out: { isTTY, write: (s: string) => writes.push(s) } as unknown as NodeJS.WriteStream };
}

const total = (loaded: number) => ({
  status: "progress_total" as const,
  name: "m",
  progress: 0,
  loaded,
  total: 200_000_000,
  files: { "model.onnx": { loaded, total: 200_000_000 } },
});

describe("startDownload", () => {
  it("says nothing for a model already on disk", () => {
    const { writes, out } = fakeOut(true);
    const download = startDownload("", out); // the cache directory itself exists
    expect(download.options).toEqual({});
    download.finish();
    expect(writes).toEqual([]);
  });

  it("redraws one bar in place in a terminal, only when the percent changes, and ends the line", () => {
    const { writes, out } = fakeOut(true);
    const download = startDownload("nobody/not-downloaded-yet", out);
    for (const loaded of [0, 100_000_000, 100_000_001, 200_000_000]) download.options.progress_callback?.(total(loaded));
    download.finish();
    expect(writes).toHaveLength(4);
    expect(writes.slice(0, 3).every((w) => w.startsWith("\r"))).toBe(true);
    expect(writes[1]).toContain(" 50%  100 / 200 MB");
    expect(writes[2]).toContain("100%");
    expect(writes[3]).toBe("\n");
  });

  it("writes a start and an end line when not in a terminal", () => {
    const { writes, out } = fakeOut(false);
    const download = startDownload("nobody/not-downloaded-yet", out);
    download.options.progress_callback?.(total(200_000_000));
    download.finish();
    expect(writes).toEqual(["downloading the AI models (first run only)…\n", "models downloaded (200 MB)\n"]);
  });

  it("never draws a line wider than the window, so it never wraps and stacks", () => {
    for (const columns of [30, 50, 64, 80, 200]) {
      expect(barLine(51, 212_000_000, 415_000_000, columns).length, `${columns} columns`).toBeLessThan(columns);
    }
    expect(barLine(51, 212_000_000, 415_000_000, 200)).toContain("▕████████████░░░░░░░░░░░░▏");
    expect(barLine(51, 212_000_000, 415_000_000, 50)).toBe("downloading the AI models  51%  212 / 415 MB");
  });
});
