// A per-minute limit as the brief defines it: a bucket holding one second of capacity,
// refilling continuously.

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class TokenBucket {
  private available: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    private readonly clock: Clock = systemClock,
  ) {
    this.available = perSecond;
    this.last = clock.now();
  }

  /** Waits until `amount` can be taken, then takes it. */
  async take(amount: number): Promise<void> {
    if (amount > this.perSecond) {
      throw new Error(`Cannot take ${amount}: the bucket holds at most ${this.perSecond}`);
    }
    this.refill();
    if (this.available < amount) {
      await this.clock.sleep(((amount - this.available) / this.perSecond) * 1000);
      this.refill();
    }
    this.available -= amount;
  }

  private refill(): void {
    const now = this.clock.now();
    this.available = Math.min(this.perSecond, this.available + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
  }
}
