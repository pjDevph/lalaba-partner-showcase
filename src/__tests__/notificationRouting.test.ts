// src/__tests__/notificationRouting.test.ts
// The routing table and the shared-terminal permission filter.
//
// Both are invisible when wrong: a bad route dead-ends a tap, and a bad filter
// either hides a row forever or shows a cashier the owner's inbox.

import {
  routeForNotification,
  notificationsRouteFor,
  resolveNotificationTap,
} from "../services/notificationRouting";
import { useDeepLinkStore } from "../stores/deepLinkStore";
import fs from "fs";
import path from "path";
import {
  BE_TO_FE_PERMISSIONS,
  FE_TO_BE_PERMISSIONS,
  canSeeBackendPermission,
  ROLE_DEFAULTS,
} from "../types/permissions";

describe("routeForNotification", () => {
  it("sends an order to the screen that role actually uses", () => {
    // The leg rides along: task-detail needs both, and asserting the id alone
    // is what let a link without a leg ship.
    expect(
      routeForNotification({ type: "ORDER_STATUS", orderId: "o1", status: "pickup_assigned" }, "COURIER"),
    ).toBe("/(courier)/task-detail?id=o1&leg=PICKUP");
    expect(routeForNotification({ type: "ORDER_STATUS" }, "WASHER"))
      .toBe("/(washer)/orders");
    expect(routeForNotification({ type: "ORDER_STATUS" }, "MERCHANT"))
      .toBe("/(tabs)/online-orders");
  });

  // task-detail renders "Task not found" when EITHER id or leg is missing, so a
  // link with only the id was indistinguishable from a deleted task — which is
  // exactly what a courier saw after being assigned a pickup.
  it("SEC: a courier order link carries the leg as well as the id", () => {
    const route = routeForNotification(
      { type: "ORDER_STATUS", orderId: "o1", status: "pickup_assigned" },
      "COURIER",
    );
    expect(route).toContain("id=o1");
    expect(route).toContain("leg=PICKUP");
  });

  it("HP: return-side statuses resolve to the RETURN leg", () => {
    for (const status of ["return_assigned", "return_en_route", "delivered_to_customer"]) {
      expect(
        routeForNotification({ type: "ORDER_STATUS", orderId: "o1", status }, "COURIER"),
      ).toContain("leg=RETURN");
    }
  });

  it("EC: an unrecognised status falls back to the board rather than a broken link", () => {
    // Better a list they can search than a screen that says the task is gone.
    expect(
      routeForNotification({ type: "ORDER_STATUS", orderId: "o1", status: "something_new" }, "COURIER"),
    ).toBe("/(courier)/dashboard");
  });

  it("falls back to the task board when a courier order row has no id", () => {
    // `dashboard`, not `tasks` — "Tasks" is the tab label; the route is
    // app/(courier)/dashboard.tsx. This asserted the label for a while, which
    // meant an id-less courier order row would have dead-ended.
    expect(routeForNotification({ type: "ORDER_ACTION_NEEDED" }, "COURIER"))
      .toBe("/(courier)/dashboard");
  });

  it("escapes the order id rather than splicing it into the path raw", () => {
    expect(
      routeForNotification({ type: "ORDER_STATUS", orderId: "a b&c", status: "pickup_assigned" }, "COURIER"),
    ).toBe("/(courier)/task-detail?id=a%20b%26c&leg=PICKUP");
  });

  it("routes a washer's KYC decision to their own verification screen", () => {
    expect(routeForNotification({ type: "KYC_REJECTED" }, "WASHER"))
      .toBe("/(washer)/verification");
    expect(routeForNotification({ type: "KYC_REJECTED" }, "MERCHANT"))
      .toBe("/(tabs)/settings");
  });

  it("lands an unknown type on the inbox instead of dead-ending the tap", () => {
    // A newer backend will introduce types this build has never heard of.
    expect(routeForNotification({ type: "SOMETHING_NEW" }, "WASHER"))
      .toBe("/(washer)/notifications");
    expect(routeForNotification({}, "MERCHANT")).toBe("/(tabs)/notifications");
  });

  it("gives every role an inbox route", () => {
    for (const role of ["MERCHANT", "STAFF", "WASHER", "COURIER"] as const) {
      expect(notificationsRouteFor(role)).toMatch(/^\/\(\w+\)\/notifications$/);
    }
    // An unresolved role must still land somewhere real.
    expect(notificationsRouteFor(undefined)).toBe("/(tabs)/notifications");
  });
});

