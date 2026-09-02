// src/__tests__/permissions.test.ts
// Unit tests for the permissions system: resolvePermissions, can(), ROLE_DEFAULTS.
// Covers Checklist: "Cashier → Reports/Inventory/Staff hidden or blocked [RTL]"
// Covers Checklist: "Staff appears with correct role badge"
// Pure functions — no mocks needed.

import { resolvePermissions, permissionsFromGroups, can, ROLE_DEFAULTS, PERMISSION_GROUP_KEYS } from "../types/permissions";
import type { PermissionKey } from "../types/permissions";

// ── HP: OWNER has all permissions ──────────────────────────────────────────

describe("ROLE_DEFAULTS: OWNER", () => {
  const perms = ROLE_DEFAULTS.OWNER;

  it("HP: OWNER can create orders", () => expect(perms.canCreateOrder).toBe(true));
  it("HP: OWNER can apply discount", () => expect(perms.canApplyDiscount).toBe(true));
  it("HP: OWNER can manage staff", () => expect(perms.canManageStaff).toBe(true));
  it("HP: OWNER can manage settings", () => expect(perms.canManageSettings).toBe(true));
  it("HP: OWNER can view true margin", () => expect(perms.canViewTrueMargin).toBe(true));
  it("HP: OWNER can view sales reports", () => expect(perms.canViewSalesReports).toBe(true));
  it("HP: OWNER can cancel paid orders", () => expect(perms.canCancelPaidOrder).toBe(true));
});





// ── HP: STAFF starts from nothing ──────────────────────────────────────────
// Every staff capability is an explicit per-branch grant now. The baseline used
// to mirror a backend floor that granted confirm-pickup, update-status and
// edit-inventory unconditionally — which made a permission switch reading "off"
// partly on. That floor is deleted server-side and existing staff were granted
// those three for real by the backfill migration.

describe("ROLE_DEFAULTS: STAFF", () => {
  const perms = ROLE_DEFAULTS.STAFF;

  it("SEC: STAFF grants nothing by default", () => {
    for (const [key, value] of Object.entries(perms)) {
      expect(`${key}=${String(value)}`).toBe(`${key}=false`);
    }
  });
});

// ── HP: groups expand into the keys they cover ─────────────────────────────

describe("permissionsFromGroups()", () => {
  it("HP: ORDERS switches on the counter capabilities", () => {
    const perms = permissionsFromGroups(["ORDERS"]);
    expect(perms.canCreateOrder).toBe(true);
    expect(perms.canConfirmPickup).toBe(true);
    expect(perms.canUpdateOrderStatus).toBe(true);
    // Discounts and cancels live inside Orders deliberately — a fifth toggle
    // would re-create the matrix this model exists to remove.
    expect(perms.canApplyDiscount).toBe(true);
    expect(perms.canCancelUnpaidOrder).toBe(true);
  });

  it("HP: an ungranted group stays off", () => {
    const perms = permissionsFromGroups(["ORDERS"]);
    expect(perms.canAddService).toBe(false);
    expect(perms.canEditInventory).toBe(false);
  });

  it("HP: INVENTORY covers products too — one question to an owner", () => {
    const perms = permissionsFromGroups(["INVENTORY"]);
    expect(perms.canEditInventory).toBe(true);
    expect(perms.canEditProduct).toBe(true);
  });

  it("SEC: no groups grants nothing", () => {
    expect(permissionsFromGroups([])).toEqual(ROLE_DEFAULTS.STAFF);
    expect(permissionsFromGroups(undefined)).toEqual(ROLE_DEFAULTS.STAFF);
  });

  it("SEC: staff management is never grantable through a group", () => {
    const all = permissionsFromGroups(PERMISSION_GROUP_KEYS);
    expect(all.canManageStaff).toBe(false);
    expect(all.canManageSettings).toBe(false);
  });
});

// ── HP: resolvePermissions merges overrides ────────────────────────────────

describe("resolvePermissions()", () => {
  it("HP: returns role defaults when no overrides", () => {
    const resolved = resolvePermissions("STAFF");
    expect(resolved).toEqual(ROLE_DEFAULTS.STAFF);
  });

  it("HP: override can grant a permission the baseline withholds", () => {
    const resolved = resolvePermissions("STAFF", { canApplyDiscount: true });
    expect(resolved.canApplyDiscount).toBe(true);
  });

  it("HP: override can revoke a granted permission", () => {
    const resolved = resolvePermissions("OWNER", { canViewTrueMargin: false });
    expect(resolved.canViewTrueMargin).toBe(false);
  });

  it("HP: unrelated permissions are not affected by override", () => {
    const resolved = resolvePermissions("STAFF", { canApplyDiscount: true });
    expect(resolved.canViewSalesReports).toBe(false); // still withheld
    expect(resolved.canCreateOrder).toBe(false);      // still withheld
  });

  it("HP: empty overrides object returns same as no overrides", () => {
    expect(resolvePermissions("OWNER", {})).toEqual(ROLE_DEFAULTS.OWNER);
  });

  it("HP: multiple overrides all applied", () => {
    const resolved = resolvePermissions("STAFF", {
      canCreateOrder:   true,
      canViewDashboard: true,
    });
    expect(resolved.canCreateOrder).toBe(true);
    expect(resolved.canViewDashboard).toBe(true);
    expect(resolved.canManageStaff).toBe(false); // non-overridden stays default
  });
});

// ── HP: can() helper ──────────────────────────────────────────────────────

describe("can()", () => {
  it("HP: returns true when permission is granted", () => {
    const perms = resolvePermissions("OWNER");
    expect(can(perms, "canManageStaff")).toBe(true);
  });

  it("HP: returns false when permission is denied", () => {
    const perms = resolvePermissions("STAFF");
    expect(can(perms, "canManageStaff")).toBe(false);
  });

  it("EC: returns false when permissions map is null", () => {
    expect(can(null, "canCreateOrder")).toBe(false);
  });

  it("EC: returns false when permissions map is undefined", () => {
    expect(can(undefined, "canCreateOrder")).toBe(false);
  });

  it("HP: works for every permission key without throwing", () => {
    const perms = resolvePermissions("OWNER");
    const ALL_KEYS: PermissionKey[] = [
      "canCreateOrder", "canApplyDiscount", "canCancelUnpaidOrder", "canCancelPaidOrder",
      "canConfirmPickup", "canViewServices", "canAddService", "canEditService", "canArchiveService",
      "canViewQueue", "canUpdateOrderStatus", "canViewDashboard", "canViewRevenue",
      "canViewSalesReports", "canExportReports", "canViewActivityLogs",
      "canViewCosting", "canManageCostingSetup", "canEnterUtilityReadings",
      "canSaveDailyCosting", "canEditSavedCosting", "canViewTrueMargin",
      "canManageStaff", "canManageSettings",
    ];
    for (const key of ALL_KEYS) {
      expect(() => can(perms, key)).not.toThrow();
      expect(can(perms, key)).toBe(true); // OWNER has all
    }
  });
});


