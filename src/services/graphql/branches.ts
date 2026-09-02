// src/services/graphql/branches.ts
// GraphQL operations + BE↔FE shape translation for the branches domain.
//
// Shape translation (BE schema.gql ↔ FE Branch in merchantStore):
//   • BE branchAddress is a full PSGC object — name + code for each level.
//     AddressPicker collects all fields via cascading PSGC dropdowns.
//   • BE branchMapLocation, operatingHours, timestamps, uid, and isOnline are
//     mapped through to the FE Branch interface for full alignment.
//   • FE-only fields (merchantType, gcashQrUrl, archivedAt) have NO backend column.

import { graphqlRequest } from "../../config/graphql";
import type { Branch } from "../../stores/merchantStore";
import type { StructuredAddress } from "../../components/AddressPicker";

// ─── BE shapes (mirror schema.gql) ────────────────────────────────────────────
export interface GqlBranchAddress {
  unit?: string;
  streetAddress: string;
  barangayName: string;
  barangayCode?: string;
  cityMunicipalityName: string;
  cityMunicipalityCode?: string;
  provinceName: string;
  provinceCode?: string;
  regionName: string;
  regionCode?: string;
  zipCode?: string;
}

export interface GqlMapLocation {
  latitude: number;
  longitude: number;
}

export interface GqlDaySchedule {
  isOpen: boolean;
  is24Hours: boolean;
  timeSlots: { open: string; close: string }[];
}

export interface GqlOperatingHours {
  monday: GqlDaySchedule;
  tuesday: GqlDaySchedule;
  wednesday: GqlDaySchedule;
  thursday: GqlDaySchedule;
  friday: GqlDaySchedule;
  saturday: GqlDaySchedule;
  sunday: GqlDaySchedule;
}

export type BranchBusinessType =
  | "SOLE_PROPRIETORSHIP"
  | "PARTNERSHIP"
  | "CORPORATION"
  | "COOPERATIVE";

export interface GqlBranch {
  _id: string;
  uid: string;
  branchName: string;
  branchAddress: GqlBranchAddress;
  branchPhoneNumber: string;
  branchMapLocation: GqlMapLocation;
  operatingHours: GqlOperatingHours;
  isActive: boolean;
  isOnline: boolean;
  // Deferred-settlement opt-in (§14) — whether this shop lets a customer pay
  // the whole amount when the laundry comes back instead of at pickup.
  allowsPayAtHandover: boolean;
  logoUrl: string | null;
  coverPhotoUrl: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  // Business registration details, collected during verification.
  businessType: BranchBusinessType | null;
  dtiRegistrationNumber: string | null;
  tin: string | null;
  businessEmail: string | null;
  // Verified badge state. verifiedAt (not verificationStatus) is what the
  // badge derives from everywhere else in the codebase — keep it that way.
  verificationStatus: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt: string | null;
  rejectionReason: string | null;
}

const OH_FIELDS = `
  monday    { isOpen is24Hours timeSlots { open close } }
  tuesday   { isOpen is24Hours timeSlots { open close } }
  wednesday { isOpen is24Hours timeSlots { open close } }
  thursday  { isOpen is24Hours timeSlots { open close } }
  friday    { isOpen is24Hours timeSlots { open close } }
  saturday  { isOpen is24Hours timeSlots { open close } }
  sunday    { isOpen is24Hours timeSlots { open close } }
`;

const BRANCH_FIELDS = `
  _id uid branchName branchPhoneNumber
  isActive isOnline allowsPayAtHandover
  logoUrl coverPhotoUrl description
  createdAt updatedAt
  businessType dtiRegistrationNumber tin businessEmail
  verificationStatus verifiedAt rejectionReason
  branchAddress { unit streetAddress barangayName cityMunicipalityName provinceName regionName zipCode }
  branchMapLocation { latitude longitude }
  operatingHours { ${OH_FIELDS} }
`;

