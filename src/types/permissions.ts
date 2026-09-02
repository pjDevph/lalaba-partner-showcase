// src/types/permissions.ts
// Granular permission keys for the Lalaba Merchant staff system.
// Each staff member gets role-based defaults + optional per-staff overrides.

// ─── Permission Keys ──────────────────────────────────────────────────────────

export type PermissionKey =
  // POS & Orders
  | "canCreateOrder"
  | "canApplyDiscount"
  | "canCancelUnpaidOrder"     // draft / pending-payment orders
  | "canCancelPaidOrder"       // paid / in-service orders (high trust)
  | "canConfirmPickup"
  // Services
  | "canViewServices"
  | "canAddService"
  | "canEditService"
  | "canArchiveService"
  // Queue / Tasks
  | "canViewQueue"
  | "canUpdateOrderStatus"
  // Dashboard
  | "canViewDashboard"
  | "canViewRevenue"           // revenue figures visible (manager+)
  // Sales & Reports
  | "canViewSalesReports"
  | "canExportReports"
  // Logs
  | "canViewActivityLogs"
  // Costing
  | "canViewCosting"            // open the costing module / dashboard card
  | "canManageCostingSetup"     // edit rates, fixed costs, additional costs, reminders
  | "canEnterUtilityReadings"   // record utilities / readings / LPG counts (often via tasks)
  | "canSaveDailyCosting"
  | "canEditSavedCosting"
  | "canViewTrueMargin"         // see true margin / cost per kilo (sensitive)
  // Inventory (raw stock/supplies: detergent, fabcon, etc.)
  | "canAddInventory"
  | "canEditInventory"           // restock, adjust, mark damaged
  | "canArchiveInventory"
  // Products (sellable retail items — distinct BE permission family from Inventory)
  | "canAddProduct"
  | "canEditProduct"
  | "canArchiveProduct"
  // Settings (owner-only effectively)
  | "canManageStaff"
  | "canManageSettings";

// COURIER is a merchant-provisioned account like STAFF (BE `InvitableStaffRole`),
// but riders work out of the courier app — none of the permissions below apply
// to them, so they carry no merchant capabilities at all.
// Two account types, and an OWNER pseudo-role for the merchant themselves.
//
// MANAGER and CASHIER used to sit here. They were never real: the backend has
// only ever accepted `staff` or `courier`, and nothing on the client could
// produce a MANAGER either — branch memberships are built with role "staff"
// hardcoded, so every check against MANAGER was dead. What a staff member may
// do comes from their per-branch permission groups, not a job title.
export type StaffRole = "OWNER" | "STAFF" | "COURIER";

export type PermissionMap = Record<PermissionKey, boolean>;

// ─── Permission Groups ────────────────────────────────────────────────────────
// The owner-facing model: four switches per branch, not a thirty-row matrix.
//
// Which BACKEND permissions each group grants is decided server-side, in
// permission-groups.ts, and the app never sees the list. What lives here is the
// other direction — which FE gating keys a group turns on — because the app
// still asks `useCan("canCreateOrder")` to decide what to render.
//
// Keep this in agreement with the backend's PERMISSION_GROUP_MEMBERS. It is not
// a security boundary (the guard is), but a disagreement shows up as a screen
// the staff member can open and then cannot use.

export type PermissionGroupKey = "ORDERS" | "INVENTORY" | "SERVICES" | "OTHERS";

export const PERMISSION_GROUP_KEYS: PermissionGroupKey[] = [
  "ORDERS",
  "INVENTORY",
  "SERVICES",
  "OTHERS",
];

export const PERMISSION_GROUP_LABELS: Record<
  PermissionGroupKey,
  { label: string; description: string }
> = {
  ORDERS: {
    label: "Orders",
    description:
      "Take orders at the counter, move them through wash and fold, confirm pickup, apply discounts and cancel.",
  },
  INVENTORY: {
    label: "Inventory",
    description:
      "Restock and adjust supplies, and manage the retail products you sell.",
  },
  SERVICES: {
    label: "Services",
    description: "Add and edit the services offered and their pricing.",
  },
  OTHERS: {
    label: "Others",
    description: "Sales reports, activity logs and costing.",
  },
};

