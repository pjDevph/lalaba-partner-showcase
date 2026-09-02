// src/services/graphql/washer.ts
// GraphQL operations for the washer domain (live backend).

import { graphqlRequest } from "../../config/graphql";
import type {
  WasherProfile,
  WasherAddress,
  WasherServiceTemplate,
  WasherServiceOffering,
  SetWasherServiceOfferingInput,
  WasherDashboardStats,
} from "../../types/washer.types";

// ─── Field fragments ───────────────────────────────────────────────────────────

// Aligned with the Phase 2 BE WasherProfile type (see LALABA_BE_DEV
// schema.gql): store* fields became logoUrl/coverPhotoUrl/description,
// barangay/city folded into address{}, and the old per-washer `services` array
// became offeredServiceTemplateIds (which platform services she offers) plus
// washer_service_offerings (what she charges for each).
// NOTE: slotsUsedToday is deliberately absent. The pickup-DAY refactor (BE
// 71ef3bc) moved it off WasherProfile onto WasherStats, but this selection was
// never updated — so this query failed GRAPHQL_VALIDATION_FAILED ever since,
// and the app silently ran on the persisted profile of whichever account
// signed in last. washerStore merges the real value back in from stats.
const WASHER_PROFILE_FIELDS = `
  _id uid branchId displayName phone photoUrl bio
  machineType machineCapacityKg machineBrand
  address { streetAddress barangayName cityMunicipalityName provinceName regionName unit zipCode }
  operatingHours {
    monday    { isOpen is24Hours timeSlots { open close } }
    tuesday   { isOpen is24Hours timeSlots { open close } }
    wednesday { isOpen is24Hours timeSlots { open close } }
    thursday  { isOpen is24Hours timeSlots { open close } }
    friday    { isOpen is24Hours timeSlots { open close } }
    saturday  { isOpen is24Hours timeSlots { open close } }
    sunday    { isOpen is24Hours timeSlots { open close } }
  }
  mapLocation { latitude longitude }
  serviceRadiusKm
  offeredServiceTemplateIds
  storeName logoUrl coverPhotoUrl description featuredPhotos
  status verificationStatus isAvailable maxOrdersPerDay
  createdAt updatedAt
`;



// ─── Helpers — map BE _id to FE-expected id fields ────────────────────────────

/**
 * The BE wire shape for a washer profile. It differs from the FE WasherProfile
 * in three ways this mapper reconciles: Mongo `_id`/`uid` instead of
 * `washerId`/`userId`, Phase-2 field renames (`coverPhotoUrl`, `featuredPhotos`,
 * `description`), and structured `address` that the legacy `barangay`/`city`
 * strings are derived from. Everything else passes through unchanged.
 */
type RawWasherProfile = Omit<
  WasherProfile,
  // aliased from BE names
  | "washerId"
  | "userId"
  | "barangay"
  | "city"
  // defaulted by the mapper, so genuinely optional on the wire
  | "branchId"
  | "address"
  | "mapLocation"
  | "offeredServiceTemplateIds"
  | "slotsUsedToday"
  | "services"
  | "pricePerKg"
  | "platformFeePercent"
  | "storeName"
  | "storeHeaderUrl"
  | "storeFeaturedPhotos"
  | "logoUrl"
  | "storeDescription"
> & {
  _id: string;
  uid: string;
  branchId?: string | null;
  address?: WasherProfile["address"] | null;
  mapLocation?: WasherProfile["mapLocation"] | null;
  offeredServiceTemplateIds?: string[] | null;
  slotsUsedToday?: number | null;
  services?: WasherProfile["services"] | null;
  pricePerKg?: number | null;
  platformFeePercent?: number | null;
  storeName?: string | null;
  coverPhotoUrl?: string | null;
  featuredPhotos?: string[] | null;
  logoUrl?: string | null;
  description?: string | null;
};

