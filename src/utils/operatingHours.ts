// src/utils/operatingHours.ts
// Helpers for reasoning about a branch's operating hours at order-creation time.

import type { OperatingHours } from "../stores/merchantStore";

const DAY_KEYS: (keyof OperatingHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

// Minutes until the branch's closing time today (negative if already past
// closing), or null when there's no meaningful closing time to warn about
// (24-hour operation, closed today, or no operating-hours data at all).
export function getMinutesUntilClose(
  operatingHours: OperatingHours | undefined | null,
  now: Date = new Date()
): number | null {
  if (!operatingHours) return null;

  const today = operatingHours[DAY_KEYS[now.getDay()]];
  if (!today || !today.isOpen || today.is24Hours) return null;

  const lastSlot = today.timeSlots[today.timeSlots.length - 1];
  if (!lastSlot?.close) return null;

  const [hours, minutes] = lastSlot.close.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  const closeDate = new Date(now);
  closeDate.setHours(hours, minutes, 0, 0);

  return Math.round((closeDate.getTime() - now.getTime()) / 60000);
}