/** The FE gating keys each group switches on. */
export const GROUP_TO_FE_KEYS: Record<PermissionGroupKey, PermissionKey[]> = {
  ORDERS: [
    "canCreateOrder",
    "canApplyDiscount",
    "canCancelUnpaidOrder",
    "canCancelPaidOrder",
    "canConfirmPickup",
    "canUpdateOrderStatus",
    "canViewQueue",
  ],
  INVENTORY: [
    "canAddInventory",
    "canEditInventory",
    "canArchiveInventory",
    "canAddProduct",
    "canEditProduct",
    "canArchiveProduct",
  ],
  SERVICES: [
    "canViewServices",
    "canAddService",
    "canEditService",
    "canArchiveService",
  ],
  OTHERS: [
    "canViewDashboard",
    "canViewSalesReports",
    "canExportReports",
    "canViewActivityLogs",
    "canViewCosting",
    "canManageCostingSetup",
    "canEnterUtilityReadings",
    "canSaveDailyCosting",
    "canEditSavedCosting",
  ],
};

/** Resolve the granted groups for one branch into a full permission map. */
export function permissionsFromGroups(
  groups: readonly PermissionGroupKey[] | undefined | null
): PermissionMap {
  const map = { ...ROLE_DEFAULTS.STAFF };
  for (const group of groups ?? []) {
    for (const key of GROUP_TO_FE_KEYS[group] ?? []) map[key] = true;
  }
  return map;
}

// ─── Role Defaults ────────────────────────────────────────────────────────────
// These are the baseline permissions before any per-staff overrides are applied.

export const ROLE_DEFAULTS: Record<StaffRole, PermissionMap> = {
  OWNER: {
    canCreateOrder:       true,
    canApplyDiscount:     true,
    canCancelUnpaidOrder: true,
    canCancelPaidOrder:   true,
    canConfirmPickup:     true,
    canViewServices:      true,
    canAddService:        true,
    canEditService:       true,
    canArchiveService:    true,
    canViewQueue:         true,
    canUpdateOrderStatus: true,
    canViewDashboard:     true,
    canViewRevenue:       true,
    canViewSalesReports:  true,
    canExportReports:     true,
    canViewActivityLogs:  true,
    canViewCosting:           true,
    canManageCostingSetup:    true,
    canEnterUtilityReadings:  true,
    canSaveDailyCosting:      true,
    canEditSavedCosting:      true,
    canViewTrueMargin:        true,
    canAddInventory:      true,
    canEditInventory:     true,
    canArchiveInventory:  true,
    canAddProduct:        true,
    canEditProduct:       true,
    canArchiveProduct:    true,
    canManageStaff:       true,
    canManageSettings:    true,
  },
  // Every capability a staff member has is now an explicit per-branch grant, so
  // the baseline is nothing.
  //
  // This used to mirror a backend floor that granted order_confirm_pickup,
  // order_update_status and inventory_edit to every staff account whether or not
  // the owner ticked anything — which made a permission switch that read "off"
  // partly on. The floor is deleted server-side and existing staff were given
  // those three for real by the backfill migration, so nothing is lost by
  // starting from zero here.
  STAFF: {
    canCreateOrder:       false,
    canApplyDiscount:     false,
    canCancelUnpaidOrder: false,
    canCancelPaidOrder:   false,
    canConfirmPickup:     false,
    canViewServices:      false,
    canAddService:        false,
    canEditService:       false,
    canArchiveService:    false,
    canViewQueue:         false,
    canUpdateOrderStatus: false,
    canViewDashboard:     false,
    canViewRevenue:       false,
    canViewSalesReports:  false,
    canExportReports:     false,
    canViewActivityLogs:  false,
    canViewCosting:           false,
    canManageCostingSetup:    false,
    canEnterUtilityReadings:  false,
    canSaveDailyCosting:      false,
    canEditSavedCosting:      false,
    canViewTrueMargin:        false,
    canAddInventory:      false,
    canEditInventory:     false,
    canArchiveInventory:  false,
    canAddProduct:        false,
    canEditProduct:       false,
    canArchiveProduct:    false,
    canManageStaff:       false,
    canManageSettings:    false,
  },
  // Couriers never touch the merchant app — their pickups and deliveries are
  // driven by the online-order flow in the courier app, not by these grants.
  COURIER: {
    canCreateOrder:       false,
    canApplyDiscount:     false,
    canCancelUnpaidOrder: false,
    canCancelPaidOrder:   false,
    canConfirmPickup:     false,
    canViewServices:      false,
    canAddService:        false,
    canEditService:       false,
    canArchiveService:    false,
    canViewQueue:         false,
    canUpdateOrderStatus: false,
    canViewDashboard:     false,
    canViewRevenue:       false,
    canViewSalesReports:  false,
    canExportReports:     false,
    canViewActivityLogs:  false,
    canViewCosting:           false,
    canManageCostingSetup:    false,
    canEnterUtilityReadings:  false,
    canSaveDailyCosting:      false,
    canEditSavedCosting:      false,
    canViewTrueMargin:        false,
    canAddInventory:      false,
    canEditInventory:     false,
    canArchiveInventory:  false,
    canAddProduct:        false,
    canEditProduct:       false,
    canArchiveProduct:    false,
    canManageStaff:       false,
    canManageSettings:    false,
  },
};

