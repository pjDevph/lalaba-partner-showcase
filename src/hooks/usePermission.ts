// Lalaba Merchant — client-side permission gating.
// Two identities can be "acting" at once:
//   • Shared-terminal shift: `activeStaffStore.activeStaff` is set when
//     someone starts a shift via the owner's shared-terminal selector
//     (ShiftBanner) — permissions come from that staff member's resolved map.
//   • Individually-authenticated account: no shift active, so permissions
//     come from `authStore.resolvedPermissions` (the signed-in user's own
//     role + per-staff overrides, resolved in authStore's session flow).
// MERCHANT accounts resolve to the OWNER role default (all-true), matching
// the backend's unconditional bypass for role.roleId === 'merchant'.

import { useActiveStaffStore } from "../stores/activeStaffStore";
import { useAuthStore } from "../stores/authStore";
import { can, type PermissionKey, type PermissionMap } from "../types/permissions";

export function useCan(key: PermissionKey): boolean {
  const activeStaff = useActiveStaffStore((s) => s.activeStaff);
  const effectivePermissions = useActiveStaffStore((s) => s.effectivePermissions);
  const resolvedPermissions = useAuthStore((s) => s.resolvedPermissions);
  if (activeStaff) return can(effectivePermissions, key);
  return can(resolvedPermissions, key);
}

/**
 * The whole permission map for whoever is ACTING, by the same rule useCan
 * applies to a single key.
 *
 * Exposed for callers that must filter a list rather than gate one control —
 * the notification inbox, whose rows each carry their own required permission.
 * Without this they would have to re-derive the shift-vs-account branch, and a
 * second copy of that rule is exactly how the two drift apart.
 */
export function useEffectivePermissions(): PermissionMap | null {
  const activeStaff = useActiveStaffStore((s) => s.activeStaff);
  const effectivePermissions = useActiveStaffStore((s) => s.effectivePermissions);
  const resolvedPermissions = useAuthStore((s) => s.resolvedPermissions);
  return activeStaff ? effectivePermissions : resolvedPermissions;
}
