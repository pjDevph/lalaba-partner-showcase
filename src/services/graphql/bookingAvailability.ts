// src/services/graphql/bookingAvailability.ts
// Booking availability — when this provider accepts bookings, and how many.
//
// Deliberately NOT the same thing as store hours (Settings → Hours), which say
// when the shop is open. A provider can be open 8 AM–10 PM and still take
// bookings only 8 AM–6 PM, capped at 20 orders a day.
//
// OWNERSHIP, in three layers:
//   1. Lalaba's platform Booking Policy — universal defaults, milestone tiers
//      and any running campaign. Read here as `entitlement`, never stored on
//      this provider: that is what lets a platform-wide promo change every
//      partner's limit by editing ONE record.
//   2. What this partner has UNLOCKED — her milestone, earned automatically
//      from completed orders / rating / cancellations. Never assigned by hand.
//   3. What she personally wants to take — the only thing this app writes, and
//      only ever downward: effective capacity is min(entitlement, her choice).

import { graphqlRequest } from "../../config/graphql";

export type DayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const WEEK_ORDER: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export interface BookingWindow {
  start: string; // 'HH:MM'
  end: string;
}

export interface DayFulfillment {
  /** Inbound: provider/courier collects from the customer. */
  providerPickup: boolean;
  /** Outbound: provider/courier returns to the customer. */
  providerDelivery: boolean;
  customerDropoff: boolean;
  customerPickup: boolean;
}

export interface DayBookingConfig {
  isAcceptingBookings: boolean;
  windows: BookingWindow[];
  /** null = inherit the provider-level value, which inherits the entitlement. */
  dailyBookingLimit: number | null;
  fulfillment: DayFulfillment;
}

export interface BookingRulesSummary {
  scheduleLines: string[];
  ruleLines: string[];
  stateLabel: string;
  isAcceptingBookings: boolean;
}

/** What this provider charges per fulfillment leg, plus their speed offer. */
export interface FulfillmentPricing {
  providerPickup: LegPricing;
  providerDelivery: LegPricing;
  express: { enabled: boolean; feeCentavos: number; slaHours: number };
}

export interface LegPricing {
  /** 0 IS free — there is no separate flag to keep in sync with an amount. */
  feeCentavos: number;
  /** Paid scheduled window; null means "same as the base fee". */
  premiumWindowFeeCentavos: number | null;
}

export interface BookingAvailabilityConfig {
  _id: string;
  branchId: string;
  /** A REQUEST — the platform clamps it to its own per-leg ceiling at order time. */
  fulfillmentPricing: FulfillmentPricing;
  acceptScheduledBookings: boolean;
  bookingsPaused: boolean;
  pauseReason: string | null;
  weekly: Record<DayKey, DayBookingConfig>;
  /** What she ASKED for. Null means "give me my full entitlement". */
  dailyBookingLimit: number | null;
  summary: BookingRulesSummary;
}

/** What Lalaba currently allows — computed, never stored on this provider. */
export interface EffectiveEntitlement {
  /** Null = no platform cap (laundromats manage their own throughput). */
  dailyCapacity: number | null;
  advanceBookingDays: number;
  leadTimeMinutes: number;
  sameDayBookingEnabled: boolean;
  sameDayCutoffTime: string;
  bookingsEnabled: boolean;
  milestoneKey: string | null;
  milestoneName: string | null;
  appliedCampaignNames: string[];
  cappedBySafetyLimit: boolean;
}

/** Progress toward the next tier, for the "what's next" panel. */
export interface MilestoneProgress {
  currentName: string | null;
  currentDailyCapacity: number | null;
  completedOrders: number;
  rating: number | null;
  nextName: string | null;
  nextDailyCapacity: number | null;
  nextAdvanceBookingDays: number | null;
  ordersRequired: number | null;
  ordersRemaining: number | null;
  unmetRequirements: string[];
}

export interface UpcomingSpecialDate {
  date: string;
  label: string | null;
  isClosed: boolean;
  kind: string;
  detail: string;
  source: string;
  recordId: string | null;
}