// ─── FE → BE Permission Mapping ───────────────────────────────────────────────
// Maps each FE PermissionKey to the BE permissionName(s) that enforce it.
// Keys absent from this map are FE-only (no BE API gate yet).

export const FE_TO_BE_PERMISSIONS: Partial<Record<PermissionKey, string[]>> = {
  canCreateOrder:        ["order_create"],
  canApplyDiscount:      ["order_apply_discount"],
  canCancelUnpaidOrder:  ["order_cancel"],
  canCancelPaidOrder:    ["order_cancel"],
  canConfirmPickup:      ["order_confirm_pickup"],
  canUpdateOrderStatus:  ["order_update_status"],
  canAddService:         ["service_create"],
  canEditService:        ["service_edit"],
  canArchiveService:     ["service_archive"],
  canViewSalesReports:   ["report_view"],
  canExportReports:      ["report_export"],
  canViewActivityLogs:   ["log_view"],
  canViewCosting:        ["costing_read"],
  canSaveDailyCosting:   ["costing_create"],
  canEditSavedCosting:   ["costing_update"],
  canManageCostingSetup: ["costing_create", "costing_update"],
  canAddInventory:       ["inventory_create"],
  canEditInventory:      ["inventory_edit"],
  canArchiveInventory:   ["inventory_archive"],
  canAddProduct:         ["product_create"],
  canEditProduct:        ["product_update"],
  canArchiveProduct:     ["product_archive"],
};

/**
 * The reverse map: one BE permission name → every FE key that implies it.
 *
 * DERIVED from FE_TO_BE_PERMISSIONS rather than written out, because a
 * hand-maintained inverse is a second source of truth that drifts silently —
 * and the failure mode here is invisible, not loud: a notification row whose
 * permission has no reverse entry simply never appears for anyone.
 *
 * Used by the notification inbox to decide whether the staff member currently
 * holding a shared terminal may see a given branch row.
 */
export const BE_TO_FE_PERMISSIONS: Record<string, PermissionKey[]> = (() => {
  const out: Record<string, PermissionKey[]> = {};
  for (const [feKey, beNames] of Object.entries(FE_TO_BE_PERMISSIONS)) {
    for (const be of beNames ?? []) {
      (out[be] ??= []).push(feKey as PermissionKey);
    }
  }
  return out;
})();

/**
 * Whether an account holding `perms` may see something the backend gated on
 * `beName`. An unknown or absent name means "not gated" — the server has
 * already filtered for the authenticated identity, so this is a narrowing
 * pass, never the only check.
 */
export function canSeeBackendPermission(
  perms: PermissionMap | null,
  beName: string | null | undefined
): boolean {
  if (!beName) return true;
  const keys = BE_TO_FE_PERMISSIONS[beName];
  if (!keys?.length) return true;
  return keys.some((k) => can(perms, k));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Merge role defaults with stored per-staff overrides. */
export function resolvePermissions(
  role: StaffRole,
  overrides: Partial<PermissionMap> = {}
): PermissionMap {
  return { ...ROLE_DEFAULTS[role], ...overrides };
}

/** Quick can-check. Returns false if actor is null/undefined. */
export function can(
  permissions: PermissionMap | null | undefined,
  key: PermissionKey
): boolean {
  if (!permissions) return false;
  return permissions[key] === true;
}
