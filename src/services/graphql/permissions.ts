// src/services/graphql/permissions.ts
// GraphQL operations for the permissions domain.

import { graphqlRequest } from "../../config/graphql";
import type { PermissionGroupKey } from "../../types/permissions";

export interface GqlPermission {
  _id: string;
  permissionName: string;
  description: string;
}

let _cache: GqlPermission[] | null = null;

export async function gqlListPermissions(): Promise<GqlPermission[]> {
  // Only treat a NON-empty result as cached. An empty list means the catalogue
  // wasn't available yet (e.g. fetched before the BE seed ran); caching it would
  // pin permission grants to "" for the whole session and silently save no ids.
  if (_cache && _cache.length > 0) return _cache;
  const data = await graphqlRequest<{ listPermissions: GqlPermission[] }>(
    `query { listPermissions { _id permissionName description } }`,
    {}
  );
  _cache = data.listPermissions;
  return _cache;
}

export function clearPermissionsCache(): void {
  _cache = null;
}

/**
 * What the signed-in account may do on the branch it is currently working.
 *
 * The server decides. The app used to answer this itself — pull the whole
 * catalogue, intersect it with the account's permissionIds, reverse-map the
 * names into gating keys — which under per-branch grants asks the wrong
 * question: the account-global list says "somewhere", so the UI would open
 * screens the backend then refuses.
 *
 * Not cached: the answer changes when the owner re-approves a device onto a
 * different branch, and a stale yes is a worse failure than an extra query at
 * sign-in.
 */
export async function gqlMyPermissionGroups(): Promise<PermissionGroupKey[]> {
  const data = await graphqlRequest<{ myPermissionGroups: PermissionGroupKey[] }>(
    `query { myPermissionGroups }`,
    {}
  );
  return data.myPermissionGroups ?? [];
}