const CONFIG_FIELDS = `
  _id
  branchId
  fulfillmentPricing {
    providerPickup { feeCentavos premiumWindowFeeCentavos }
    providerDelivery { feeCentavos premiumWindowFeeCentavos }
    express { enabled feeCentavos slaHours }
  }
  acceptScheduledBookings
  bookingsPaused
  pauseReason
  dailyBookingLimit
  summary { ruleLines stateLabel isAcceptingBookings }
`;
// Deliberately NOT selected any more:
//   weekly — the washer screen no longer renders a
//     read-only weekly schedule or a per-slot control, and her real hours come
//     from her profile (operatingHours), not from here.
//   summary.scheduleLines — nothing renders it.

/**
 * `branchId` is only meaningful for a multi-branch merchant — a single-branch
 * merchant and a washer both have exactly one answer, and the server resolves
 * it on its own when omitted.
 */
export async function gqlMyBookingAvailability(
  branchId?: string,
): Promise<BookingAvailabilityConfig> {
  const data = await graphqlRequest<{
    myBookingAvailability: BookingAvailabilityConfig;
  }>(
    `query MyBookingAvailability($branchId: ID) {
       myBookingAvailability(branchId: $branchId) { ${CONFIG_FIELDS} }
     }`,
    { branchId }
  );
  return data.myBookingAvailability;
}

/**
 * ONE DAY'S RESOLVED BOOKING LOAD.
 *
 * The engine's own answer for a date, which is the only number that matches
 * what a customer is actually allowed to book. `dailyBookingLimit` is the
 * result of the whole chain — a date override, then the weekday row, then her
 * provider-level choice, then her platform entitlement — capped by the
 * entitlement at every step. Reading the entitlement alone would overstate the
 * ceiling for a washer who has set herself a lower one.
 *
 * Null limit means unlimited (see the BE model's note: Infinity stays internal,
 * the boundary says null).
 */
export type BookingDayLoad = {
  date: string;
  isBookable: boolean;
  dailyBookingLimit: number | null;
  bookedCount: number;
  remaining: number | null;
};

export async function gqlProviderBookingDay(
  branchId: string,
  providerType: "WASHER" | "MERCHANT",
  date: string
): Promise<BookingDayLoad> {
  const data = await graphqlRequest<{ providerBookingDay: BookingDayLoad }>(
    `query ProviderBookingDay($branchId: ID!, $providerType: ProviderType!, $date: String!) {
       providerBookingDay(branchId: $branchId, providerType: $providerType, date: $date) {
         date isBookable dailyBookingLimit bookedCount remaining
       }
     }`,
    { branchId, providerType, date }
  );
  return data.providerBookingDay;
}

export async function gqlMyBookingEntitlement(): Promise<EffectiveEntitlement> {
  const data = await graphqlRequest<{
    myBookingEntitlement: EffectiveEntitlement;
  }>(
    `query MyBookingEntitlement {
       myBookingEntitlement {
         dailyCapacity advanceBookingDays
         leadTimeMinutes
         sameDayBookingEnabled sameDayCutoffTime bookingsEnabled
         milestoneKey milestoneName appliedCampaignNames cappedBySafetyLimit
       }
     }`
  );
  return data.myBookingEntitlement;
}

/** The platform ceiling on a home washer's own service radius, in km. */
export async function gqlMaxServiceRadiusKm(): Promise<number> {
  const data = await graphqlRequest<{ maxServiceRadiusKm: number }>(
    `query MaxServiceRadiusKm { maxServiceRadiusKm }`
  );
  return data.maxServiceRadiusKm;
}

export async function gqlMyMilestoneProgress(): Promise<MilestoneProgress | null> {
  const data = await graphqlRequest<{
    myMilestoneProgress: MilestoneProgress | null;
  }>(
    `query MyMilestoneProgress {
       myMilestoneProgress {
         currentName currentDailyCapacity
         completedOrders rating
         nextName nextDailyCapacity nextAdvanceBookingDays
         ordersRequired ordersRemaining unmetRequirements
       }
     }`
  );
  return data.myMilestoneProgress;
}

