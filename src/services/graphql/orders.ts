// src/services/graphql/orders.ts
// GraphQL operations for the POS orders domain.

import { graphqlRequest } from "../../config/graphql";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export interface GqlOrderItem {
  type: string;
  serviceId?: string;
  serviceName?: string;
  serviceCode?: string;
  pricingType?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export type LaundryStatus = "pending" | "in_progress" | "ready" | "completed" | "claimed" | "cancelled" | "void";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type DiscountType = "flat" | "percentage";

export interface GqlOrder {
  _id: string;
  uid: string;
  branchId: string;
  claimCode: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: GqlOrderItem[];
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discount: number;
  totalAmount: number;
  laundryStatus: LaundryStatus;
  paymentStatus: PaymentStatus;
  notes?: string;
  fulfillmentType?: string;
  claimedBy?: string;
  estimatedReadyAt?: string;
  claimedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  transactions?: {
    _id: string;
    // Null on a REFUNDED record whose original payment transaction could not be
    // found — the BE records the refund rather than blocking it.
    paymentMethod: string | null;
    referenceId?: string;
    totalAmount: number;
    amountPaid: number;
    change: number;
    status: string;
  }[];
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface OrderItemInput {
  type: string;
  serviceId?: string;
  serviceName?: string;
  serviceCode?: string;
  pricingType?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  /** Required for type: "custom" — the ad-hoc price, since there's no Service/Product to derive it from. */
  unitPrice?: number;
}

export interface CreateOrderInput {
  branchId: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: OrderItemInput[];
  discountType?: DiscountType;
  discountValue?: number;
  notes?: string;
  fulfillmentType?: string;
  estimatedReadyAt?: string;
  idempotencyKey?: string;
}

export interface ProcessPaymentInput {
  paymentMethod: string;
  referenceId?: string;
  amountPaid: number;
}

export interface UpdateOrderDetailsInput {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
  estimatedReadyAt?: string;
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const ORDER_FIELDS = `
  _id uid branchId claimCode customerName customerPhone customerAddress
  items { type serviceId serviceName serviceCode pricingType productId productName quantity unitPrice subtotal }
  subtotal discountType discountValue discount totalAmount
  laundryStatus paymentStatus
  notes fulfillmentType claimedBy estimatedReadyAt claimedAt createdAt updatedAt
  transactions { _id paymentMethod referenceId totalAmount amountPaid change status }
`;

// ─── Normalisation ────────────────────────────────────────────────────────────
// BE schema uses uppercase enums (CLAIMED, PAID, COMPLETED, etc.).
// We normalise to lowercase here so all FE consumers use consistent values.

function normalizeOrder(o: GqlOrder): GqlOrder {
  return {
    ...o,
    laundryStatus: (o.laundryStatus ?? "pending").toLowerCase() as LaundryStatus,
    paymentStatus: (o.paymentStatus ?? "unpaid").toLowerCase() as PaymentStatus,
    transactions: (o.transactions ?? []).map(t => ({
      ...t,
      status: (t.status ?? "").toLowerCase(),
    })),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function gqlMyOrders(filter?: {
  branchId?: string;
  laundryStatus?: string;
  paymentStatus?: string;
  search?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  days?: number;
  limit?: number;
  offset?: number;
}): Promise<GqlOrder[]> {
  const { days, ...rest } = filter ?? {};
  const dateFrom = rest.dateFrom ?? (days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined);
  // Filter enum inputs must be uppercase to match BE schema
  const laundryStatus = rest.laundryStatus?.toUpperCase();
  const paymentStatus = rest.paymentStatus?.toUpperCase();
  const res = await graphqlRequest<{ myOrders: { data: GqlOrder[]; total: number } }>(`
    query MyOrders($filter: OrderFilterInput) {
      myOrders(filter: $filter) {
        data { ${ORDER_FIELDS} }
        total
      }
    }
  `, { filter: { limit: 100, ...rest, ...(laundryStatus ? { laundryStatus } : {}), ...(paymentStatus ? { paymentStatus } : {}), ...(dateFrom ? { dateFrom } : {}) } });
  return res.myOrders.data.map(normalizeOrder);
}

export async function gqlGetOrder(id: string): Promise<GqlOrder> {
  const res = await graphqlRequest<{ getOrder: GqlOrder }>(`
    query GetOrder($id: ID!) {
      getOrder(id: $id) { ${ORDER_FIELDS} }
    }
  `, { id });
  return normalizeOrder(res.getOrder);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function gqlCreateOrder(input: CreateOrderInput): Promise<GqlOrder> {
  const res = await graphqlRequest<{ createOrder: GqlOrder }>(`
    mutation CreateOrder($input: CreateOrderInput!) {
      createOrder(input: $input) { ${ORDER_FIELDS} }
    }
  `, { input });
  return normalizeOrder(res.createOrder);
}

export async function gqlProcessPayment(id: string, input: ProcessPaymentInput): Promise<GqlOrder> {
  const res = await graphqlRequest<{ processPayment: GqlOrder }>(`
    mutation ProcessPayment($id: ID!, $input: ProcessPaymentInput!) {
      processPayment(id: $id, input: $input) { ${ORDER_FIELDS} }
    }
  `, { id, input });
  return normalizeOrder(res.processPayment);
}

export async function gqlMarkOrderInProgress(id: string): Promise<GqlOrder> {
  const res = await graphqlRequest<{ markOrderInProgress: GqlOrder }>(`
    mutation MarkOrderInProgress($id: ID!) {
      markOrderInProgress(id: $id) { ${ORDER_FIELDS} }
    }
  `, { id });
  return normalizeOrder(res.markOrderInProgress);
}

export async function gqlMarkOrderReady(id: string): Promise<GqlOrder> {
  const res = await graphqlRequest<{ markOrderReady: GqlOrder }>(`
    mutation MarkOrderReady($id: ID!) {
      markOrderReady(id: $id) { ${ORDER_FIELDS} }
    }
  `, { id });
  return normalizeOrder(res.markOrderReady);
}

export async function gqlProcessPickup(id: string): Promise<GqlOrder> {
  const res = await graphqlRequest<{ processPickup: GqlOrder }>(`
    mutation ProcessPickup($id: ID!) {
      processPickup(id: $id) { ${ORDER_FIELDS} }
    }
  `, { id });
  return normalizeOrder(res.processPickup);
}

export async function gqlCancelOrder(id: string, reason?: string, restoreInventory?: boolean): Promise<GqlOrder> {
  const res = await graphqlRequest<{ cancelOrder: GqlOrder }>(`
    mutation CancelOrder($id: ID!, $reason: String, $restoreInventory: Boolean) {
      cancelOrder(id: $id, reason: $reason, restoreInventory: $restoreInventory) { ${ORDER_FIELDS} }
    }
  `, { id, reason, restoreInventory });
  return normalizeOrder(res.cancelOrder);
}

export async function gqlVoidOrder(id: string, reason?: string, restoreInventory?: boolean): Promise<GqlOrder> {
  const res = await graphqlRequest<{ voidOrder: GqlOrder }>(`
    mutation VoidOrder($id: ID!, $reason: String, $restoreInventory: Boolean) {
      voidOrder(id: $id, reason: $reason, restoreInventory: $restoreInventory) { ${ORDER_FIELDS} }
    }
  `, { id, reason, restoreInventory });
  return normalizeOrder(res.voidOrder);
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface GqlReceiptBranch {
  branchName: string;
  branchPhoneNumber: string;
  regionName: string;
  cityMunicipalityName: string;
  streetAddress: string;
}

export interface GqlReceiptTransaction {
  paymentMethod: string;
  referenceId?: string;
  totalAmount: number;
  amountPaid: number;
  change: number;
}

export interface GqlReceipt {
  orderId: string;
  claimCode: string;
  customerName?: string;
  processedBy: string;
  createdAt: string;
  branch: GqlReceiptBranch;
  items: GqlOrderItem[];
  subtotal: number;
  discountType?: DiscountType;
  discountValue?: number;
  discount: number;
  totalAmount: number;
  transactions: GqlReceiptTransaction[];
}

export async function gqlGetReceipt(orderId: string): Promise<GqlReceipt> {
  const res = await graphqlRequest<{ getReceipt: GqlReceipt }>(`
    query GetReceipt($orderId: ID!) {
      getReceipt(orderId: $orderId) {
        orderId claimCode customerName processedBy createdAt
        branch { branchName branchPhoneNumber regionName cityMunicipalityName streetAddress }
        items { type serviceId serviceName serviceCode pricingType productId productName quantity unitPrice subtotal }
        subtotal discountType discountValue discount totalAmount
        transactions { paymentMethod referenceId totalAmount amountPaid change }
      }
    }
  `, { orderId });
  return res.getReceipt;
}

export async function gqlUpdateOrderDetails(id: string, input: UpdateOrderDetailsInput): Promise<GqlOrder> {
  const res = await graphqlRequest<{ updateOrderDetails: GqlOrder }>(`
    mutation UpdateOrderDetails($id: ID!, $customerName: String, $customerPhone: String, $customerAddress: String, $notes: String, $estimatedReadyAt: DateTime) {
      updateOrderDetails(id: $id, customerName: $customerName, customerPhone: $customerPhone, customerAddress: $customerAddress, notes: $notes, estimatedReadyAt: $estimatedReadyAt) { ${ORDER_FIELDS} }
    }
  `, {
    id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerAddress: input.customerAddress,
    notes: input.notes,
    estimatedReadyAt: input.estimatedReadyAt,
  });
  return normalizeOrder(res.updateOrderDetails);
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface GqlTransaction {
  _id: string;
  orderId?: string;
  branchId?: string;
  paymentMethod: string;
  referenceId?: string;
  totalAmount: number;
  amountPaid: number;
  change: number;
  status: string;
  createdAt?: string;
}

export async function gqlMyTransactions(filter?: {
  branchId?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
}): Promise<GqlTransaction[]> {
  const res = await graphqlRequest<{ myTransactions: GqlTransaction[] }>(`
    query MyTransactions($filter: OrderFilterInput) {
      myTransactions(filter: $filter) {
        _id paymentMethod referenceId totalAmount amountPaid change status createdAt
      }
    }
  `, { filter: filter ?? {} });
  return res.myTransactions;
}
