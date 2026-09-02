// src/services/queueService.ts
// POS queue loader — fetches gqlMyOrders once per subscription.
// Public API (subscribeToQueue → returns unsubscribe fn) is unchanged so callers need no changes.
//
// No background polling: the queue refreshes on focus only. useQueueSubscription
// re-runs (and thus calls this again) whenever the POS tab regains focus or the
// branch changes, so a single fetch per call is all that's needed.

import { gqlMyOrders, type GqlOrder } from "./graphql/orders";
import type { POSOrder } from "../types/pos.types";

export interface QueueSubscriptionOptions {
  merchantId:  string;
  branchId?:   string | null;
  fromDate?:   Date;
}

export interface QueueCallbacks {
  onData:  (orders: POSOrder[]) => void;
  onError: (err: Error) => void;
}

function beStatusToFE(s: string): POSOrder["status"] {
  const low = s?.toLowerCase() ?? "";
  if (low === "in_progress") return "PROCESSING";
  if (low === "ready")       return "READY_FOR_PICKUP";
  if (low === "completed")   return "CLAIMED";
  if (low === "claimed")     return "CLAIMED";
  if (low === "cancelled")   return "CANCELLED";
  if (low === "void")        return "VOID";
  return "CREATED";
}

function toTimestamp(iso?: string): { seconds: number; nanoseconds: number } {
  const ms = iso ? new Date(iso).getTime() : Date.now();
  return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
}

export function gqlOrderToPOS(o: GqlOrder): POSOrder {
  return {
    id:            o._id,
    merchantId:    o.uid,
    branchId:      o.branchId,
    staffId:       "",
    orderSource:   "POS" as const,
    status:        beStatusToFE(o.laundryStatus),
    walkinCustomer: {
      name:    o.customerName,
      phone:   o.customerPhone,
      address: o.customerAddress,
    },
    items: (o.items ?? []).map((i) => ({
      serviceId:   i.serviceId ?? i.productId ?? "",
      serviceName: i.type === "product" ? (i.productName ?? "") : (i.serviceName ?? ""),
      pricingType: i.pricingType,
      weightKg:    i.quantity,
      unitPrice:   i.unitPrice,
      lineTotal:   i.subtotal,
      type:        i.type as "service" | "product" | undefined,
      productId:   i.productId,
      productName: i.productName,
    })),
    subtotal:       o.subtotal,
    discountAmount: o.discountValue ?? 0,
    discountCode:   undefined,
    totalAmount:    o.totalAmount,
    paymentMethod:  ((o.transactions ?? []).find(t => t.status === "completed")?.paymentMethod?.toUpperCase() ?? "CASH") as any,
    paymentStatus:  (o.paymentStatus ?? "unpaid") as any,
    amountReceived: (o.transactions ?? []).filter(t => t.status === "completed").reduce((s, t) => s + t.amountPaid, 0),
    changeGiven:    (o.transactions ?? []).find(t => t.status === "completed")?.change ?? 0,
    claimCode:      o.claimCode,
    fulfillmentType: (o.fulfillmentType?.toUpperCase() ?? "PICKUP") as "PICKUP" | "DELIVERY",
    notes:          o.notes,
    estimatedReadyAt: o.estimatedReadyAt,
    createdAt:      toTimestamp(o.createdAt),
    updatedAt:      toTimestamp(o.updatedAt),
    claimedAt:      o.claimedAt ? toTimestamp(o.claimedAt) : undefined,
  };
}

export function subscribeToQueue(
  options:   QueueSubscriptionOptions,
  callbacks: QueueCallbacks,
): () => void {
  const { branchId } = options;
  const { onData, onError } = callbacks;
  let active = true;

  // Single fetch — no background polling. The `active` guard drops the result
  // if the caller unsubscribed (tab blurred / branch changed) before it landed.
  const fetchOnce = async () => {
    try {
      const orders = await gqlMyOrders({
        branchId: branchId ?? undefined,
        dateFrom: options.fromDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 100,
      });
      if (!active) return;
      onData(orders.map(gqlOrderToPOS));
    } catch (err) {
      if (active) onError(err instanceof Error ? err : new Error("Failed to load orders"));
    }
  };

  void fetchOnce();

  return () => {
    active = false;
  };
}

export function subscribeToDateRange(
  options:   QueueSubscriptionOptions & { toDate: Date },
  callbacks: QueueCallbacks,
): () => void {
  return subscribeToQueue(options, callbacks);
}
