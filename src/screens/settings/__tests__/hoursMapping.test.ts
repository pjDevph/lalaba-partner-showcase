import {
  beToFeHours,
  feToBeHours,
  findInvalidHoursDay,
  sameHours,
  type BeOperatingHours,
} from "../hoursMapping";
import { DAYS } from "../shared";

const beDay = (open: string, close: string) => ({
  isOpen: true,
  is24Hours: false,
  timeSlots: [{ open, close }],
});

const beWeek = (day: unknown): BeOperatingHours =>
  Object.fromEntries(
    DAYS.map((d) => [d.toLowerCase(), day]),
  ) as unknown as BeOperatingHours;

describe("hoursMapping", () => {
  it("round-trips a normal week", () => {
    const be = beWeek(beDay("09:00", "17:00"));
    expect(feToBeHours(beToFeHours(be))).toEqual(be);
  });

  it("round-trips a 24-hour day, dropping its meaningless slots", () => {
    const be = beWeek({ isOpen: true, is24Hours: true, timeSlots: [] });
    const fe = beToFeHours(be);
    expect(fe.Monday.is24Hours).toBe(true);
    expect(feToBeHours(fe).monday.timeSlots).toEqual([]);
  });

  it("round-trips a closed day", () => {
    const be = beWeek({ isOpen: false, is24Hours: false, timeSlots: [] });
    const fe = beToFeHours(be);
    expect(fe.Monday.isOpen).toBe(false);
    expect(feToBeHours(fe).monday).toEqual({
      isOpen: false,
      is24Hours: false,
      timeSlots: [],
    });
  });

  it("gives a closed day usable default times to reopen into", () => {
    // Otherwise toggling a closed day open lands on "00:00 – 00:00", which the
    // BE then rejects as a zero-length window.
    const fe = beToFeHours(beWeek({ isOpen: false, is24Hours: false, timeSlots: [] }));
    expect(fe.Monday.openTime).toBe("08:00");
    expect(fe.Monday.closeTime).toBe("20:00");
  });

  it("survives missing days from the server", () => {
    const fe = beToFeHours({} as BeOperatingHours);
    expect(DAYS.every((d) => fe[d] !== undefined)).toBe(true);
    expect(fe.Monday.isOpen).toBe(false);
  });

  it("collapses a split shift to its first slot", () => {
    const be = beWeek({
      isOpen: true,
      is24Hours: false,
      timeSlots: [
        { open: "08:00", close: "12:00" },
        { open: "14:00", close: "18:00" },
      ],
    });
    expect(beToFeHours(be).Monday).toMatchObject({
      openTime: "08:00",
      closeTime: "12:00",
    });
  });

  describe("sameHours", () => {
    it("ignores times while a day is closed", () => {
      const a = beToFeHours(beWeek({ isOpen: false, is24Hours: false, timeSlots: [] }));
      const b = { ...a, Monday: { ...a.Monday, openTime: "03:00" } };
      expect(sameHours(a, b)).toBe(true);
    });

    it("notices a real change", () => {
      const a = beToFeHours(beWeek(beDay("09:00", "17:00")));
      const b = { ...a, Monday: { ...a.Monday, closeTime: "18:00" } };
      expect(sameHours(a, b)).toBe(false);
    });
  });

  describe("findInvalidHoursDay", () => {
    it("names a reversed window", () => {
      const fe = beToFeHours(beWeek(beDay("09:00", "17:00")));
      fe.Tuesday = { ...fe.Tuesday, openTime: "18:00", closeTime: "08:00" };
      expect(findInvalidHoursDay(fe)).toBe("Tuesday");
    });

    it("names a zero-length window", () => {
      const fe = beToFeHours(beWeek(beDay("09:00", "17:00")));
      fe.Monday = { ...fe.Monday, openTime: "09:00", closeTime: "09:00" };
      expect(findInvalidHoursDay(fe)).toBe("Monday");
    });

    it("permits a 24-hour day, whose times are meaningless", () => {
      const fe = beToFeHours(beWeek({ isOpen: true, is24Hours: true, timeSlots: [] }));
      expect(findInvalidHoursDay(fe)).toBeNull();
    });

    it("permits a valid week", () => {
      expect(findInvalidHoursDay(beToFeHours(beWeek(beDay("09:00", "17:00"))))).toBeNull();
    });
  });
});
