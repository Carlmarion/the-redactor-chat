import { describe, expect, it } from "vitest";
import { TokenBucket, type Clock } from "../src/simulator/token-bucket.ts";

function fakeClock() {
  let t = 0;
  const slept: number[] = [];
  const clock: Clock = {
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  };
  return { clock, slept, advance: (ms: number) => (t += ms) };
}

describe("TokenBucket", () => {
  it("allows one second of burst without waiting", async () => {
    const { clock, slept } = fakeClock();
    const bucket = new TokenBucket(50, clock);
    for (let i = 0; i < 50; i++) await bucket.take(1);
    expect(slept).toEqual([]);
  });

  it("then waits for the continuous refill", async () => {
    const { clock, slept } = fakeClock();
    const bucket = new TokenBucket(50, clock);
    await bucket.take(50);
    await bucket.take(1);
    expect(slept).toEqual([20]); // 1 / 50 per second = 20 ms
  });

  it("refills over idle time, capped at one second of capacity", async () => {
    const { clock, slept, advance } = fakeClock();
    const bucket = new TokenBucket(50, clock);
    await bucket.take(50);
    advance(10_000);
    await bucket.take(50);
    expect(slept).toEqual([]);
    await bucket.take(1);
    expect(slept).toEqual([20]);
  });

  it("refuses an amount larger than its capacity", async () => {
    const bucket = new TokenBucket(50, fakeClock().clock);
    await expect(bucket.take(51)).rejects.toThrow(/at most 50/);
  });
});
