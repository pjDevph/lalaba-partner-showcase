// src/stores/onlineOrdersStore.ts
// Shared store for the online-orders domain, used by two role stacks:
//   • provider slice (washer/merchant): incoming orders for a branch + lifecycle
//     actions (accept → assign pickup → mark ready → assign return)
//   • courier slice: legs assigned to me + leg actions (start route → arrive →
//     record pickup / record delivery)
// Refresh cadence is owned by the screens via usePoll() (focus + foreground
// gated, no overlapping requests) — the store only exposes the fetchers. It
// used to own module-level intervals, but with several screens sharing one
// timer variable whichever screen unmounted last silently killed polling for
// the others.

import { create } from "zustand";
import { errField } from "../utils/userError";
import {
  type GqlOnlineOrder,
  type GqlStaffLite,
  gqlIncomingOnlineOrders,
  gqlAcceptOnlineOrder,
  gqlAssignPickupStaff,
  gqlMarkLaundryReady,
  gqlAssignReturnStaff,
  gqlAssignableCouriers,
  gqlMyAssignedOnlineOrders,
  gqlStartPickupRoute,
  gqlArriveAtPickup,
  gqlRecordPickupWeight,
  gqlRecordPickupPayment,
  gqlStartReturnRoute,
  gqlArriveAtReturn,
  gqlRecordDelivery,
  gqlReceiveOrderAtCounter,
  gqlVerifySelfPickup,
  type CollectionInput,
  type RecordPickupWeightInput,
  type RecordPickupPaymentInput,
} from "../services/graphql/onlineOrders";

/** Cadence for the online-orders lists. Screens pass this to usePoll(). */
export const ONLINE_ORDERS_POLL_MS = 15_000;

/**
 * A courier's leg is done once the order reaches one of these. Used to split
 * `myAssignedOnlineOrders` into the active feed and the history screen.
 *
 * Client-side because the BE query takes no scope argument on this line. When
 * `CourierTaskScope` lands server-side, pass the scope instead and delete this
 * — filtering here means the history screen only ever sees what the assigned
 * query already returns.
 */
const COURIER_TERMINAL_STATUSES = new Set(["delivered_to_customer", "completed", "cancelled"]);

interface OnlineOrdersState {
  // ── Provider ────────────────────────────────────────────────────────────────
  incoming: GqlOnlineOrder[];
  couriers: GqlStaffLite[];
  isLoadingIncoming: boolean;
  fetchIncoming: (branchId: string) => Promise<void>;
  loadCouriers: (branchId: string) => Promise<void>;
  accept: (orderId: string) => Promise<GqlOnlineOrder>;
  assignPickup: (orderId: string, staffUid: string) => Promise<GqlOnlineOrder>;
  markReady: (orderId: string) => Promise<GqlOnlineOrder>;
  assignReturn: (orderId: string, staffUid: string) => Promise<GqlOnlineOrder>;

  // ── Courier ────────────────────────────────────────────────────────────────
  // Two slices, deliberately fetched at different rates. `myLegs` is the live
  // board — small, changes every few seconds, polled at ONLINE_ORDERS_POLL_MS.
  // `myCompletedLegs` is finished work — large (up to a week of orders) and
  // effectively immutable, so it loads on focus and pull-to-refresh only.
  // Polling one feed for both meant re-downloading the whole week every 15s.
  myLegs: GqlOnlineOrder[];
  myCompletedLegs: GqlOnlineOrder[];
  isLoadingLegs: boolean;
  isLoadingCompletedLegs: boolean;
  completedLegsLoaded: boolean;
  fetchAssigned: () => Promise<void>;
  fetchCompletedLegs: (uid: string) => Promise<void>;
  startPickup: (orderId: string) => Promise<GqlOnlineOrder>;
  arrivePickup: (orderId: string) => Promise<GqlOnlineOrder>;
  // Weigh/count each line + finalize pricing (pickup_arrived → pickup_weighed).
  // No payment here — the customer sees the confirmed price before the
  // courier collects anything.
  recordPickupWeight: (orderId: string, input: RecordPickupWeightInput) => Promise<GqlOnlineOrder>;
  // Collect (or defer) payment once weighed (pickup_weighed → onward).
  // tenderedCentavos: cash handed over at the doorstep, so the BE can compute
  // change (GAP-H-017). Resolves to the updated order for its paymentSummary.
  recordPickupPayment: (orderId: string, input: RecordPickupPaymentInput) => Promise<GqlOnlineOrder>;
  startReturn: (orderId: string) => Promise<GqlOnlineOrder>;
  arriveReturn: (orderId: string) => Promise<GqlOnlineOrder>;
  recordDelivery: (orderId: string, input?: CollectionInput) => Promise<GqlOnlineOrder>;
  // Counter-side twins of the two courier collection points, for orders the
  // customer drops off and/or collects themselves.
  receiveAtCounter: (orderId: string, input: CollectionInput) => Promise<GqlOnlineOrder>;
  verifySelfPickup: (orderId: string, input?: CollectionInput) => Promise<GqlOnlineOrder>;