describe("BE_TO_FE_PERMISSIONS", () => {
  it("is a faithful inverse of the forward map", () => {
    for (const [feKey, beNames] of Object.entries(FE_TO_BE_PERMISSIONS)) {
      for (const be of beNames ?? []) {
        expect(BE_TO_FE_PERMISSIONS[be]).toContain(feKey);
      }
    }
  });

  it("covers order_update_status — the permission the order feed gates on", () => {
    // If this name ever loses its reverse entry, every permission-scoped order
    // notification silently becomes visible to everyone.
    expect(BE_TO_FE_PERMISSIONS["order_update_status"]).toContain("canUpdateOrderStatus");
  });
});

describe("canSeeBackendPermission", () => {
  const staff = ROLE_DEFAULTS.STAFF;
  const owner = ROLE_DEFAULTS.OWNER;

  it("shows an ungated row to everyone", () => {
    expect(canSeeBackendPermission(staff, null)).toBe(true);
    expect(canSeeBackendPermission(null, null)).toBe(true);
  });

  it("gates a row on the mapped capability", () => {
    expect(canSeeBackendPermission(owner, "order_update_status")).toBe(true);
  });

  it("treats an unmapped BE name as ungated rather than hiding it forever", () => {
    // The server already filtered for the authenticated identity; this pass
    // only narrows. Failing closed on an unknown name would make a row the
    // backend deliberately sent invisible with no way to discover why.
    expect(canSeeBackendPermission(staff, "some_future_permission")).toBe(true);
  });
});

// ── The tap handler ──────────────────────────────────────────────────────────
// A device-approval row dead-ended on "Unmatched Route" because there were two
// implementations of one decision: the push handler parked the intent and
// routed from `type`, while the inbox row did neither and pushed the server's
// deepLink ('/settings/devices') — not a route this app has.

describe("staff never leave their own stack", () => {
  // (tabs) is the OWNER's workspace. A staff member sent there to read one
  // screen is one navigation from wallet, payouts and branch configuration.
  it("SEC: an order notification keeps STAFF inside (staff)", () => {
    for (const type of ["ORDER_STATUS", "ORDER_ACTION_NEEDED"]) {
      const route = routeForNotification({ type, orderId: "o1" }, "STAFF");
      expect(route.startsWith("/(staff)")).toBe(true);
    }
  });

  it("SEC: no notification type routes STAFF into (tabs)", () => {
    // STAFF_LOGIN is addressed to the owner, so it is absent here by design -
    // if a future type starts reaching staff, this catches it landing wrong.
    for (const type of ["ORDER_STATUS", "ORDER_ACTION_NEEDED", "BROADCAST", ""]) {
      expect(routeForNotification({ type }, "STAFF")).not.toContain("/(tabs)");
    }
  });

  it("HP: the merchant still gets the owner's own screen", () => {
    expect(routeForNotification({ type: "ORDER_STATUS" }, "MERCHANT")).toBe(
      "/(tabs)/online-orders",
    );
  });
});

