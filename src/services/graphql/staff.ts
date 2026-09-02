// src/services/graphql/staff.ts
// GraphQL operations for the staff domain (live backend).

import { graphqlRequest } from "../../config/graphql";
import type { StaffMember } from "../../stores/activeStaffStore";
import type { PermissionGroupKey, StaffRole } from "../../types/permissions";

// ─── BE shapes ────────────────────────────────────────────────────────────────
interface GqlBranchAccess {
  branchId: string;
  groups: PermissionGroupKey[];
}

interface GqlStaffUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  branchAccess: GqlBranchAccess[] | null;
  branchIds: string[] | null;
  isActive: boolean;
  isArchived: boolean | null;
  archivedAt: string | null;
  createdAt: string;
  role: { roleId: string } | null;
}

// `role` matters: myStaff returns EVERY account the merchant provisioned —
// laundry staff AND couriers (both created through createStaff) — and roleId is
// the only thing that tells them apart.
//
// `branchAccess` is the grant: which branches, and what they may do at each.
// The server answers in GROUPS, not permission names — the app deliberately
// holds no opinion about which permissions "Orders" covers, because three
// hand-synced copies of that opinion is how the old model drifted.
const STAFF_FIELDS = `
  _id
  email
  firstName
  lastName
  phoneNumber
  branchAccess { branchId groups }
  branchIds
  isActive
  isArchived
  archivedAt
  createdAt
  role { roleId }
`;

// ─── Translation ──────────────────────────────────────────────────────────────
const ROLE_ID_TO_STAFF_ROLE: Record<string, StaffRole> = {
  staff:   "STAFF",
  courier: "COURIER",
};

function toStaffMember(u: GqlStaffUser): StaffMember {
  return {
    id:            u._id,
    name:          `${u.firstName} ${u.lastName}`.trim(),
    role:          ROLE_ID_TO_STAFF_ROLE[u.role?.roleId ?? ""] ?? "STAFF",
    email:         u.email,
    phone:         u.phoneNumber,
    isActive:      u.isActive,
    isArchived:    u.isArchived ?? false,
    archivedAt:    u.archivedAt ? new Date(u.archivedAt) : null,
    permissions:   {},
    branchAccess:  u.branchAccess ?? [],
    branchIds:     u.branchIds ?? [],
    createdAt:     u.createdAt ? new Date(u.createdAt) : undefined,
  };
}

// ─── getStaff ─────────────────────────────────────────────────────────────────
export async function gqlGetStaff(id: string): Promise<StaffMember> {
  const data = await graphqlRequest<{ getStaff: GqlStaffUser }>(
    `query GetStaff($id: ID!) { getStaff(id: $id) { ${STAFF_FIELDS} } }`,
    { id }
  );
  return toStaffMember(data.getStaff);
}

// ─── fetchMyStaff ─────────────────────────────────────────────────────────────
export async function fetchMyStaff(branchId?: string): Promise<StaffMember[]> {
  const data = await graphqlRequest<{
    myStaff: { data: GqlStaffUser[]; total: number };
  }>(
    `query MyStaff($filter: StaffFilterInput) {
       myStaff(filter: $filter) { data { ${STAFF_FIELDS} } total }
     }`,
    { filter: { limit: 100, offset: 0, ...(branchId ? { branchId } : {}) } }
  );
  return data.myStaff.data.map(toStaffMember);
}

// ─── createStaff ──────────────────────────────────────────────────────────────
export interface BranchAccessInput {
  branchId: string;
  groups: PermissionGroupKey[];
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  /**
   * Branches plus the access granted at each, set at creation.
   *
   * This is what collapsed adding a team member from three screens into one:
   * before it existed, createStaff always wrote an empty permission set and the
   * owner had to reopen the member in a separate 22-switch editor to grant
   * anything.
   *
   * Couriers send entries with `groups: []` — assignment without permissions.
   * Sending them a non-empty group is rejected server-side.
   */
  branchAccess?: BranchAccessInput[];
  branchIds?: string[];
  /**
   * Which kind of account to provision. Defaults to STAFF server-side.
   *
   * Home washers may only invite couriers — they have no shop floor and no POS,
   * so a "staff" account would land on screens that do not apply to them. The
   * backend enforces that; this field is how the washer app asks for the one
   * role it is allowed.
   *
   * UPPERCASE, and not negotiable: registerEnumType publishes an enum by its
   * KEYS, so InvitableStaffRole is `STAFF | COURIER` on the wire even though the
   * values behind them are lowercase in create-staff.input.ts. Sending the
   * lowercase value is rejected by GraphQL before the resolver is ever reached
   * ("Value \"courier\" does not exist in \"InvitableStaffRole\" enum").
   */
  role?: "STAFF" | "COURIER";
}

export async function gqlCreateStaff(input: CreateStaffInput): Promise<StaffMember> {
  const data = await graphqlRequest<{ createStaff: GqlStaffUser }>(
    `mutation CreateStaff($input: CreateStaffInput!) {
       createStaff(input: $input) { ${STAFF_FIELDS} }
     }`,
    { input }
  );
  return toStaffMember(data.createStaff);
}

// ─── updateStaff ──────────────────────────────────────────────────────────────
export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  /** Authoritative when sent — replaces the member's grants wholesale. */
  branchAccess?: BranchAccessInput[];
  /**
   * Reassign branches without touching grants. Surviving branches keep what
   * they had; new ones start empty. Prefer `branchAccess` when you know the
   * access you want.
   */
  branchIds?: string[];
  isActive?: boolean;
}

export async function gqlUpdateStaff(id: string, input: UpdateStaffInput): Promise<StaffMember> {
  const data = await graphqlRequest<{ updateStaff: GqlStaffUser }>(
    `mutation UpdateStaff($id: ID!, $input: UpdateStaffInput!) {
       updateStaff(id: $id, input: $input) { ${STAFF_FIELDS} }
     }`,
    { id, input }
  );
  return toStaffMember(data.updateStaff);
}

// ─── archiveStaff ─────────────────────────────────────────────────────────────
export async function gqlArchiveStaff(id: string): Promise<void> {
  await graphqlRequest<{ archiveStaff: { _id: string } }>(
    `mutation ArchiveStaff($id: ID!) { archiveStaff(id: $id) { _id } }`,
    { id }
  );
}

// ─── restoreStaff ─────────────────────────────────────────────────────────────
export async function gqlRestoreStaff(id: string): Promise<void> {
  await graphqlRequest<{ restoreStaff: { _id: string } }>(
    `mutation RestoreStaff($id: ID!) { restoreStaff(id: $id) { _id } }`,
    { id }
  );
}

// ─── generateStaffResetLink ───────────────────────────────────────────────────
export async function gqlGenerateStaffResetLink(id: string): Promise<string> {
  const data = await graphqlRequest<{ generateStaffResetLink: string }>(
    `mutation GenerateStaffResetLink($id: ID!) { generateStaffResetLink(id: $id) }`,
    { id }
  );
  return data.generateStaffResetLink;
}