  error: string | null;
  clearError: () => void;
}

export const useOnlineOrdersStore = create<OnlineOrdersState>((set) => {
  // Replace one order in whichever list(s) hold it.
  const patch = (updated: GqlOnlineOrder) =>
    set((s) => ({
      incoming: s.incoming.map((o) => (o._id === updated._id ? updated : o)),
      myLegs: s.myLegs.map((o) => (o._id === updated._id ? updated : o)),
      myCompletedLegs: s.myCompletedLegs.map((o) => (o._id === updated._id ? updated : o)),
    }));

  // Returns the updated order as well as patching it into the list: the courier
  // pickup flow needs the server-computed paymentSummary (change due) straight
  // back, and reading it out of the patched list would race. Callers that don't
  // need it can keep ignoring the return value.
  const wrap = async (fn: () => Promise<GqlOnlineOrder>): Promise<GqlOnlineOrder> => {
    try {
      const updated = await fn();
      patch(updated);
      set({ error: null });
      return updated;
    } catch (e: unknown) {
      set({ error: errField(e, "message") ?? "Request failed" });
      throw e;
    }
  };

  return {
    incoming: [],
    couriers: [],
    isLoadingIncoming: false,
    myLegs: [],
    myCompletedLegs: [],
    isLoadingLegs: false,
    isLoadingCompletedLegs: false,
    completedLegsLoaded: false,
    error: null,
    clearError: () => set({ error: null }),

    // ── Provider ──────────────────────────────────────────────────────────────
    fetchIncoming: async (branchId) => {
      set({ isLoadingIncoming: true });
      try {
        const incoming = await gqlIncomingOnlineOrders(branchId);
        set({ incoming, error: null });
      } catch (e: unknown) {
        // Record it, don't just log it. This swallowed a Forbidden for every
        // staff member — the backend refused the query and the screen showed
        // "You're all caught up", which reads as "no orders" rather than
        // "you couldn't load them". A silent catch on the one call a screen
        // exists to make hides the outage it's meant to survive.
        console.warn("[onlineOrders] fetchIncoming failed:", errField(e, "message"));
        set({ error: errField(e, "message") ?? "Couldn't load orders" });
      } finally {
        set({ isLoadingIncoming: false });
      }
    },
    loadCouriers: async (branchId: string) => {
      try {
        set({ couriers: await gqlAssignableCouriers(branchId) });
      } catch (e: unknown) {
        console.warn("[onlineOrders] loadCouriers failed:", errField(e, "message"));
      }
    },
    accept: (id) => wrap(() => gqlAcceptOnlineOrder(id)),
    assignPickup: (id, uid) => wrap(() => gqlAssignPickupStaff(id, uid)),
    markReady: (id) => wrap(() => gqlMarkLaundryReady(id)),
    assignReturn: (id, uid) => wrap(() => gqlAssignReturnStaff(id, uid)),

    // ── Courier ───────────────────────────────────────────────────────────────
    fetchAssigned: async () => {
      set({ isLoadingLegs: true });
      try {
        // No scope argument: the BE's `myAssignedOnlineOrders` takes none on
        // this line (CourierTaskScope does not exist there yet), and sending
        // one fails GraphQL validation — which would empty the whole feed, not
        // just the filter. Split the single response instead.
        const all = await gqlMyAssignedOnlineOrders();
        set({ myLegs: all.filter((o) => !COURIER_TERMINAL_STATUSES.has(o.status)), error: null });
      } catch (e: unknown) {
        console.warn("[onlineOrders] fetchAssigned failed:", errField(e, "message"));
      } finally {
        set({ isLoadingLegs: false });
      }
    },
    fetchCompletedLegs: async (uid: string) => {
      set({ isLoadingCompletedLegs: true });
      try {
        const all = await gqlMyAssignedOnlineOrders();
        set({
          // By LEG, not by order status. `COURIER_TERMINAL_STATUSES` describes
          // the order finishing; a courier's leg finishes much earlier, so this
          // filter dropped every completed pickup on an order still in the wash
          // and History showed 0 while the Tasks tab showed the same leg under
          // Completed.
          myCompletedLegs: all.filter((o) => hasCompletedLegFor(o, uid)),
          completedLegsLoaded: true,
          error: null,
        });
      } catch (e: unknown) {
        console.warn("[onlineOrders] fetchCompletedLegs failed:", errField(e, "message"));
      } finally {
        set({ isLoadingCompletedLegs: false });
      }
    },
    startPickup: (id) => wrap(() => gqlStartPickupRoute(id)),
    arrivePickup: (id) => wrap(() => gqlArriveAtPickup(id)),
    recordPickupWeight: (id, input) => wrap(() => gqlRecordPickupWeight(id, input)),
    recordPickupPayment: (id, input) => wrap(() => gqlRecordPickupPayment(id, input)),
    startReturn: (id) => wrap(() => gqlStartReturnRoute(id)),
    arriveReturn: (id) => wrap(() => gqlArriveAtReturn(id)),
    recordDelivery: (id, input) => wrap(() => gqlRecordDelivery(id, input)),
    receiveAtCounter: (id, input) => wrap(() => gqlReceiveOrderAtCounter(id, input)),
    verifySelfPickup: (id, input) => wrap(() => gqlVerifySelfPickup(id, input)),
  };
});

