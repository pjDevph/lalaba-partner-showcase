// src/features/staff/staffNav.ts
//
// ONE definition of where a staff member can go, and what it takes to get
// there. Every surface that asks "may they see this?" reads from here.
//
// There were three answers to that question before this file, and two of them
// already disagreed: the nav showed Orders to anyone holding ANY of three
// order permissions, while the route itself required canCreateOrder
// specifically. A staff member with a partial grant — which the backfill
// migration's --exact mode can produce — would see the tab and then be refused
// by the screen behind it.
//
// The surfaces that must agree:
//   • the portrait bottom tabs
//   • the landscape sidebar
//   • the WORK section of More
//   • the route guard on each screen
//
// None of this is a security boundary. The backend re-checks the branch grant
// on every call; this decides what is worth SHOWING, so that a visible control
// always works.

import { can, type PermissionKey, type PermissionMap } from "../../types/permissions";

export type StaffDestination =
  | "pos"
  | "online-orders"
  | "chat"
  | "inventory"
  | "services"
  | "products"
  | "sales"
  | "activity"
  | "profile";

interface StaffDestinationDef {
  /** Route to push. Matches the file under app/(staff). */
  route: string;
  /** Shown in the WORK list; tabs and sidebar carry their own labels. */
  label: string;
  subtitle: string;
  /**
   * Holding ANY of these opens the destination. Empty means unrestricted —
   * POS and More are every staff member's baseline.
   *
   * Order permissions are listed as a set rather than a single key because the
   * Orders group grants all of them together; requiring one specific key would
   * lock out a partial grant that can still legitimately do the job.
   */
  permissions: readonly PermissionKey[];
}

const ORDER_KEYS: readonly PermissionKey[] = [
  "canCreateOrder",
  "canConfirmPickup",
  "canUpdateOrderStatus",
];

export const STAFF_DESTINATIONS: Readonly<
  Record<StaffDestination, StaffDestinationDef>
> = {
  pos: {
    route: "/(staff)/pos",
    label: "POS",
    subtitle: "Take an order",
    permissions: [],
  },
  "online-orders": {
    route: "/(staff)/online-orders",
    label: "Orders",
    subtitle: "Marketplace pickups & deliveries",
    permissions: ORDER_KEYS,
  },
  // Customer messaging rides on the Orders grant: the thread exists to service
  // an order. Kept as its own destination rather than an alias so a separate
  // Chat permission later is a one-line change here, not a refactor of every
  // navigation surface.
  chat: {
    route: "/(staff)/chat",
    label: "Chat",
    subtitle: "Customer messages",
    permissions: ORDER_KEYS,
  },
  inventory: {
    route: "/(staff)/inventory",
    label: "Inventory",
    subtitle: "Stock levels",
    permissions: ["canAddInventory", "canEditInventory", "canArchiveInventory"],
  },
  services: {
    route: "/(staff)/services",
    label: "Services",
    subtitle: "Branch services",
    permissions: [
      "canViewServices",
      "canAddService",
      "canEditService",
      "canArchiveService",
    ],
  },
  products: {
    route: "/(staff)/products",
    label: "Products",
    subtitle: "Retail products",
    permissions: ["canAddProduct", "canEditProduct", "canArchiveProduct"],
  },
  sales: {
    route: "/(staff)/sales",
    label: "Reports",
    subtitle: "Sales figures",
    permissions: ["canViewSalesReports", "canExportReports"],
  },
  activity: {
    route: "/(staff)/activity",
    label: "Activity",
    subtitle: "Your work history",
    permissions: ["canViewActivityLogs"],
  },
  profile: {
    route: "/(staff)/profile",
    label: "More",
    subtitle: "Tools, account and support",
    permissions: [],
  },
};

/** May this permission map reach that destination? */
export function canAccessStaffDestination(
  perms: PermissionMap | null,
  destination: StaffDestination,
): boolean {
  const def = STAFF_DESTINATIONS[destination];
  if (!def) return false;
  if (def.permissions.length === 0) return true;
  return def.permissions.some((k) => can(perms, k));
}

/** The WORK rows of More, in display order, filtered to what is granted. */
export const WORK_DESTINATIONS: readonly StaffDestination[] = [
  "inventory",
  "services",
  "products",
  "sales",
  "activity",
];

export function grantedWorkDestinations(
  perms: PermissionMap | null,
): StaffDestination[] {
  return WORK_DESTINATIONS.filter((d) => canAccessStaffDestination(perms, d));
}
