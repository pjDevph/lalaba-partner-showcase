// src/screens/settings/hoursMapping.ts
// The one place the two operating-hours shapes are converted.
//
// FE:  { isOpen, is24Hours, openTime, closeTime }   — one range per day, which
//                                                     is what the editor draws
// BE:  { isOpen, is24Hours, timeSlots: [{open, close}] }
//
// These conversions used to live in two places — `beToFeHours` private to
// app/(tabs)/settings.tsx and the FE→BE direction inline in HoursScreen's save
// handler — which was survivable while only merchants had hours. Washers now
// edit their own too, so a third copy was the alternative to this file.
//
// Multi-slot days (a BE day with a split shift) collapse to the first slot:
// the editor is single-range by design, and silently showing only part of a
// split shift is better than crashing on it. Nothing in the apps writes a
// second slot.
//
// NOTE — `beToFeHours` here is the WASHER's reader. app/(tabs)/settings.tsx
// keeps its own for merchants, which defaults a missing day to open (except
// Sunday) and closes at 18:00. Those fallbacks only fire on branches whose
// stored hours are incomplete, and quietly changing what such a branch shows
// is not worth the deduplication. `feToBeHours` and `sameHours` ARE shared —
// they have no such divergence.

import { DAYS, type Day, type OperatingHours } from "./shared";

/** Shape of one BE day. Mirrors the branch/washer OperatingHours sub-document. */
export interface BeDaySchedule {
  isOpen: boolean;
  is24Hours: boolean;
  timeSlots: { open: string; close: string }[];
}
/**
 * Keyed by lowercase day name. Declared with the seven keys present rather than
 * as an open Record so it satisfies the generated GraphQL input types, which
 * require every day.
 */
export interface BeOperatingHours {
  monday: BeDaySchedule;
  tuesday: BeDaySchedule;
  wednesday: BeDaySchedule;
  thursday: BeDaySchedule;
  friday: BeDaySchedule;
  saturday: BeDaySchedule;
  sunday: BeDaySchedule;
}

export const DEFAULT_OPEN_TIME = "08:00";
export const DEFAULT_CLOSE_TIME = "20:00";

/** A closed-but-sane day, used wherever the server omitted one. */
const emptyDay = () => ({
  isOpen: false,
  is24Hours: false,
  openTime: DEFAULT_OPEN_TIME,
  closeTime: DEFAULT_CLOSE_TIME,
});

export function beToFeHours(
  be: Partial<BeOperatingHours> | null | undefined,
): OperatingHours {
  const out = {} as OperatingHours;
  for (const day of DAYS) {
    const d = be?.[day.toLowerCase() as keyof BeOperatingHours];
    if (!d) {
      out[day] = emptyDay();
      continue;
    }
    const slot = d.timeSlots?.[0];
    out[day] = {
      isOpen: !!d.isOpen,
      is24Hours: !!d.is24Hours,
      // Keep the defaults rather than blanks when a day is closed or 24h, so
      // toggling it open lands on a usable range instead of "00:00 – 00:00".
      openTime: slot?.open ?? DEFAULT_OPEN_TIME,
      closeTime: slot?.close ?? DEFAULT_CLOSE_TIME,
    };
  }
  return out;
}

export function feToBeHours(fe: OperatingHours): BeOperatingHours {
  const out = {} as BeOperatingHours;
  for (const day of DAYS) {
    const d = fe[day] ?? emptyDay();
    out[day.toLowerCase() as keyof BeOperatingHours] = {
      isOpen: d.isOpen,
      is24Hours: d.is24Hours,
      // A closed or 24-hour day carries no slots: the times are meaningless
      // there, and sending them would let a stale range resurface when the day
      // is reopened.
      timeSlots:
        d.isOpen && !d.is24Hours
          ? [{ open: d.openTime, close: d.closeTime }]
          : [],
    };
  }
  return out;
}

/** True when two weeks would save identically — the editor's dirty check. */
export function sameHours(a: OperatingHours, b: OperatingHours): boolean {
  return DAYS.every((day: Day) => {
    const x = a[day];
    const y = b[day];
    if (!x || !y) return x === y;
    // Times are irrelevant while a day is closed or set to 24 hours.
    if (x.isOpen !== y.isOpen || x.is24Hours !== y.is24Hours) return false;
    if (!x.isOpen || x.is24Hours) return true;
    return x.openTime === y.openTime && x.closeTime === y.closeTime;
  });
}

/**
 * The validation the BE also enforces (WasherService.updateProfile). A reversed
 * window is DROPPED downstream rather than rejected, which would silently close
 * the day, so catching it here gives the actual reason.
 */
export function findInvalidHoursDay(hours: OperatingHours): Day | null {
  for (const day of DAYS) {
    const d = hours[day];
    if (d?.isOpen && !d.is24Hours && d.openTime >= d.closeTime) return day;
  }
  return null;
}
