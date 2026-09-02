// src/hooks/useTodayBookingLoad.ts
// "X of Y bookings today", from the two places that actually decide it.
//
// The washer Home and Orders screens used to answer this themselves, from
// `washerProfile.maxOrdersPerDay` alone — falling back to a hardcoded 3 when
// no per-washer cap was set. That constant was picked when the platform
// booking policy was also seeded at 3; the moment an admin changed the policy
// the app kept saying 3, and it contradicted both the admin panel and the
// server that turns customers away.
//
// There are genuinely TWO ceilings on a washer's day, enforced in different
// places, and she is subject to the lower of them:
//
//   • `providerBookingDay().dailyBookingLimit` — the booking engine's number,
//     resolved per date from her entitlement, her own chosen limit and any
//     date override, and enforced when a customer picks a slot.
//   • `washerProfile.maxOrdersPerDay` — an admin's per-washer cap, a separate
//     field enforced separately in online-orders. Null means she has none.
//
// Reading only one of them is how a screen ends up disagreeing with the
// server. This reads both and reports the binding one.

import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

import {
  gqlProviderBookingDay,
  type BookingDayLoad,
} from "../services/graphql/bookingAvailability";

/**
 * Today as the backend keys days: a plain `YYYY-MM-DD` Manila date.
 *
 * Built from the device's local parts rather than `toISOString()`, which
 * converts to UTC first — for a Manila device that is the PREVIOUS day for
 * everything before 8am, so the tile would have spent every morning reporting
 * yesterday's bookings.
 */
export function localDateKey(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type TodayBookingLoad = {
  /** Bookings already taken for today. */
  used: number;
  /** The binding ceiling, or null when nothing caps her. */
  cap: number | null;
  /** Slots left, or null when uncapped. Never negative. */
  remaining: number | null;
  /** 0–100 for the progress ring. 0 when uncapped — there is no proportion. */
  pct: number;
  /** True once the server has answered; the ring waits rather than guessing. */
  loaded: boolean;
};

export function useTodayBookingLoad(
  branchId: string | null,
  providerType: "WASHER" | "MERCHANT",
  /** Her admin-set per-washer cap, or null when she has none. */
  adminCap: number | null,
): TodayBookingLoad {
  const [day, setDay] = useState<BookingDayLoad | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!branchId) return;
      let cancelled = false;
      void gqlProviderBookingDay(branchId, providerType, localDateKey())
        .then((d) => {
          if (!cancelled) setDay(d);
        })
        .catch(() => {
          // A count on a dashboard is never worth an error in front of
          // someone. Without an answer the tile shows the count with no
          // ceiling, which is true, rather than a number that might not be.
        });
      return () => {
        cancelled = true;
      };
    }, [branchId, providerType]),
  );

  return summarizeBookingLoad(day, adminCap);
}

/**
 * The arithmetic, separated from the fetching so it can be tested.
 *
 * Both ceilings are optional and independent; she is subject to the LOWER of
 * whichever exist, and to none when neither does.
 */
export function summarizeBookingLoad(
  day: BookingDayLoad | null,
  adminCap: number | null,
): TodayBookingLoad {
  const used = day?.bookedCount ?? 0;
  const caps = [day?.dailyBookingLimit ?? null, adminCap].filter(
    (c): c is number => c != null,
  );
  const cap = caps.length > 0 ? Math.min(...caps) : null;
  const remaining = cap == null ? null : Math.max(0, cap - used);

  return {
    used,
    cap,
    remaining,
    pct: cap == null || cap <= 0 ? 0 : Math.min(100, (used / cap) * 100),
    loaded: day != null,
  };
}
