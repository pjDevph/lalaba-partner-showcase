// src/services/api/posOrders.ts
// POS order operations — delegates to GraphQL backend.

import {
  gqlMarkOrderInProgress,
  gqlMarkOrderReady,
  gqlProcessPickup,
  type LaundryStatus,
} from "../graphql/orders";
import type {
  AdvanceStatusResponse,
  ClaimOrderResponse,
  POSStatus,
} from "../../types/pos.types";

// Map BE laundryStatus → FE POSStatus enum
function toFEStatus(s: LaundryStatus): POSStatus {
  if (s === "in_progress") return "PROCESSING";
  if (s === "ready")       return "READY_FOR_PICKUP";
  if (s === "completed")   return "CLAIMED";
  return "CREATED"; // pending | cancelled | void → CREATED (fallback)
}

export async function advancePOSStatus(
  orderId: string,
  currentStatus: POSStatus,
): Promise<AdvanceStatusResponse> {
  let order;
  if (currentStatus === "CREATED") {
    order = await gqlMarkOrderInProgress(orderId);
  } else if (currentStatus === "PROCESSING") {
    order = await gqlMarkOrderReady(orderId);
  } else {
    throw new Error(`Cannot advance from status: ${currentStatus}`);
  }
  return { orderId: order._id, status: toFEStatus(order.laundryStatus) };
}

export async function claimPOSOrder(
  orderId: string,
  _claimCode: string,
): Promise<ClaimOrderResponse> {
  const order = await gqlProcessPickup(orderId);
  return {
    orderId:     order._id,
    status:      "CLAIMED",
    totalAmount: order.totalAmount,
    changeGiven: 0,
  };
}
