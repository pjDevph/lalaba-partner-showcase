// src/types/pos.types.ts
// Shared POS types for the merchant app (mirrors posOrders.controller.ts)

import { C } from "../theme/tokens";

export type POSStatus = "CREATED" | "PROCESSING" | "READY_FOR_PICKUP" | "CLAIMED" | "CANCELLED" | "VOID";
export type POSPaymentMethod = "CASH" | "GCASH" | "MAYA" | "CARD" | "QPH" | "BANK_TRANSFER";
export type DiscountType = "FLAT" | "PERCENT" | "PWD" | "SENIOR";

export interface POSLineItem {
  serviceId: string;
  serviceName: string;
  weightKg: number;
  unitPrice: number;
  lineTotal: number;
  type?: "service" | "product" | "custom";
  productId?: string;
  productName?: string;
  pricingType?: string;
  defaultProducts?: { inventoryId: string; productName: string; quantity: number; included: boolean }[];
}

export interface POSSplit {
  method: POSPaymentMethod;
  amount: number;
  reference?: string;
}

export interface WalkinCustomer {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface POSOrder {
  id: string;
  merchantId: string;
  branchId: string;
  staffId: string;
  orderSource: "POS";
  status: POSStatus;
  walkinCustomer: WalkinCustomer;
  items: POSLineItem[];
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  discountType?: DiscountType;
  totalAmount: number;
  paymentMethod: POSPaymentMethod;
  paymentStatus?: "paid" | "unpaid" | "refunded";
  amountReceived: number;
  changeGiven: number;
  claimCode: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  notes?: string;
  estimatedReadyAt?: string; // ISO string
  splits?: POSSplit[];
  createdAt: { seconds: number; nanoseconds: number };
  updatedAt: { seconds: number; nanoseconds: number };
  claimedAt?: { seconds: number; nanoseconds: number };
  claimedBy?: string;
  statusHistory?: Partial<Record<POSStatus, { seconds: number; nanoseconds: number }>>;
}

// Request / Response DTOs

export interface CreatePOSOrderRequest {
  branchId: string;
  walkinCustomer?: WalkinCustomer;
  items: POSLineItem[];
  paymentMethod: POSPaymentMethod;
  amountReceived: number;
  notes?: string;
  discountAmount?: number;
  discountCode?: string;
  discountType?: DiscountType;
  estimatedReadyAt?: string;
  splits?: POSSplit[];
}

export interface CreatePOSOrderResponse {
  orderId: string;
  claimCode: string;
  totalAmount: number;
  amountReceived: number;
  changeGiven: number;
  paymentMethod: string;
  status: "CREATED";
}

export interface AdvanceStatusResponse {
  orderId: string;
  status: POSStatus;
}

export interface ClaimOrderResponse {
  orderId: string;
  status: "CLAIMED";
  changeGiven: number;
  totalAmount: number;
}

// Customer history (client-side, derived from pos_walkins)
export interface CustomerHistory {
  isReturning: boolean;
  name?: string;
  phone?: string;
  orderCount: number;
  lastVisit?: Date;
  lastOrderTotal?: number;
}

// UI helpers

export const POS_STATUS_LABELS: Record<POSStatus, string> = {
  CREATED:          "New",
  PROCESSING:       "Processing",
  READY_FOR_PICKUP: "Ready for Pickup",
  CLAIMED:          "Claimed",
  CANCELLED:        "Cancelled",
  VOID:             "Void",
};

// Foreground / stroke color — used for text, dot indicators, left stripe
export const POS_STATUS_COLORS: Record<POSStatus, string> = {
  CREATED:          C.warning500,   // amber  — matches customer app yellow/pending
  PROCESSING:       C.info500,      // blue   — matches customer app blue/processing
  READY_FOR_PICKUP: C.brand500,     // brand  — highlights pickup-ready (was green, but green = CLAIMED)
  CLAIMED:          C.success500,   // green  — order complete
  CANCELLED:        C.gray500,      // gray   — terminal cancelled state
  VOID:             C.gray400,      // light gray — voided order
};

// Background fill — used for status pills, banner strips
export const POS_STATUS_BG: Record<POSStatus, string> = {
  CREATED:          C.warning100,
  PROCESSING:       C.info100,
  READY_FOR_PICKUP: C.brand100,
  CLAIMED:          C.success100,
  CANCELLED:        C.gray100,
  VOID:             C.gray100,
};

// Text color inside status pill/banner
export const POS_STATUS_TEXT: Record<POSStatus, string> = {
  CREATED:          C.warning700,
  PROCESSING:       C.info500,
  READY_FOR_PICKUP: C.brand700,
  CLAIMED:          C.success700,
  CANCELLED:        C.gray700,
  VOID:             C.gray600,
};

// Estimated ready time presets (in minutes)
export const READY_TIME_PRESETS: { label: string; minutes: number }[] = [
  { label: "1 hr", minutes: 60 },
  { label: "2 hrs", minutes: 120 },
  { label: "3 hrs", minutes: 180 },
  { label: "4 hrs", minutes: 240 },
  { label: "Same day", minutes: 480 },
  { label: "Next day", minutes: 1440 },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH:  "Cash",
  GCASH: "GCash",
  MAYA:  "Maya",
  CARD:          "Card",
  QPH:           "QPH",
  BANK_TRANSFER: "Bank Transfer",
};
