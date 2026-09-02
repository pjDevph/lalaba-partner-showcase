// src/services/graphql/discovery.ts
// The provider's OWN public marketplace profile + service catalog — the exact
// data customers see, built by the BE with the same resolvers used for customer
// discovery. Powers the washer "View as customer" preview so it can't drift.

import { graphqlRequest } from "../../config/graphql";

export interface MyProviderProfile {
  branchId: string;
  providerType: string;
  name: string;
  initials: string;
  verificationBadges: string[];
  ratingAverage: number;
  ratingCount: number;
  ratingHistogram: { star: number; count: number }[];
  description: string | null;
  logoUrl: string | null;
  coverPhotoUrl: string | null;
  featuredPhotos: string[];
  areaLabel: string | null;
  supportedFulfillment: string[];
  policies: { minOrderKg: number | null; freeBatchDelivery: boolean; expressCutoff: string | null };
  serviceCategories: string[];
  slotsRemaining: number | null;
  statusText: string;
  washerVerification: {
    identityVerified: boolean;
    residenceConfirmed: boolean;
    servicesReviewed: boolean;
    paymentAccountVerified: boolean;
    recheckCadence: string | null;
    verifiedOn: string | null;
  } | null;
}

export interface ProviderServiceItem {
  serviceRefId: string;
  name: string;
  description: string | null;
  category: string;
  pricingType: string;
  price: number;
  baseKilos: number | null;
  excessRate: number | null;
  minKg: number | null;
  readyInHint: string | null;
  approved: boolean;
}

const PROFILE_FIELDS = `
  branchId providerType name initials verificationBadges
  ratingAverage ratingCount ratingHistogram { star count }
  description logoUrl coverPhotoUrl featuredPhotos areaLabel
  supportedFulfillment
  policies { minOrderKg freeBatchDelivery expressCutoff }
  serviceCategories slotsRemaining statusText
  washerVerification { identityVerified residenceConfirmed servicesReviewed paymentAccountVerified recheckCadence verifiedOn }
`;

const SERVICE_FIELDS = `
  serviceRefId name description category pricingType price
  baseKilos excessRate minKg readyInHint approved
`;

export async function gqlMyProviderProfile(): Promise<MyProviderProfile | null> {
  const data = await graphqlRequest<{ myProviderProfile: MyProviderProfile | null }>(
    `query MyProviderProfile { myProviderProfile { ${PROFILE_FIELDS} } }`,
  );
  return data.myProviderProfile;
}

// The provider's OWN public card(s) — the exact card customers see in discovery,
// one per branch operated (a washer returns a single card). Drives the merchant
// dashboard's per-branch profile carousel. `branchId` maps each card to a branch.
/**
 * The public store page for ONE branch, exactly as a customer sees it.
 *
 * `gqlMyProviderProfile` cannot serve a multi-branch merchant: the backend
 * resolves it with `findOne({ uid })` and returns whichever branch comes back
 * first. This takes the branch explicitly.
 */
export async function gqlProviderProfile(
  branchId: string,
  providerType: string,
): Promise<MyProviderProfile | null> {
  const data = await graphqlRequest<{ providerProfile: MyProviderProfile | null }>(
    `query ProviderProfile($branchId: ID!, $providerType: ProviderType!) {
       providerProfile(branchId: $branchId, providerType: $providerType) { ${PROFILE_FIELDS} }
     }`,
    { branchId, providerType },
  );
  return data.providerProfile;
}

export interface MyProviderCard {
  branchId: string;
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

const CARD_FIELDS = `
  branchId providerType name initials areaLabel statusText
  ratingAverage ratingCount serviceCategories
  coverPhotoUrl logoUrl priceFromCentavos isVerified
`;

export async function gqlMyProviderCards(): Promise<MyProviderCard[]> {
  const data = await graphqlRequest<{ myProviderCards: MyProviderCard[] }>(
    `query MyProviderCards { myProviderCards { ${CARD_FIELDS} } }`,
  );
  return data.myProviderCards ?? [];
}

export async function gqlProviderServices(branchId: string, providerType: string): Promise<ProviderServiceItem[]> {
  const data = await graphqlRequest<{ providerServices: ProviderServiceItem[] }>(
    `query ProviderServices($branchId: ID!, $providerType: ProviderType!) {
       providerServices(branchId: $branchId, providerType: $providerType) { ${SERVICE_FIELDS} }
     }`,
    { branchId, providerType },
  );
  return data.providerServices;
}
