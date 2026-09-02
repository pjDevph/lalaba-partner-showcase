import {
  STAFF_DESTINATIONS,
  WORK_DESTINATIONS,
  canAccessStaffDestination,
  grantedWorkDestinations,
  type StaffDestination,
} from "../staffNav";
import { ROLE_DEFAULTS, permissionsFromGroups } from "../../../types/permissions";

// This file exists because the surfaces DID drift. The nav showed Orders to
// anyone holding any of three order permissions while the route behind it
// required canCreateOrder, so a partial grant — which the backfill migration's
// --exact mode can produce — showed a tab that then refused.

const NONE = ROLE_DEFAULTS.STAFF; // the baseline grants nothing

describe("staff navigation definition", () => {
  it("HP: POS and More are every staff member's baseline", () => {
    expect(canAccessStaffDestination(NONE, "pos")).toBe(true);
    expect(canAccessStaffDestination(NONE, "profile")).toBe(true);
  });

  it("SEC: everything else is withheld without a grant", () => {
    const gated = (Object.keys(STAFF_DESTINATIONS) as StaffDestination[]).filter(
      (d) => d !== "pos" && d !== "profile",
    );
    for (const d of gated) {
      expect(canAccessStaffDestination(NONE, d)).toBe(false);
    }
  });

  it("HP: the Orders group opens orders and chat together", () => {
    const perms = permissionsFromGroups(["ORDERS"]);
    expect(canAccessStaffDestination(perms, "online-orders")).toBe(true);
    expect(canAccessStaffDestination(perms, "chat")).toBe(true);
  });

  it("HP: a PARTIAL order grant still opens both — the drift case", () => {
    // Exactly what --exact leaves behind: confirm-pickup without create-order.
    const partial = { ...ROLE_DEFAULTS.STAFF, canConfirmPickup: true };
    expect(canAccessStaffDestination(partial, "online-orders")).toBe(true);
    expect(canAccessStaffDestination(partial, "chat")).toBe(true);
  });

  it("SEC: Orders does not leak into the WORK tools", () => {
    const perms = permissionsFromGroups(["ORDERS"]);
    expect(grantedWorkDestinations(perms)).toEqual([]);
  });

  it("HP: Inventory opens the stock tools and nothing else", () => {
    const perms = permissionsFromGroups(["INVENTORY"]);
    expect(grantedWorkDestinations(perms)).toEqual(["inventory", "products"]);
  });

  it("HP: WORK rows keep a stable display order", () => {
    const all = permissionsFromGroups(["ORDERS", "INVENTORY", "SERVICES", "OTHERS"]);
    expect(grantedWorkDestinations(all)).toEqual([...WORK_DESTINATIONS]);
  });

  it("SEC: every destination names a route under app/(staff)", () => {
    for (const d of Object.keys(STAFF_DESTINATIONS) as StaffDestination[]) {
      expect(STAFF_DESTINATIONS[d].route.startsWith("/(staff)/")).toBe(true);
    }
  });
});