function mapProfile(raw: RawWasherProfile): WasherProfile {
  return {
    ...raw,
    washerId: raw._id,
    userId: raw.uid,
    branchId: raw.branchId ?? null,
    // Phase 2 structured location, kept whole so a profile edit round-trips
    // losslessly — the barangay/city shims below are lossy by design.
    address: raw.address ?? null,
    mapLocation: raw.mapLocation ?? null,
    offeredServiceTemplateIds: raw.offeredServiceTemplateIds ?? [],
    // Lives on WasherStats now, not on the profile — default it so the shape
    // stays stable until refreshStats merges the real number in.
    slotsUsedToday: raw.slotsUsedToday ?? 0,
    // Back-compat shims: keep the FE WasherProfile shape stable while the BE
    // Phase 2 type renamed/moved these fields.
    barangay: raw.address?.barangayName ?? "",
    city: raw.address?.cityMunicipalityName ?? "",
    services: raw.services ?? [],
    pricePerKg: raw.pricePerKg ?? 0,
    platformFeePercent: raw.platformFeePercent ?? 10,
    // Not aliased — `storeName` is the BE's own field name, unlike the three
    // store fields below it.
    storeName: raw.storeName ?? null,
    storeHeaderUrl: raw.coverPhotoUrl ?? null,
    storeFeaturedPhotos: raw.featuredPhotos ?? [],
    logoUrl: raw.logoUrl ?? null,
    storeDescription: raw.description ?? null,
  };
}


// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchWasherProfile(): Promise<WasherProfile> {
  const data = await graphqlRequest<{ washerProfile: RawWasherProfile }>(
    `query WasherProfile { washerProfile { ${WASHER_PROFILE_FIELDS} } }`
  );
  return mapProfile(data.washerProfile);
}

export async function gqlToggleWasherAvailability(): Promise<WasherProfile> {
  const data = await graphqlRequest<{ toggleWasherAvailability: RawWasherProfile }>(
    `mutation ToggleWasherAvailability {
       toggleWasherAvailability { ${WASHER_PROFILE_FIELDS} }
     }`
  );
  return mapProfile(data.toggleWasherAvailability);
}

// Keys the FE WasherProfile carries that `UpdateWasherProfileInput` does NOT
// accept. GraphQL rejects an input object with unknown fields outright, so
// leaving any of these in made the ENTIRE save fail — which is why editing the
// store or the profile silently did nothing.
//
//  storeFeaturedPhotos — REMOVED from this list: the BE now has a real
//    `featuredPhotos` field, so the gallery is aliased through rather than
//    stripped. Before that it uploaded to object storage and vanished.
//  services / pricePerKg / platformFeePercent — per-washer pricing was replaced
//    by the platform catalog: the BE stores `offeredServiceTemplateIds`, ids of
//    admin-defined service templates the washer opts into. A locally-invented
//    service object has nowhere to go.
//  barangay / city — folded into `address`, whose input requires the full set
//    (region, province, city, barangay, street). Sending the two fields the UI
//    collects would fail validation, so address is left untouched here.
const UNSUPPORTED_UPDATE_KEYS = [
  "services",
  "pricePerKg",
  "platformFeePercent",
  "barangay",
  "city",
  "status",
  "verificationStatus",
  "slotsUsedToday",
  "maxOrdersPerDay",
  "isAvailable",
  "branchId",
  "_id",
  "uid",
] as const;

// FE shim name → real input field (see mapProfile for the read direction).
const UPDATE_KEY_ALIASES: Record<string, string> = {
  storeHeaderUrl: "coverPhotoUrl",
  storeDescription: "description",
  storeFeaturedPhotos: "featuredPhotos",
};