// ─── Status helpers shared by washer + courier screens ────────────────────────

/**
 * Does this courier have a finished leg on this order?
 *
 * The history feed's filter, and it asks about the LEG rather than the order.
 * A courier's pickup is done the moment custody changes hands; the order then
 * goes on to be washed, folded and delivered, often for another day or two.
 * History used to filter on the ORDER reaching a terminal status, so every
 * completed pickup stayed hidden until the whole order closed and a courier
 * who had worked all morning saw "No completed tasks yet".
 */
export function hasCompletedLegFor(o: GqlOnlineOrder, uid: string): boolean {
  return (
    (o.pickupAssignment?.assignedStaffUid === uid &&
      !!o.pickupAssignment?.completedAt) ||
    (o.returnAssignment?.assignedStaffUid === uid &&
      !!o.returnAssignment?.completedAt)
  );
}

// Which leg (if any) of this order belongs to the given courier uid, given the
// current status. An order appears once per active leg.
export function courierLegFor(o: GqlOnlineOrder, uid: string): "PICKUP" | "RETURN" | null {
  const pickupPhase = ["pickup_assigned", "pickup_en_route", "pickup_arrived", "pickup_weighed"];
  const returnPhase = ["return_assigned", "return_en_route", "return_arrived"];
  if (o.pickupAssignment?.assignedStaffUid === uid && pickupPhase.includes(o.status)) return "PICKUP";
  if (o.returnAssignment?.assignedStaffUid === uid && returnPhase.includes(o.status)) return "RETURN";
  return null;
}

export const STATUS_LABEL: Record<string, string> = {
  pending_provider_acceptance: "New request",
  accepted_by_provider: "Accepted",
  awaiting_pickup_assignment: "Assign pickup courier",
  pickup_assigned: "Courier assigned",
  pickup_en_route: "Courier en route",
  pickup_arrived: "Courier at customer",
  pickup_weighed: "Weighed — awaiting payment",
  picked_up_from_customer: "Picked up",
  received_by_provider: "Received",
  laundry_in_progress: "In progress",
  laundry_ready: "Ready",
  awaiting_return_assignment: "Assign return courier",
  return_assigned: "Return assigned",
  return_en_route: "Return en route",
  return_arrived: "Courier at customer",
  delivered_to_customer: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  // The tail of the enum was missing, so these leaked the raw value into the
  // status chip — a provider saw "laundry_quality_" (truncated) instead of a
  // label. statusLabel() falls back to the raw string, which is only a safety
  // net for values this app genuinely does not know about.
  laundry_quality_hold: "Quality hold",
  awaiting_return_selection: "Choosing return",
  awaiting_pickup_reschedule: "Reschedule pickup",
  pickup_attempt_failed: "Pickup failed",
  delivery_attempted: "Delivery failed",
  returned_to_provider: "Back at shop",
  awaiting_redelivery_selection: "Schedule redelivery",
  redelivery_scheduled: "Redelivery scheduled",
  awaiting_customer_pickup: "Ready for self-pickup",
  customer_pickup_verified: "Collected by customer",
  provider_change_proposed: "Change proposed",
  rejected_by_provider: "Declined",
  refunded: "Refunded",
  disputed: "Disputed",
  abandoned_unsettled: "Unpaid — written off",
  draft: "Draft",
  pricing_validated: "Pricing validated",
};
