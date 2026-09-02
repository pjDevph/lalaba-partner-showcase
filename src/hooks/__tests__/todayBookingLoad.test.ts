import {
  localDateKey,
  summarizeBookingLoad,
} from "../useTodayBookingLoad";

/**
 * The numbers behind "X/Y bookings today". These replaced a hardcoded 3 that
 * silently disagreed with the admin panel and the server, so the point of
 * these tests is that the screen can never again show a ceiling nobody set.
 */

const day = (over: Partial<Parameters<typeof summarizeBookingLoad>[0]> = {}) =>
  ({
    date: "2026-08-24",
    isBookable: true,
    dailyBookingLimit: 5,
    bookedCount: 0,
    remaining: 5,
    ...over,
  }) as NonNullable<Parameters<typeof summarizeBookingLoad>[0]>;

describe("localDateKey", () => {
  it("uses the device's own calendar day, not UTC's", () => {
    // 2am in Manila is still the previous day in UTC. toISOString() would have
    // reported the 23rd here, so the tile spent every morning before 8am
    // showing yesterday's bookings.
    const earlyMorningManila = new Date(2026, 7, 24, 2, 0, 0);
    expect(localDateKey(earlyMorningManila)).toBe("2026-08-24");
  });

  it("zero-pads month and day", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("summarizeBookingLoad", () => {
  it("uses the booking engine's limit when there is no admin cap", () => {
    const s = summarizeBookingLoad(day({ bookedCount: 2 }), null);
    expect(s.cap).toBe(5);
    expect(s.used).toBe(2);
    expect(s.remaining).toBe(3);
    expect(s.pct).toBe(40);
  });

  it("takes the lower of the engine limit and the admin's per-washer cap", () => {
    expect(summarizeBookingLoad(day({ dailyBookingLimit: 5 }), 2).cap).toBe(2);
    expect(summarizeBookingLoad(day({ dailyBookingLimit: 2 }), 5).cap).toBe(2);
  });

  it("falls back to the admin cap when the engine reports no limit", () => {
    expect(summarizeBookingLoad(day({ dailyBookingLimit: null }), 4).cap).toBe(
      4,
    );
  });

  it("reports no ceiling at all when neither exists", () => {
    const s = summarizeBookingLoad(
      day({ dailyBookingLimit: null, bookedCount: 3 }),
      null,
    );
    expect(s.cap).toBeNull();
    expect(s.remaining).toBeNull();
    // No proportion without a denominator — the ring is hidden, not full.
    expect(s.pct).toBe(0);
  });

  it("invents nothing before the server has answered", () => {
    const s = summarizeBookingLoad(null, null);
    expect(s).toEqual({
      used: 0,
      cap: null,
      remaining: null,
      pct: 0,
      loaded: false,
    });
  });

  it("still reports the admin cap while the day is unread", () => {
    // She has a cap; we just don't know today's bookings yet. Reporting 0/2 is
    // honest; reporting no cap would imply she is unlimited.
    expect(summarizeBookingLoad(null, 2).cap).toBe(2);
  });

  it("never goes negative or past 100% when she is over her cap", () => {
    const s = summarizeBookingLoad(
      day({ dailyBookingLimit: 2, bookedCount: 5 }),
      null,
    );
    expect(s.remaining).toBe(0);
    expect(s.pct).toBe(100);
  });

  it("does not divide by a zero cap", () => {
    const s = summarizeBookingLoad(
      day({ dailyBookingLimit: 0, bookedCount: 0 }),
      null,
    );
    expect(s.cap).toBe(0);
    expect(s.remaining).toBe(0);
    expect(s.pct).toBe(0);
  });
});
