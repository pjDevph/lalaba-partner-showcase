// src/services/graphql/auth.ts
// GraphQL operations for the users/auth domain (live backend).
//
// Auth flow (BE is Firebase-token based — see src/config/graphql.ts):
//   register: Firebase createUserWithEmailAndPassword → registerUser(profile)
//   login:    Firebase signInWithEmailAndPassword → me
// The Firebase ID token is attached automatically by graphqlRequest().

import { graphqlRequest, ApiErrorBlocker } from "../../config/graphql";

// ─── Shared shapes (mirror BE schema.gql) ─────────────────────────────────────
export interface GqlRole {
  _id: string;
  roleId: string;
  roleName: string;
}

/**
 * Mirrors the SDL `SignupRole` — the minimal, deliberately-public projection
 * served by the `signupRoles` query at sign-up time. Structurally identical to
 * `GqlRole` today, but kept distinct so a future field added to the guarded
 * `Role` type cannot silently leak into the anonymous signup selection set.
 */
export interface GqlSignupRole {
  _id: string;
  roleId: string;
  roleName: string;
}

export interface GqlHomeAddress {
  unit: string | null;
  streetAddress: string | null;
  barangayName: string | null;
  barangayCode: string | null;
  cityMunicipalityName: string | null;
  cityMunicipalityCode: string | null;
  provinceName: string | null;
  provinceCode: string | null;
  regionName: string | null;
  regionCode: string | null;
  zipCode: string | null;
}

export interface GqlUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  homeAddress?: GqlHomeAddress | null;
  role: GqlRole;
  branchIds: string[] | null;
  permissionIds?: string[] | null;
  merchantId: string | null;
  isActive: boolean;
  isArchived: boolean | null;
  // Courier liveness selfie. `photoUrl` is the profile picture; `selfieStatus`
  // is the gate — anything other than ACTIVE means order handling is locked.
  // Both null for every non-courier role.
  photoUrl?: string | null;
  selfieStatus?: "ACTIVE" | "SUPERSEDED" | "REVOKED" | null;
}

const HOME_ADDRESS_FIELDS = `
  unit
  streetAddress
  barangayName
  barangayCode
  cityMunicipalityName
  cityMunicipalityCode
  provinceName
  provinceCode
  regionName
  regionCode
  zipCode
`;

const USER_FIELDS = `
  _id
  email
  firstName
  lastName
  phoneNumber
  homeAddress { ${HOME_ADDRESS_FIELDS} }
  role { _id roleId roleName }
  branchIds
  permissionIds
  merchantId
  isActive
  isArchived
  photoUrl
  selfieStatus
`;

// ─── signupRoles (public) ─────────────────────────────────────────────────────
// The only role query reachable without a token (BE SEC-004). `listRoles` is now
// admin-only — it used to let an anonymous caller dump the whole role catalogue —
// so sign-up, which must send a role `_id` *before* it has any token, has to use
// this instead. Returns only the self-registrable roles (customer / merchant /
// washer); callers filter to the ones they offer. Projection is
// _id / roleId / roleName — SignupRole has no `description`, so selecting one is
// a validation error. Role `_id`s are unchanged, so the existing
// `roles.find(r => r.roleId === …)._id` lookups keep working.
//
// Typed as GqlSignupRole rather than GqlRole so a field later added to the
// guarded `Role` type cannot silently widen this anonymous selection set.
// src/screens/register/RoleStep.tsx consumes that type directly.
export async function signupRoles(): Promise<GqlSignupRole[]> {
  const data = await graphqlRequest<{ signupRoles: GqlSignupRole[] }>(
    `query SignupRoles { signupRoles { _id roleId roleName } }`,
    {},
    { anonymous: true }
  );
  return data.signupRoles;
}

// ─── registerUser ──────────────────────────────────────────────────────────────
// A policy acceptance captured at registration. The backend requires the
// mandatory set for the role (merchant/washer also need merchant_agreement) —
// registration is rejected if any is missing.
export interface GqlConsentInput {
  policyType: string;
  version: string;
  locale?: string;
}

export interface RegisterUserInput {
  role: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  consents: GqlConsentInput[];
}

// registerUser only requests scalar fields — the nested role object triggers a
// backend INTERNAL_SERVER_ERROR when role.roleId is null on some DB documents.
// Full user data (including role) is fetched via fetchMe() after this succeeds.
const REGISTER_FIELDS = `_id email firstName lastName phoneNumber isActive`;

export async function registerUser(input: RegisterUserInput): Promise<GqlUser> {
  const data = await graphqlRequest<{ registerUser: GqlUser }>(
    `mutation RegisterUser($input: RegisterUserInput!) {
       registerUser(input: $input) { ${REGISTER_FIELDS} }
     }`,
    { input }
  );
  return data.registerUser;
}

// ─── me ──────────────────────────────────────────────────────────────────────
export async function fetchMe(): Promise<GqlUser | null> {
  const data = await graphqlRequest<{ me: GqlUser | null }>(
    `query Me { me { ${USER_FIELDS} } }`,
    {}
  );
  return data.me;
}

// ─── updateUser ───────────────────────────────────────────────────────────────
export interface UpdateAddressInput {
  unit?: string;
  streetAddress?: string;
  barangayName?: string;
  barangayCode?: string;
  cityMunicipalityName?: string;
  cityMunicipalityCode?: string;
  provinceName?: string;
  provinceCode?: string;
  regionName?: string;
  regionCode?: string;
  zipCode?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  homeAddress?: UpdateAddressInput;
}

// Same nested-role gotcha as registerUser (see REGISTER_FIELDS above) — omit
// role from the selection so a null role.roleId on some DB documents can't
// crash this mutation. Callers don't need role back; fetchMe() has it.
const UPDATE_USER_FIELDS = `
  _id
  email
  firstName
  lastName
  phoneNumber
  homeAddress { ${HOME_ADDRESS_FIELDS} }
  branchIds
  permissionIds
  merchantId
  isActive
  isArchived
`;

export async function gqlUpdateUser(input: UpdateUserInput): Promise<GqlUser> {
  const data = await graphqlRequest<{ updateUser: GqlUser }>(
    `mutation UpdateUser($input: UpdateUserInput!) {
       updateUser(input: $input) { ${UPDATE_USER_FIELDS} }
     }`,
    { input }
  );
  return data.updateUser;
}

// ─── accountDeletionBlockers ────────────────────────────────────────────────
// Side-effect-free pre-check: what would currently block requestAccountDeletion.
// Empty array means the account is clear to enter the deactivate flow.
export async function gqlAccountDeletionBlockers(): Promise<ApiErrorBlocker[]> {
  const data = await graphqlRequest<{
    accountDeletionBlockers: ApiErrorBlocker[];
  }>(
    `query AccountDeletionBlockers {
       accountDeletionBlockers { code message count ids }
     }`,
    {}
  );
  return data.accountDeletionBlockers;
}

// ─── requestAccountDeletion ─────────────────────────────────────────────────
// Self-service deletion: disables the caller's own login on the backend
// immediately. Does NOT touch the Firebase identity — do not also call
// `auth.currentUser?.delete()`, that orphans the backend record instead of
// disabling it and is irreversible client-side.
export async function gqlRequestAccountDeletion(): Promise<void> {
  await graphqlRequest<{ requestAccountDeletion: GqlUser }>(
    `mutation RequestAccountDeletion {
       requestAccountDeletion { _id isActive }
     }`,
    {}
  );
}
