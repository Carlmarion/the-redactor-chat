import { describe, expect, it } from "vitest";
import { amsterdamIso } from "../src/time.ts";

describe("amsterdamIso", () => {
  it("uses the summer offset", () => {
    expect(amsterdamIso(new Date("2026-10-15T08:12:03.204Z"))).toBe("2026-10-15T10:12:03.204+02:00");
  });

  it("uses the winter offset after the clocks go back", () => {
    expect(amsterdamIso(new Date("2026-11-02T08:00:00.000Z"))).toBe("2026-11-02T09:00:00.000+01:00");
  });

  it("names the same instant it was given", () => {
    const now = new Date();
    expect(Date.parse(amsterdamIso(now))).toBe(now.getTime());
  });
});