export async function gqlUpdateWasherProfile(
  fields: Partial<WasherProfile>
): Promise<WasherProfile> {
  const { washerId: _w, userId: _u, createdAt: _c, updatedAt: _up, ...rest } = fields as any;
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if ((UNSUPPORTED_UPDATE_KEYS as readonly string[]).includes(key)) continue;
    input[UPDATE_KEY_ALIASES[key] ?? key] = value;
  }
  // Re-shape the two structured fields to their exact input types. The loop
  // above forwards the FE object verbatim, including any extra keys the address
  // picker attached, and WasherAddressInput rejects unknown keys outright —
  // which would fail the whole save. This is what lets a full PSGC address edit
  // round-trip (wave 2C).
  if (input.address) {
    input.address = serializeAddress(input.address as WasherAddress);
  }
  if (input.mapLocation) {
    const loc = input.mapLocation as { latitude: number; longitude: number };
    input.mapLocation = { latitude: loc.latitude, longitude: loc.longitude };
  }
  const data = await graphqlRequest<{ updateWasherProfile: RawWasherProfile }>(
    `mutation UpdateWasherProfile($input: UpdateWasherProfileInput!) {
       updateWasherProfile(input: $input) { ${WASHER_PROFILE_FIELDS} }
     }`,
    { input }
  );
  return mapProfile(data.updateWasherProfile);
}

