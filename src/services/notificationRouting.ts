// src/services/notificationRouting.ts
// Where a notification leads.
//
// Extracted so the two ways of opening one — tapping the OS push, and tapping
// the row in the inbox — cannot disagree. They resolve the same table, so a
// notification always lands on the same screen however it was reached.
//
// Also keeps the routing decisions out of app/_layout.tsx, which is already
// well past the file-size the repo is trying to hold (see backlog F8).

import { useDeepLinkStore } from "../stores/deepLinkStore";
import type { UserRole } from "../stores/authStore";

/** The subset of an FCM data payload / feed row this needs to route. */
/**
 * Which half of the journey a courier row is about.
 *
 * Derived from the status rather than carried as its own field: the statuses
 * already name the leg unambiguously, and a second source would be one more
 * thing to keep in step.
 */
function legFromStatus(status?: string | null): "PICKUP" | "RETURN" | null {
  const s = (status ?? "").toLowerCase();
  if (!s) return null;
  if (s.startsWith("pickup") || s.startsWith("picked_up")) return "PICKUP";
  if (s.startsWith("return") || s.startsWith("deliver")) return "RETURN";
  return null;
}

export interface NotificationRouteData {
  type?: string | null;
  orderId?: string | null;
  /** Order status, e.g. 'pickup_assigned' — names the courier's leg. */
  status?: string | null;
  branchId?: string | null;
  providerId?: string | null;
}

/** The role's own notifications screen — every stack has one. */
export function notificationsRouteFor(role: UserRole | undefined): string {
  switch (role) {
    case "WASHER":
      return "/(washer)/notifications";
    case "COURIER":
      return "/(courier)/notifications";
    case "STAFF":
      return "/(staff)/notifications";
    default:
      return "/(tabs)/notifications";
  }
}

/**
 * The screen a notification should open, or null when the caller must do
 * something extra first (park a deep-link intent, pick a branch).
 *
 * Order notifications route per role because each stack shows orders its own
 * way: a courier gets the single task, a washer their order list, a merchant
 * the online-orders queue.
 */
export function routeForNotification(
  data: NotificationRouteData,
  role: UserRole | undefined
): string {
  const type = data.type ?? "";

  if (type === "ORDER_STATUS" || type === "ORDER_ACTION_NEEDED") {
    if (role === "COURIER") {
      // task-detail refuses to render without BOTH id and leg — it shows
      // "Task not found" for a missing leg exactly as it does for a missing
      // order, so a link carrying only the id looked like a deleted task.
      const leg = legFromStatus(data.status);
      return data.orderId && leg
        ? `/(courier)/task-detail?id=${encodeURIComponent(data.orderId)}&leg=${leg}`
        : // The courier task board is the `dashboard` route — it is LABELLED
          // "Tasks" in the tab bar, and `/(courier)/tasks` (which this used to
          // return) is not a route at all.
          "/(courier)/dashboard";
    }
    if (role === "WASHER") return "/(washer)/orders";
    // STAFF live in their own stack. Sending them to /(tabs)/online-orders -
    // which this used to do for every non-courier, non-washer role - would drop
    // them into the OWNER's workspace to read one screen, one navigation away
    // from wallet, payouts and branch settings.
    //
    // Whether they may READ it is not decided here: the screen checks the
    // branch grant and the backend re-checks it on every call. A notification
    // is a pointer, never proof of authorization - the grant can be withdrawn
    // between the send and the tap.
    if (role === "STAFF") return "/(staff)/online-orders";
    return "/(tabs)/online-orders";
  }

  if (type === "DEVICE_REGISTRATION") return "/(tabs)/settings";

  if (type === "KYC_REJECTED" || type === "KYC_APPROVED" || type === "KYC_CASE_ACTION_NEEDED") {
    return role === "WASHER" ? "/(washer)/verification" : "/(tabs)/settings";
  }

  // Activity Logs is where a sign-in actually appears. The hub, which this used
  // to return, only told the owner to go looking.
  if (type === "STAFF_LOGIN") return "/(tabs)/settings";

  // BROADCAST, SYSTEM, and anything a newer backend introduces: the inbox is
  // always a safe landing, and an unknown type must never dead-end the tap.
  return notificationsRouteFor(role);
}

/**
 * Everything a notification tap must do: park any intent the destination reads
 * from a store, then say where to go.
 *
 * ONE implementation because there are two entry points — a tapped push and a
 * tapped inbox row — and they had already drifted. The push handler parked the
 * intent and routed from `type`; the inbox row did neither, pushing the
 * server's `deepLink` straight into the router. That string ('/settings/devices')
 * is not a route this app has, so every device-approval row dead-ended on
 * "Unmatched Route".
 *
 * The server's deepLink is deliberately NOT consulted. One string cannot
 * address four apps with four different route trees, and the client is the only
 * thing that knows its own. Routing is decided here, from `type` and role.
 */
export function resolveNotificationTap(
  data: NotificationRouteData,
  role: UserRole | undefined
): string {
  const type = data.type ?? "";

  // Some destinations take their subject from a store rather than a route
  // param, so the intent has to be parked before we navigate.
  if (type === "STAFF_LOGIN") {
    useDeepLinkStore.getState().setSettingsView("activity");
  } else if (type === "DEVICE_REGISTRATION") {
    useDeepLinkStore
      .getState()
      .setDeviceApprovalBranch(data.branchId ? String(data.branchId) : "");
  } else if (
    (type === "KYC_REJECTED" ||
      type === "KYC_APPROVED" ||
      type === "KYC_CASE_ACTION_NEEDED") &&
    role !== "WASHER"
  ) {
    // Merchants verify per branch, and the notification names which one.
    useDeepLinkStore
      .getState()
      .setVerificationBranch(data.providerId ? String(data.providerId) : "");
  }

  return routeForNotification(data, role);
}