// ─── Translation ──────────────────────────────────────────────────────────────
function joinAddress(a: GqlBranchAddress | null | undefined): string {
  if (!a) return "";
  // Unit belongs on the street line ("Unit 2B Sampaguita St"), not as its own comma part.
  const streetLine = [a.unit, a.streetAddress].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return [streetLine, a.barangayName, a.cityMunicipalityName, a.provinceName]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Map a backend Branch to the FE Branch interface. */
export function toFeBranch(b: GqlBranch): Branch {
  return {
    id: b._id,
    uid: b.uid,
    name: b.branchName,
    address: joinAddress(b.branchAddress),
    branchAddress: b.branchAddress,
    phone: b.branchPhoneNumber,
    isActive: b.isActive,
    isOnline: b.isOnline,
    allowsPayAtHandover: b.allowsPayAtHandover ?? false,
    branchMapLocation: b.branchMapLocation,
    operatingHours: b.operatingHours,
    logoUrl: b.logoUrl ?? null,
    coverPhotoUrl: b.coverPhotoUrl ?? null,
    description: b.description ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    archivedAt: b.isActive ? null : undefined,
    businessType: b.businessType ?? null,
    dtiRegistrationNumber: b.dtiRegistrationNumber ?? null,
    tin: b.tin ?? null,
    businessEmail: b.businessEmail ?? null,
    verificationStatus: b.verificationStatus ?? "PENDING",
    verifiedAt: b.verifiedAt ?? null,
  };
}

// ─── Default operating hours (all days open 08:00–20:00) ─────────────────────
// Used when creating a branch since the FE form doesn't yet collect hours.
const DEFAULT_OPERATING_HOURS = {
  monday:    { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  tuesday:   { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  wednesday: { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  thursday:  { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  friday:    { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  saturday:  { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
  sunday:    { is24Hours: false, isOpen: true, timeSlots: [{ open: "08:00", close: "20:00" }] },
};

// Map an AddressPicker StructuredAddress to BE BranchAddressInput.
// Code fields (barangayCode, cityMunicipalityCode, provinceCode, regionCode) are
// stored in StructuredAddress for future use but not yet accepted by BranchAddressInput.
export function toBranchAddress(a: StructuredAddress) {
  return {
    unit:                 a.unit.trim(),
    // streetAddress is required by the BE, so fall back to the map's first line.
    streetAddress:        a.street.trim() || a.displayName.split(",")[0]?.trim() || "",
    barangayName:         a.barangayName        || "",
    cityMunicipalityName: a.cityMunicipalityName || "",
    provinceName:         a.provinceName        || "",
    regionName:           a.regionName          || "",
    zipCode:              a.zipCode             || "",
  };
}

// ─── myBranches ────────────────────────────────────────────────────────────────
// Class-level GqlAuthGuard only (no @Roles), so staff can call it too — but the
// backend scopes results to the caller's _id, so staff get [] (their branches
// live under the merchant's uid). Merchants get their full branch list.
export async function fetchMyBranches(includeArchived = false): Promise<Branch[]> {
  const data = await graphqlRequest<{
    myBranches: { data: GqlBranch[]; total: number };
  }>(
    `query MyBranches($filter: BranchFilterInput) {
       myBranches(filter: $filter) { data { ${BRANCH_FIELDS} } total }
     }`,
    { filter: { limit: 100, offset: 0, ...(includeArchived ? {} : { isActive: true }) } }
  );
  return data.myBranches.data.map(toFeBranch);
}

// ─── myBranchOptions ──────────────────────────────────────────────────────────
// Minimal id/name pairs for pickers. Staff get only the branches they belong
// to, and (unlike everything else) this works from a NOT-yet-approved device —
// the BE resolver carries @SkipDeviceCheck so the registration-request screen
// can offer a branch choice.
export interface BranchOption {
  id: string;
  name: string;
}

export async function gqlMyBranchOptions(): Promise<BranchOption[]> {
  const data = await graphqlRequest<{ myBranchOptions: { _id: string; name: string }[] }>(
    `query MyBranchOptions { myBranchOptions { _id name } }`,
    {}
  );
  return data.myBranchOptions.map((b) => ({ id: b._id, name: b.name }));
}

// ─── getBranch ────────────────────────────────────────────────────────────────
export async function gqlGetBranch(id: string): Promise<Branch> {
  const data = await graphqlRequest<{ getBranch: GqlBranch }>(
    `query GetBranch($id: ID!) { getBranch(id: $id) { ${BRANCH_FIELDS} } }`,
    { id }
  );
  return toFeBranch(data.getBranch);
}

// ─── createBranch ─────────────────────────────────────────────────────────────
export async function gqlCreateBranch(
  name: string,
  structuredAddress: StructuredAddress,
  phone = "",
): Promise<Branch> {
  const branchInput = {
    branchName:        name,
    branchAddress:     toBranchAddress(structuredAddress),
    branchMapLocation: {
      latitude:  structuredAddress.latitude  ?? 14.5995,
      longitude: structuredAddress.longitude ?? 120.9842,
    },
    branchPhoneNumber: phone,
    operatingHours:    DEFAULT_OPERATING_HOURS,
  };

  const data = await graphqlRequest<{ createBranch: GqlBranch[] }>(
    `mutation CreateBranch($input: [CreateBranchInput!]!) {
       createBranch(input: $input) { ${BRANCH_FIELDS} }
     }`,
    { input: [branchInput] }
  );
  const created = data.createBranch[0];
  if (!created) throw new Error("createBranch returned no data");
  return toFeBranch(created);
}

// ─── updateBranch ─────────────────────────────────────────────────────────────
export async function gqlUpdateBranch(
  id: string,
  fields: {
    name?: string;
    phone?: string;
    operatingHours?: GqlOperatingHours;
    structuredAddress?: StructuredAddress;
    // Branding (BE UpdateBranchInput: logoUrl / coverPhotoUrl / description)
    logoUrl?: string | null;
    coverPhotoUrl?: string | null;
    description?: string | null;
    // Business registration details. null clears the field; undefined leaves
    // it untouched.
    businessType?: BranchBusinessType | null;
    dtiRegistrationNumber?: string | null;
    tin?: string | null;
    businessEmail?: string | null;
  }
): Promise<Branch> {
  const input: Record<string, unknown> = {};
  if (fields.name           !== undefined) input.branchName        = fields.name;
  if (fields.phone          !== undefined) input.branchPhoneNumber = fields.phone;
  if (fields.operatingHours !== undefined) input.operatingHours    = fields.operatingHours;
  if (fields.logoUrl               !== undefined) input.logoUrl               = fields.logoUrl;
  if (fields.coverPhotoUrl         !== undefined) input.coverPhotoUrl         = fields.coverPhotoUrl;
  if (fields.description           !== undefined) input.description           = fields.description;
  if (fields.businessType          !== undefined) input.businessType          = fields.businessType;
  if (fields.dtiRegistrationNumber !== undefined) input.dtiRegistrationNumber = fields.dtiRegistrationNumber;
  if (fields.tin                   !== undefined) input.tin                   = fields.tin;
  if (fields.businessEmail         !== undefined) input.businessEmail         = fields.businessEmail;
  if (fields.structuredAddress !== undefined) {
    const a = fields.structuredAddress;
    input.branchAddress = toBranchAddress(a);
    // Only move the pin when the picker actually resolved coordinates — the
    // create-time fallback would otherwise drag an edited branch to Manila.
    if (a.latitude !== null && a.longitude !== null) {
      input.branchMapLocation = { latitude: a.latitude, longitude: a.longitude };
    }
  }

  const data = await graphqlRequest<{ updateBranch: GqlBranch }>(
    `mutation UpdateBranch($id: ID!, $input: UpdateBranchInput!) {
       updateBranch(id: $id, input: $input) { ${BRANCH_FIELDS} }
     }`,
    { id, input }
  );
  return toFeBranch(data.updateBranch);
}

// ─── archiveBranch ────────────────────────────────────────────────────────────
/**
 * Turn deferred settlement on or off for this shop. Its own mutation rather
 * than a field on updateBranch: it is an operating setting like open/closed,
 * and a money rule should not change as a side effect of editing an address.
 *
 * Orders already placed keep whatever the setting said when they were booked —
 * the value is snapshotted onto the order — so switching it off stops new
 * deferrals without retracting one a customer was already promised.
 */
export async function gqlSetPayAtHandover(
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const data = await graphqlRequest<{ setPayAtHandover: { allowsPayAtHandover: boolean } }>(
    `mutation SetPayAtHandover($id: ID!, $enabled: Boolean!) {
       setPayAtHandover(id: $id, enabled: $enabled) { _id allowsPayAtHandover }
     }`,
    { id, enabled },
  );
  return data.setPayAtHandover.allowsPayAtHandover;
}

/**
 * The dashboard's own open/closed switch — distinct from archive/restore
 * (merchant-level, rare) and from KYC/verification gates: this is the one
 * toggle a merchant flips minute to minute to stop new bookings.
 */
export async function gqlSetBranchOnline(
  id: string,
  isOnline: boolean,
): Promise<boolean> {
  const data = await graphqlRequest<{ setBranchOnline: { _id: string; isOnline: boolean } }>(
    `mutation SetBranchOnline($id: ID!, $isOnline: Boolean!) {
       setBranchOnline(id: $id, isOnline: $isOnline) { _id isOnline }
     }`,
    { id, isOnline },
  );
  return data.setBranchOnline.isOnline;
}

export async function gqlArchiveBranch(id: string): Promise<void> {
  await graphqlRequest<{ archiveBranch: GqlBranch }>(
    `mutation ArchiveBranch($id: ID!) { archiveBranch(id: $id) { _id } }`,
    { id }
  );
}

// ─── restoreBranch ────────────────────────────────────────────────────────────
export async function gqlRestoreBranch(id: string): Promise<void> {
  await graphqlRequest<{ restoreBranch: GqlBranch }>(
    `mutation RestoreBranch($id: ID!) { restoreBranch(id: $id) { _id } }`,
    { id }
  );
}