export async function fetchWasherStats(): Promise<WasherDashboardStats> {
  const data = await graphqlRequest<{ washerStats: WasherDashboardStats }>(
    `query WasherStats {
       washerStats {
         slotsUsedToday activeOrders
         completedOrders completedOrdersToday
         totalKg totalLoads
         avgRating totalReviews
       }
     }`
  );
  return data.washerStats;
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
// REMOVED (F11): fetchTodayBookings / fetchBookingHistory / gqlUpdateBookingStatus
// called `todayBookings`, `bookingHistory` and `updateBookingStatus`, none of
// which exist in the backend SDL — this was the legacy washer-booking model,
// superseded by the bookingAvailability / bookingPolicy surface. The only
// consumer was src/stores/washerBookingStore.ts, which had no importers at all,
// so nothing failed at runtime; it would have thrown the moment anyone wired it
// to a screen. The store is deleted with them.

// Earnings / withdrawals are gone. `washerEarnings` and `requestWithdrawal` no
// longer exist in the schema — the washer_earnings collection was removed with
// GAP-P0-011 because customers pay the washer DIRECTLY and Lalaba never holds
// the funds, so there is nothing to release or withdraw. The screen and store
// that called these were unreachable and would have errored if reached.

// ─── Public marketplace card (what customers see) ──────────────────────────────

// The washer's OWN discovery card, built by the BE with the exact same builder
// used for customer discovery — so the dashboard "this is what customers see"
// preview can never drift from the real thing.
export interface MyProviderCard {
  providerType: string;
  name: string;
  initials: string;
  areaLabel: string | null;
  statusText: string;
  ratingAverage: number;
  ratingCount: number;
  serviceCategories: string[];
  coverPhotoUrl: string | null;
  logoUrl: string | null;
  priceFromCentavos: number | null;
  isVerified: boolean;
}

export async function gqlMyProviderCard(): Promise<MyProviderCard | null> {
  const data = await graphqlRequest<{ myProviderCard: MyProviderCard | null }>(
    `query MyProviderCard {
       myProviderCard {
         providerType name initials areaLabel statusText
         ratingAverage ratingCount serviceCategories
         coverPhotoUrl logoUrl priceFromCentavos isVerified
       }
     }`
  );
  return data.myProviderCard;
}


// ─── Phase 2 additions (waves 2B-2 / 2C / 2D) ─────────────────────────────────

/** WasherAddressInput allows exactly these keys (5 required + 2 optional). */
function serializeAddress(a: WasherAddress): Record<string, unknown> {
  const out: Record<string, unknown> = {
    streetAddress: a.streetAddress,
    barangayName: a.barangayName,
    cityMunicipalityName: a.cityMunicipalityName,
    provinceName: a.provinceName,
    regionName: a.regionName,
  };
  if (a.unit != null && String(a.unit).trim() !== "") out.unit = a.unit;
  if (a.zipCode != null && String(a.zipCode).trim() !== "") out.zipCode = a.zipCode;
  return out;
}

// The platform catalog. Lalaba controls WHICH services exist and HOW they may
// be charged (allowedPricingModels + guardrails); the washer sets the amount
// per service via the offerings below. A PLATFORM_FIXED service keeps the old
// behaviour — the washer only opts in.
const SERVICE_TEMPLATE_FIELDS = `
  _id name description
  pricingControl allowedPricingModels minPriceCentavos maxPriceCentavos
  platformPricingModel
  basePriceCentavos baseWeightKg excessRatePerKgCentavos
  platformLoadCapacityKg platformUnit platformMinBillableKg isActive
`;

export async function gqlAvailableWasherServiceTemplates(): Promise<WasherServiceTemplate[]> {
  const data = await graphqlRequest<{ availableWasherServiceTemplates: WasherServiceTemplate[] }>(
    `query AvailableWasherServiceTemplates {
       availableWasherServiceTemplates { ${SERVICE_TEMPLATE_FIELDS} }
     }`
  );
  return data.availableWasherServiceTemplates;
}

// ─── Per-washer pricing ───────────────────────────────────────────────────────

const SERVICE_OFFERING_FIELDS = `
  _id branchId serviceTemplateId pricingModel priceCentavos
  loadCapacityKg baseWeightKg excessRatePerKgCentavos minBillableKg
  unit minQuantity maxQuantity
`;

/** This washer's price overrides. A service with no row uses the template's. */
export async function gqlMyWasherServiceOfferings(): Promise<WasherServiceOffering[]> {
  const data = await graphqlRequest<{ myWasherServiceOfferings: WasherServiceOffering[] }>(
    `query MyWasherServiceOfferings {
       myWasherServiceOfferings { ${SERVICE_OFFERING_FIELDS} }
     }`
  );
  return data.myWasherServiceOfferings;
}

export async function gqlSetWasherServiceOffering(
  input: SetWasherServiceOfferingInput,
): Promise<WasherServiceOffering> {
  const data = await graphqlRequest<{ setWasherServiceOffering: WasherServiceOffering }>(
    `mutation SetWasherServiceOffering($input: SetWasherServiceOfferingInput!) {
       setWasherServiceOffering(input: $input) { ${SERVICE_OFFERING_FIELDS} }
     }`,
    { input },
  );
  return data.setWasherServiceOffering;
}

/** Drops the override; the service falls back to the platform price. */
export async function gqlRemoveWasherServiceOffering(
  serviceTemplateId: string,
): Promise<boolean> {
  const data = await graphqlRequest<{ removeWasherServiceOffering: boolean }>(
    `mutation RemoveWasherServiceOffering($serviceTemplateId: ID!) {
       removeWasherServiceOffering(serviceTemplateId: $serviceTemplateId)
     }`,
    { serviceTemplateId },
  );
  return data.removeWasherServiceOffering;
}

/**
 * The platform fee percentage currently in force. Fetched rather than
 * hardcoded because it is ADDED to every price a customer sees — a washer
 * setting ₱180 needs to be shown the ₱198 the customer will actually pay.
 */
export async function gqlCurrentPlatformFeePercent(): Promise<number> {
  const data = await graphqlRequest<{ currentPlatformFeePercent: number }>(
    `query CurrentPlatformFeePercent { currentPlatformFeePercent }`,
  );
  return data.currentPlatformFeePercent;
}

// ─── Certification ────────────────────────────────────────────────────────────

// Certification evidence is uploaded as BYTES, exactly like submitKycDocument —
// the server derives the storage key and writes to the private evidence store.
// The old `proofUrls: [String!]` argument still exists on the schema but now
// throws by design, so nothing here may send it.
export interface CertificationProofInput {
  base64: string;
  mimeType: string;
}

export async function gqlSubmitCertProof(
  proofs: CertificationProofInput[]
): Promise<void> {
  await graphqlRequest(
    `mutation SubmitCertificationProof($proofs: [CertificationProofInput!]) {
       submitCertificationProof(proofs: $proofs)
     }`,
    { proofs }
  );
}

// Short-lived (300 s) signed URLs for the caller's certification evidence.
// Replaces the removed `WasherProfile.certProofUrls` read field; the server
// authorizes owner/admin/support the same way kycDocumentUrl does. Re-fetch
// rather than cache — these expire.
export async function gqlCertificationProofUrls(
  washerUid?: string
): Promise<string[]> {
  const data = await graphqlRequest<{ certificationProofUrls: string[] }>(
    `query CertificationProofUrls($washerUid: ID) {
       certificationProofUrls(washerUid: $washerUid)
     }`,
    washerUid ? { washerUid } : {}
  );
  return data.certificationProofUrls ?? [];
}

/**
 * Explicit allowlist serializer: emits ONLY UpdateWasherProfileInput fields,
 * with address/mapLocation re-shaped to their exact input types.
 *
 * `gqlUpdateWasherProfile` above uses the denylist + alias approach instead,
 * because mapProfile hands back FE shim names that have to be translated. This
 * is the stricter alternative kept for callers that build an input directly,
 * and is covered by __tests__/washerProfileSerializer.test.ts.
 */
export const UPDATE_WASHER_PROFILE_KEYS = [
  "displayName",
  // Her storefront name. Shares its name with the BE input field, so unlike the
  // store* photo/description keys it needs no alias.
  "storeName",
  "phone",
  "photoUrl",
  "bio",
  "address",
  "mapLocation",
  "offeredServiceTemplateIds",
  "serviceRadiusKm",
  "machineType",
  "machineBrand",
  "machineCapacityKg",
] as const;

export function serializeWasherProfileInput(
  fields: Partial<WasherProfile> & Record<string, unknown>
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of UPDATE_WASHER_PROFILE_KEYS) {
    if (!(key in fields)) continue;
    const value = (fields as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (key === "address") {
      if (value) input.address = serializeAddress(value as WasherAddress);
      continue;
    }
    if (key === "mapLocation") {
      if (value) {
        const loc = value as { latitude: number; longitude: number };
        input.mapLocation = { latitude: loc.latitude, longitude: loc.longitude };
      }
      continue;
    }
    input[key] = value;
  }
  // The three BE field names that have no WasherProfile key of the same name.
  for (const k of ["description", "logoUrl", "coverPhotoUrl"] as const) {
    if (k in fields && fields[k] !== undefined) input[k] = fields[k];
  }
  return input;
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/**
 * Her own performance over a date range. Owner-scoped server-side — there is no
 * branchId argument, so this can only ever return the caller's own numbers.
 *
 * Money here is INFORMATIONAL: customers pay the washer directly and Lalaba
 * never holds the funds, so `grossCentavos` is what she should have collected
 * rather than a balance owed. `platformFeeCentavos` is the only figure Lalaba
 * actually moves — it comes out of her prepaid fee wallet.
 */
export interface WasherReport {
  dateFrom: string;
  dateTo: string;
  ordersCompleted: number;
  ordersCancelled: number;
  grossCentavos: number;
  platformFeeCentavos: number;
  netCentavos: number;
  totalKg: number | null;
  /** Null when nothing in the window was rated — NOT 0. */
  avgRating: number | null;
  reviewCount: number;
}

export async function gqlWasherReport(
  dateFrom: string,
  dateTo: string,
): Promise<WasherReport> {
  const data = await graphqlRequest<{ washerReport: WasherReport }>(
    `query WasherReport($dateFrom: String!, $dateTo: String!) {
       washerReport(dateFrom: $dateFrom, dateTo: $dateTo) {
         dateFrom dateTo
         ordersCompleted ordersCancelled
         grossCentavos platformFeeCentavos netCentavos
         totalKg avgRating reviewCount
       }
     }`,
    { dateFrom, dateTo },
  );
  return data.washerReport;
}
