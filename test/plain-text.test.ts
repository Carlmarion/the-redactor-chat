import { describe, expect, it } from "vitest";
import { hasReadableText, toPlainText } from "../src/ingest/plain-text.ts";

describe("toPlainText", () => {
  it("keeps an image's alt text and drops its file name", () => {
    expect(toPlainText("Ladder:\n![on-call, then lead, then CTO](ladder.png)")).toBe("Ladder:\non-call, then lead, then CTO");
  });

  it("drops images without alt text", () => {
    expect(toPlainText("![](scan-page-1.png)")).toBe("");
  });
});

describe("hasReadableText", () => {
  it("rejects empty or near-empty text, such as a scan with a short caption", () => {
    expect(hasReadableText("")).toBe(false);
    expect(hasReadableText("Signed lease")).toBe(false);
  });

  it("accepts a real sentence, in any script", () => {
    expect(hasReadableText("Het kantoor sluit om zes uur.")).toBe(true);
  });
});