export async function gqlMyBookingSpecialDates(): Promise<UpcomingSpecialDate[]> {
  const data = await graphqlRequest<{
    myBookingSpecialDates: UpcomingSpecialDate[];
  }>(
    `query MyBookingSpecialDates {
       myBookingSpecialDates { date label isClosed kind detail source recordId }
     }`
  );
  return data.myBookingSpecialDates;
}

export interface UpdateMyBookingCapacityInput {
  bookingsPaused?: boolean;
  pauseReason?: string | null;
}

/**
 * The pause switch — all this mutation still writes.
 *
 * It used to carry dailyBookingLimit / maxBookingsPerSlot as well. Capacity is
 * now one platform number resolved on every read, so there is nothing for a
 * provider to submit and nothing for the backend to clamp. Her SCHEDULE moved
 * the other way and became hers: she edits operating hours on her own profile
 * (gqlUpdateWasherProfile), which is what the booking engine reads.
 */
export async function gqlUpdateMyBookingCapacity(
  input: UpdateMyBookingCapacityInput,
  branchId?: string,
): Promise<BookingAvailabilityConfig> {
  const data = await graphqlRequest<{
    updateMyBookingCapacity: BookingAvailabilityConfig;
  }>(
    `mutation UpdateMyBookingCapacity($input: UpdateMyBookingCapacityInput!, $branchId: ID) {
       updateMyBookingCapacity(input: $input, branchId: $branchId) { ${CONFIG_FIELDS} }
     }`,
    { input, branchId }
  );
  return data.updateMyBookingCapacity;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** 'HH:MM' → '8:00 AM'. Mirrors the server's own formatting. */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** A day's hours as one line, or "No bookings" when it is closed. */
export function describeDayHours(day: DayBookingConfig): string {
  if (!day.isAcceptingBookings) return "No bookings";
  if (day.windows.length === 0) return "No hours set";
  return day.windows
    .map((w) => `${formatTime12(w.start)} – ${formatTime12(w.end)}`)
    .join(", ");
}

/**
 * "20 bookings per day" — the compact card's second line.
 *
 * Capacity resolves the same way the server does: what she asked for, capped by
 * what she is entitled to, falling back to the full entitlement when she has
 * asked for nothing. The interval is always the platform's.
 */
export function describeDayCapacity(
  day: DayBookingConfig,
  config: BookingAvailabilityConfig,
  entitlement: EffectiveEntitlement
): string {
  if (!day.isAcceptingBookings) return "";
  const requested = day.dailyBookingLimit ?? config.dailyBookingLimit;
  const limit =
    entitlement.dailyCapacity == null
      ? requested
      : Math.min(requested ?? entitlement.dailyCapacity, entitlement.dailyCapacity);
  const shown = limit == null ? "No limit on" : `${limit}`;
  return `${shown} bookings per day`;
}

/**
 * Set this provider's per-leg fees and express offer.
 *
 * Sends only what changed — a partial save, like updateMyBookingCapacity. The
 * amounts are requests: the server clamps them to the platform's per-leg
 * ceiling when an order is priced, so saving an over-ceiling number is allowed
 * and simply prices at the ceiling.
 */
export interface UpdateFulfillmentPricingInput {
  providerPickup?: { feeCentavos?: number; premiumWindowFeeCentavos?: number | null };
  providerDelivery?: { feeCentavos?: number; premiumWindowFeeCentavos?: number | null };
  express?: { enabled?: boolean; feeCentavos?: number; slaHours?: number };
}

export async function updateMyFulfillmentPricing(
  input: UpdateFulfillmentPricingInput,
  branchId?: string,
): Promise<BookingAvailabilityConfig> {
  const data = await graphqlRequest<{
    updateMyFulfillmentPricing: BookingAvailabilityConfig;
  }>(
    `mutation UpdateMyFulfillmentPricing($input: UpdateFulfillmentPricingInput!, $branchId: ID) {
       updateMyFulfillmentPricing(input: $input, branchId: $branchId) { ${CONFIG_FIELDS} }
     }`,
    { input, branchId },
  );
  return data.updateMyFulfillmentPricing;
}
