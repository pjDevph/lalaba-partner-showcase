// src/features/washer/readiness.ts
// "Is this washer set up enough to go online?" — as pure predicates.
//
// Two things must both be true before a home washer is visible to customers,
// and they fail for different reasons:
//
//   Services — with an empty catalog there is nothing for a customer to book,
//              so discovery lists nobody.
//   Address  — discovery matches customers to washers by DISTANCE. Without a
//              map pin and a service radius she cannot be matched at all, and
//              the backend refuses to quote for her.
//
// These live here rather than inline because Settings (which row says "Not set
// up yet"), the dashboard (which reminder card to show, and whether the online
// toggle is even offered) and the store editor all have to agree. When they
// disagreed, a washer could see "you're online" on one screen and "customers
// can't find you" on another.
//
// Pure and store-free on purpose: callers pass the profile, so this is directly
// unit-testable and cannot read a stale store.

import type { WasherProfile } from "../../types/washer.types";

/**
 * Note this deliberately does NOT read `offeredServiceTemplateIds`. That is
 * what she has SELECTED; the dashboard's authoritative check is the public
 * provider card's serviceCategories, which is what discovery actually computes.
 * Use this for the Settings row, where the question is "did you fill this in".
 */
export function hasServicesConfigured(
  profile: Pick<WasherProfile, "offeredServiceTemplateIds"> | null,
): boolean {
  return (profile?.offeredServiceTemplateIds?.length ?? 0) > 0;
}

/**
 * Both a pin and a radius are required. A pin with no radius has no catchment,
 * and a radius with no pin has no centre — neither is matchable, so treating
 * either alone as "done" would put her online and invisible.
 */
export function hasAddressConfigured(
  profile: Pick<WasherProfile, "mapLocation" | "serviceRadiusKm"> | null,
): boolean {
  if (!profile) return false;
  const pin = profile.mapLocation;
  const hasPin =
    pin != null &&
    typeof pin.latitude === "number" &&
    typeof pin.longitude === "number";
  const hasRadius =
    typeof profile.serviceRadiusKm === "number" && profile.serviceRadiusKm > 0;
  return hasPin && hasRadius;
}
