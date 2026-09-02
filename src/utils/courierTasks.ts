// src/utils/courierTasks.ts
// Courier leg model shared by the whole (courier) stack. The task board, the
// map and History all read the same `myAssignedOnlineOrders` feed, so the rule
// for "what counts as one of my legs" lives here rather than in a screen — a
// leg means the same thing on every tab.
//
// A courier "task" = one leg (pickup or return) of an order assigned to me.
//   NEW       — leg assigned, not started (pickup_assigned / return_assigned)
//   ACTIVE    — en route or arrived
//   COMPLETED — my leg finished (custody handed over)

import { C } from "../theme/tokens";
import { courierLegFor } from "../stores/onlineOrdersStore";
import { customerExactAddressLine } from "../services/graphql/onlineOrders";
import type { GqlLegAssignment, GqlOnlineOrder } from "../services/graphql/onlineOrders";

export type CourierLeg = "PICKUP" | "RETURN";

// "Leg" is the internal model word — it never reaches the rider. On screen a
// task is simply a Pickup or a Return; the type alone is unambiguous.
export const LEG_LABEL: Record<CourierLeg, string> = {
  PICKUP: "Pickup",
  RETURN: "Return",
};

// Chip colours per leg, defined once so the task card, the map stop card and
// task-detail can't drift apart. Two identity colours rather than status ones:
// green/amber/red already mean completed / attention / failed elsewhere in the
// stack, and a leg type isn't a status.
//   PICKUP — courier sky, the stack's own accent
//   RETURN — purple, distinct at a glance without borrowing a status meaning
export const LEG_CHIP: Record<CourierLeg, { bg: string; fg: string }> = {
  PICKUP: { bg: C.courier100, fg: C.courier700 },
  RETURN: { bg: C.purple100, fg: C.purple700 },
};

export type Bucket = "NEW" | "ACTIVE" | "COMPLETED";

export const BUCKETS: readonly Bucket[] = ["NEW", "ACTIVE", "COMPLETED"];

export const BUCKET_LABEL: Record<Bucket, string> = {
  NEW: "New",
  ACTIVE: "Active",
  COMPLETED: "Completed",
};

export interface CourierLegTask {
  order: GqlOnlineOrder;
  leg: CourierLeg;
  bucket: Bucket;
}

// The active and completed feeds can both contain the same order — I finished
// its pickup and am now riding its return. deriveTasks() must see each order
// exactly once (it emits one task per order per call), so merge by _id before
// deriving. The active copy wins: it is the more recently fetched of the two.
export function mergeFeeds(
  active: GqlOnlineOrder[],
  completed: GqlOnlineOrder[],
): GqlOnlineOrder[] {
  if (completed.length === 0) return active;
  const byId = new Map(completed.map((o) => [o._id, o]));
  for (const o of active) byId.set(o._id, o);
  return [...byId.values()];
}

export function deriveTasks(orders: GqlOnlineOrder[], uid: string): CourierLegTask[] {
  const tasks: CourierLegTask[] = [];
  for (const o of orders) {
    const activeLeg = courierLegFor(o, uid);
    if (activeLeg) {
      const started =
        activeLeg === "PICKUP" ? !!o.pickupAssignment?.enRouteAt : !!o.returnAssignment?.enRouteAt;
      tasks.push({ order: o, leg: activeLeg, bucket: started ? "ACTIVE" : "NEW" });
      // No `continue` here. One courier often runs BOTH legs of an order, and
      // returning early meant that as soon as they were assigned the return,
      // the pickup they had already finished disappeared from their history.
      // The two legs are two separate tasks; having work left on one is not a
      // reason to un-complete the other. The completion checks below require a
      // `completedAt`, which the leg still being worked cannot have, so this
      // cannot double-count the active leg.
    }
    // Completed legs for history: my pickup leg done / my return leg done
    if (o.pickupAssignment?.assignedStaffUid === uid && o.pickupAssignment?.completedAt) {
      tasks.push({ order: o, leg: "PICKUP", bucket: "COMPLETED" });
    }
    if (o.returnAssignment?.assignedStaffUid === uid && o.returnAssignment?.completedAt) {
      tasks.push({ order: o, leg: "RETURN", bucket: "COMPLETED" });
    }
  }
  return tasks;
}

/**
 * The reference to SHOW a courier — the same one the customer is looking at.
 *
 * This used to derive `#LB-` + the last four of the mongo id, so a courier saw
 * "#LB-CAAE" for the order the customer knew as "#LB-000001". Two names for one
 * order, and neither side could quote the other's. The derived form survives
 * only as a fallback for orders created before numbering existed.
 */
export function orderRef(order: { _id: string; orderNumber?: string | null }): string {
  return order.orderNumber
    ? `#${order.orderNumber}`
    : `#LB-${order._id.slice(-4).toUpperCase()}`;
}

export function legAssignment(o: GqlOnlineOrder, leg: CourierLeg): GqlLegAssignment | null {
  return leg === "PICKUP" ? o.pickupAssignment : o.returnAssignment;
}

/** ISO timestamp the leg was closed out, or null if it hasn't been. */
export function legCompletedAt(t: CourierLegTask): string | null {
  return legAssignment(t.order, t.leg)?.completedAt ?? null;
}

/** Weight actually handled, falling back to the customer's estimate. */
export function legWeightKg(o: GqlOnlineOrder): number | null {
  return o.pricing.actualWeightKg ?? o.pricing.estimatedWeightKg;
}

/**
 * Cash this leg brought in. `paymentSummary` holds one amount for the whole
 * order, so it is credited to the leg that actually took the money — otherwise
 * a courier who worked both legs of an order would be counted twice.
 *
 * Which leg that is depends on when the customer paid (§14). Pay-now orders
 * collect at pickup; an order that deferred to final handover collects on the
 * return leg, and crediting it to pickup would put the money on a courier who
 * never touched it — often a different person entirely.
 */
export function legCollectedCentavos(t: CourierLegTask): number {
  const collected = t.order.paymentSummary.amountCollectedCentavos;
  if (collected == null) return 0;
  const collectingLeg =
    t.order.paymentTiming === "AT_FINAL_HANDOVER" ? "RETURN" : "PICKUP";
  return t.leg === collectingLeg ? collected : 0;
}

// ─── Redacted-location display (RISK-P0-009) ─────────────────────────────────
// customer.address/mapLocation resolve for the courier a leg is ASSIGNED to,
// from the moment it lands on their board and for good afterwards. Everyone
// else — including a courier on an order that was never theirs — gets the
// generalized areaLabel only.
//
// So on the courier stack this fallback should now be rare: the feed only
// returns orders assigned to that rider. It still fires on an order that
// carries no address at all, which is why the copy no longer promises the
// address will appear once the leg starts — it won't.

export const LOCATION_LOCKED_COPY = "No location on this order";

/**
 * Location line for task cards / stop cards / history rows: the exact address
 * while it's visible, the generalized area otherwise, and an explanatory
 * placeholder when not even an area label came back.
 */
export function taskLocationLine(o: GqlOnlineOrder): string {
  const exact = customerExactAddressLine(o);
  if (exact) return exact;
  return o.customer.areaLabel ?? LOCATION_LOCKED_COPY;
}

/** True when only the generalized area (or nothing) is visible. */
export function taskLocationRedacted(o: GqlOnlineOrder): boolean {
  return customerExactAddressLine(o) == null;
}