describe("resolveNotificationTap", () => {
  beforeEach(() => {
    useDeepLinkStore.setState({
      deviceApprovalBranchId: null,
      verificationBranchId: null,
    });
  });

  it("HP: a device registration parks the branch AND routes to settings", () => {
    // Settings only opens the Devices screen when this intent is present, so
    // routing without parking lands on the hub and the owner never sees the
    // pending device they tapped.
    const target = resolveNotificationTap(
      { type: "DEVICE_REGISTRATION", branchId: "b1" },
      "MERCHANT",
    );
    expect(target).toBe("/(tabs)/settings");
    expect(useDeepLinkStore.getState().deviceApprovalBranchId).toBe("b1");
  });

  it("HP: a merchant KYC decision parks the branch it was about", () => {
    const target = resolveNotificationTap(
      { type: "KYC_APPROVED", providerId: "p1" },
      "MERCHANT",
    );
    expect(target).toBe("/(tabs)/settings");
    expect(useDeepLinkStore.getState().verificationBranchId).toBe("p1");
  });

  it("EC: a washer KYC decision parks nothing — she has one profile", () => {
    resolveNotificationTap({ type: "KYC_APPROVED", providerId: "p1" }, "WASHER");
    expect(useDeepLinkStore.getState().verificationBranchId).toBeNull();
  });

  it("SEC: never returns an empty route, whatever the type", () => {
    // The dead-end this replaces rendered as lalaba-merchant:/// — an empty
    // path. Any type, known or not, must resolve somewhere real.
    for (const type of [
      "DEVICE_REGISTRATION",
      "KYC_APPROVED",
      "ORDER_STATUS",
      "BROADCAST",
      "SOMETHING_A_NEWER_BACKEND_SENDS",
      "",
    ]) {
      const target = resolveNotificationTap({ type }, "MERCHANT");
      expect(target.startsWith("/(")).toBe(true);
    }
  });

  it("HP: agrees with routeForNotification — one decision, not two", () => {
    for (const type of ["DEVICE_REGISTRATION", "ORDER_STATUS", "BROADCAST"]) {
      expect(resolveNotificationTap({ type }, "MERCHANT")).toBe(
        routeForNotification({ type }, "MERCHANT"),
      );
    }
  });
});

// ── Every destination must be a real route ───────────────────────────────────
// Two dead-ends shipped because a routing string named a screen that did not
// exist: the server's '/settings/devices', and '/(courier)/tasks' (the courier
// board is the `dashboard` route; "Tasks" is only its tab LABEL). Neither is
// catchable by reading the table — both look perfectly plausible. So the table
// is checked against the filesystem instead.

describe("every routed destination exists", () => {
  const appDir = path.join(__dirname, "..", "..", "app");

  /** "/(tabs)/settings?view=x" -> app/(tabs)/settings.tsx */
  const routeExists = (route: string): boolean => {
    const clean = route.split("?")[0].replace(/^\//, "");
    return (
      fs.existsSync(path.join(appDir, `${clean}.tsx`)) ||
      fs.existsSync(path.join(appDir, clean, "index.tsx"))
    );
  };

  const ROLES = ["MERCHANT", "STAFF", "WASHER", "COURIER"] as const;
  const TYPES = [
    "ORDER_STATUS",
    "ORDER_ACTION_NEEDED",
    "DEVICE_REGISTRATION",
    "KYC_APPROVED",
    "KYC_REJECTED",
    "KYC_CASE_ACTION_NEEDED",
    "STAFF_LOGIN",
    "BROADCAST",
    "UNKNOWN_FUTURE_TYPE",
  ];

  it("HP: for every type and role, with and without an orderId", () => {
    const broken: string[] = [];
    for (const role of ROLES) {
      for (const type of TYPES) {
        for (const data of [{ type }, { type, orderId: "o1" }]) {
          const route = routeForNotification(data, role);
          if (!routeExists(route)) broken.push(`${role}/${type} -> ${route}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("HP: the inbox route exists for every role", () => {
    for (const role of ROLES) {
      expect(routeExists(notificationsRouteFor(role))).toBe(true);
    }
    expect(routeExists(notificationsRouteFor(undefined))).toBe(true);
  });
});
