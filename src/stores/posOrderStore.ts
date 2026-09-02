// src/stores/posOrderStore.ts
// Manages the active POS order creation flow (terminal screen).
// submitOrder calls POST /pos/orders (backend validates, writes, returns claimCode).
// Direct Firestore writes have been removed — backend is the single writer.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gqlCreateOrder, gqlProcessPayment, type GqlOrder } from "../services/graphql/orders";
import { useOfflineQueueStore } from "./offlineQueueStore";
import { useAuthStore } from "./authStore";
import { useInventoryStore } from "./inventoryStore";
import { useNotificationStore } from "./notificationStore";
import type {
  POSLineItem,
  POSPaymentMethod,
  POSSplit,
  DiscountType,
  WalkinCustomer,
  CreatePOSOrderResponse,
} from "../types/pos.types";

// Inventory is deducted server-side inside gqlCreateOrder (pos-orders.service.ts
// create() → deductInventory()). This only re-derives the same numbers from the
// items just submitted, to tell the cashier what was taken out of stock — it
// must never call an adjust/deduct mutation itself, or stock deducts twice.
function describeDeductedStock(items: POSLineItem[]): string | null {
  const deductions = new Map<string, { name: string; qty: number; unit: string }>();
  for (const item of items) {
    for (const dp of item.defaultProducts ?? []) {
      if (!dp.included || !dp.inventoryId || dp.quantity <= 0) continue;
      const unit = useInventoryStore.getState().products.find((p) => p.id === dp.inventoryId)?.unit ?? "";
      const existing = deductions.get(dp.inventoryId);
      if (existing) existing.qty += dp.quantity;
      else deductions.set(dp.inventoryId, { name: dp.productName, qty: dp.quantity, unit });
    }
  }
  if (deductions.size === 0) return null;
  return Array.from(deductions.values()).map((d) => `${d.name} -${d.qty}${d.unit}`).join(", ");
}

interface POSOrderState {
  // Draft state
  branchId: string;
  walkinCustomer: WalkinCustomer;
  items: POSLineItem[];
  paymentMethod: POSPaymentMethod;
  amountReceived: number;
  notes: string;
  discountAmount: number;
  discountCode: string;
  discountType: DiscountType;
  estimatedMinutes: number;
  fulfillmentType: "PICKUP" | "DELIVERY";
  paymentTiming: "now" | "later";
  // Split payments: when non-empty, order uses multi-method payment
  splits: POSSplit[];

  // Submission state
  isSubmitting: boolean;
  error: string | null;
  queued: boolean;
  createdOrder: CreatePOSOrderResponse | null;
  createdOrderFull: GqlOrder | null;
  referenceId: string | undefined;

  // Actions
  setBranchId: (id: string) => void;
  setWalkinCustomer: (c: WalkinCustomer) => void;
  addItem: (item: POSLineItem) => void;
  removeItem: (serviceId: string) => void;
  updateItem: (serviceId: string, patch: Partial<POSLineItem>) => void;
  addCustomCharge: (name: string, amount: number) => void;
  clearItems: () => void;
  setPaymentMethod: (method: POSPaymentMethod) => void;
  setAmountReceived: (amount: number) => void;
  setNotes: (notes: string) => void;
  setDiscount: (amount: number, code?: string, type?: DiscountType) => void;
  clearDiscount: () => void;
  setEstimatedMinutes: (minutes: number) => void;
  setFulfillmentType: (type: "PICKUP" | "DELIVERY") => void;
  setPaymentTiming: (timing: "now" | "later") => void;
  // Split payment actions
  setSplit: (method: POSPaymentMethod, amount: number, reference?: string) => void;
  removeSplit: (method: POSPaymentMethod) => void;
  clearSplits: () => void;
  setReferenceId: (ref: string | undefined) => void;
  submitOrder: () => Promise<void>;
  resetOrder: () => void;
  clearError: () => void;

  // Derived
  subtotal: () => number;
  totalAmount: () => number;
  changeGiven: () => number;
  estimatedReadyAt: () => string | undefined;
  splitTotal: () => number;
}

const DRAFT_DEFAULTS = {
  walkinCustomer: {} as WalkinCustomer,
  items: [] as POSLineItem[],
  paymentMethod: "CASH" as POSPaymentMethod,
  amountReceived: 0,
  notes: "",
  discountAmount: 0,
  discountCode: "",
  discountType: "FLAT" as DiscountType,
  estimatedMinutes: 0,
  fulfillmentType: "PICKUP" as "PICKUP" | "DELIVERY",
  paymentTiming: "now" as "now" | "later",
  splits: [] as POSSplit[],
  referenceId: undefined as string | undefined,
};

export const usePOSOrderStore = create<POSOrderState>()(
  persist(
    (set, get) => ({
      branchId: "",
      ...DRAFT_DEFAULTS,
      isSubmitting: false,
      error: null,
      queued: false,
      createdOrder: null,
      createdOrderFull: null,

      setBranchId: (id) => set({ branchId: id }),
      setWalkinCustomer: (c) => set({ walkinCustomer: c }),

      addCustomCharge: (name, amount) => {
        const id = `custom:${Date.now()}`;
        set((state) => ({
          items: [...state.items, {
            type: "custom",
            serviceId: id,
            serviceName: name,
            weightKg: 1,
            unitPrice: amount,
            lineTotal: amount,
          }],
        }));
      },

      addItem: (item) =>
        set((state) => {
          const existing = state.items.findIndex((i) => i.serviceId === item.serviceId);
          if (existing >= 0) {
            const updated = [...state.items];
            const prev = updated[existing];
            if (prev === undefined) return { items: state.items };
            const newWeight = Number.parseFloat((prev.weightKg + item.weightKg).toFixed(3));
            updated[existing] = {
              ...prev,
              weightKg: newWeight,
              lineTotal: Number.parseFloat((newWeight * prev.unitPrice).toFixed(2)),
            };
            return { items: updated };
          }
          return { items: [...state.items, item] };
        }),

      removeItem: (serviceId) =>
        set((state) => ({ items: state.items.filter((i) => i.serviceId !== serviceId) })),

      updateItem: (serviceId, patch) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.serviceId !== serviceId) return item;
            const merged = { ...item, ...patch };
            return {
              ...merged,
              lineTotal: Number.parseFloat((merged.weightKg * merged.unitPrice).toFixed(2)),
            };
          }),
        })),

      clearItems: () => set({ items: [] }),
      setPaymentMethod: (method) => set({ paymentMethod: method, splits: [] }),
      setAmountReceived: (amount) => set({ amountReceived: amount }),
      setNotes: (notes) => set({ notes }),
      setDiscount: (amount, code = "", type = "FLAT") =>
        set({ discountAmount: amount, discountCode: code, discountType: type }),
      clearDiscount: () => set({ discountAmount: 0, discountCode: "", discountType: "FLAT" }),
      setEstimatedMinutes: (minutes) => set({ estimatedMinutes: minutes }),
      setFulfillmentType: (type) => set({ fulfillmentType: type }),
      setPaymentTiming: (timing) => set({ paymentTiming: timing }),

      setSplit: (method, amount, reference) =>
        set((state) => {
          const filtered = state.splits.filter((s) => s.method !== method);
          if (amount <= 0) return { splits: filtered };
          return { splits: [...filtered, { method, amount, reference }] };
        }),

      removeSplit: (method) =>
        set((state) => ({ splits: state.splits.filter((s) => s.method !== method) })),

      clearSplits: () => set({ splits: [] }),
      setReferenceId: (ref) => set({ referenceId: ref }),

      submitOrder: async () => {
        if (get().isSubmitting) return;

        const {
          branchId, walkinCustomer, items, paymentMethod,
          amountReceived, notes, discountAmount, discountType,
          estimatedMinutes, fulfillmentType, paymentTiming, splits,
        } = get();

        if (items.length === 0) { set({ error: "Add at least one service." }); return; }
        if (paymentTiming === "now" && splits.length === 0 && paymentMethod === "CASH" && amountReceived < get().totalAmount()) {
          set({ error: "Cash received is less than the order total." });
          return;
        }

        const resolvedBranchId =
          branchId || useAuthStore.getState().merchantId || ""; // NOSONAR — intentional: catches empty string

        const estimatedReadyAt = estimatedMinutes > 0
          ? new Date(Date.now() + estimatedMinutes * 60_000).toISOString()
          : null;

        const isSplit = splits.length > 0;
        const primaryMethod = isSplit
          ? (splits[0]?.method ?? paymentMethod)
          : paymentMethod;

        const activeDiscountType = discountType === "PERCENT" ? "percentage" as const : "flat" as const;
        const beDiscountType = discountAmount > 0 ? activeDiscountType : undefined;

        const orderInput = {
          branchId:      resolvedBranchId,
          customerName:    walkinCustomer?.name?.trim()    || undefined, // NOSONAR — intentional: catches empty string
          customerPhone:   walkinCustomer?.phone?.trim()   || undefined, // NOSONAR — intentional: catches empty string
          customerAddress: walkinCustomer?.address?.trim() || undefined, // NOSONAR
          items: items.map((i) => ({
            type:            i.type ?? "service",
            serviceId:       i.type === "product" ? undefined : i.serviceId,
            serviceName:     i.type === "product" ? undefined : i.serviceName,
            productId:       i.type === "product" ? i.productId : undefined,
            productName:     i.type === "product" ? i.productName : undefined,
            pricingType:     i.pricingType,
            defaultProducts: i.defaultProducts,
            quantity:        i.weightKg,
            unitPrice:       i.type === "custom" ? i.unitPrice : undefined,
          })),
          notes:           notes.trim() || undefined,
          fulfillmentType,
          discountType:  beDiscountType,
          discountValue: discountAmount > 0 ? discountAmount : undefined,
          estimatedReadyAt: estimatedReadyAt ?? undefined,
        };

        const { referenceId } = get();
        const payments = isSplit
          ? splits.map((split) => ({
              paymentMethod: split.method.toLowerCase(),
              amountPaid:    split.amount,
              referenceId:   split.reference,
            }))
          : [{
              paymentMethod: primaryMethod.toLowerCase(),
              amountPaid:    primaryMethod === "CASH" ? amountReceived : 0,
              referenceId:   primaryMethod === "CASH" ? undefined : referenceId,
            }];

        set({ isSubmitting: true, error: null, queued: false, createdOrder: null });
        try {
          const gqlOrder = await gqlCreateOrder(orderInput);
          // gqlCreateOrder always returns the pre-payment (UNPAID) snapshot —
          // processPayment returns the updated order (paymentStatus, and now
          // possibly laundryStatus for product-only auto-complete). Track the
          // latest one so the success ticket doesn't show stale "UNPAID".
          let finalOrder = gqlOrder;

          if (paymentTiming === "now") {
            if (isSplit) {
              for (const split of splits) {
                finalOrder = await gqlProcessPayment(gqlOrder._id, {
                  paymentMethod: split.method.toLowerCase(),
                  amountPaid:    split.amount,
                  referenceId:   split.reference,
                });
              }
            } else {
              finalOrder = await gqlProcessPayment(gqlOrder._id, {
                paymentMethod: primaryMethod.toLowerCase(),
                amountPaid:    primaryMethod === "CASH" ? amountReceived : gqlOrder.totalAmount,
                referenceId:   primaryMethod === "CASH" ? undefined : referenceId,
              });
            }
          }

          const changeGiven = paymentTiming === "now" && primaryMethod === "CASH" && !isSplit
            ? Math.max(0, amountReceived - gqlOrder.totalAmount)
            : 0;

          const response: CreatePOSOrderResponse = {
            orderId:        gqlOrder._id,
            claimCode:      gqlOrder.claimCode,
            totalAmount:    gqlOrder.totalAmount,
            amountReceived: paymentTiming === "now" && primaryMethod === "CASH" && !isSplit ? amountReceived : 0,
            changeGiven,
            paymentMethod:  paymentTiming === "now" ? primaryMethod.toLowerCase() : "unpaid",
            status:         "CREATED",
          };
          set({ createdOrder: response, createdOrderFull: finalOrder, isSubmitting: false });

          const stockSummary = describeDeductedStock(items);
          if (stockSummary) {
            useNotificationStore.getState().push({ type: "info", title: "Stock deducted", message: stockSummary });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Order creation failed";
          const isNetworkErr = /network request failed|failed to fetch|networkerror/i.test(msg);

          if (isNetworkErr) {
            useOfflineQueueStore.getState().enqueue(orderInput, payments);
            // Reset draft so cashier is ready for next customer
            set({ ...DRAFT_DEFAULTS, isSubmitting: false, queued: true, error: null });
          } else {
            set({ error: msg, isSubmitting: false });
          }
        }
      },

      resetOrder: () =>
        set({
          ...DRAFT_DEFAULTS,
          error: null,
          queued: false,
          createdOrder: null,
          createdOrderFull: null,
        }),

      clearError: () => set({ error: null }),

      subtotal: () => {
        const { items } = get();
        return Number.parseFloat(items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
      },

      totalAmount: () => {
        const { discountAmount } = get();
        const sub = get().subtotal();
        return Math.max(0, Number.parseFloat((sub - discountAmount).toFixed(2)));
      },

      splitTotal: () => {
        const { splits } = get();
        return Number.parseFloat(splits.reduce((sum, s) => sum + s.amount, 0).toFixed(2));
      },

      changeGiven: () => {
        const { paymentMethod, amountReceived, splits } = get();
        const total = get().totalAmount();
        if (splits.length > 0) {
          const cashSplit = splits.find((s) => s.method === "CASH");
          if (!cashSplit) return 0;
          const otherTotal = splits.filter((s) => s.method !== "CASH").reduce((sum, s) => sum + s.amount, 0);
          const cashDue = Math.max(0, total - otherTotal);
          return Math.max(0, Number.parseFloat((cashSplit.amount - cashDue).toFixed(2)));
        }
        if (paymentMethod !== "CASH") return 0;
        return Math.max(0, Number.parseFloat((amountReceived - total).toFixed(2)));
      },

      estimatedReadyAt: () => {
        const { estimatedMinutes } = get();
        if (!estimatedMinutes || estimatedMinutes <= 0) return undefined;
        return new Date(Date.now() + estimatedMinutes * 60_000).toISOString();
      },
    }),
    {
      name: "lalaba-pos-draft",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      // `persisted` is whatever an older build wrote to AsyncStorage, so
      // `unknown` is the honest type. Narrow once, then the field reads below
      // are explicit about what an old draft is expected to contain.
      migrate: (persisted: unknown, version: number) => {
        const prev = (
          persisted && typeof persisted === "object" ? persisted : {}
        ) as Record<string, unknown>;
        if (version < 2) return { ...prev, createdOrder: null };
        if (version < 3) {
          const fulfillmentType = prev.fulfillmentType;
          return {
            ...prev,
            fulfillmentType:
              typeof fulfillmentType === "string"
                ? fulfillmentType.toUpperCase()
                : "PICKUP",
            paymentTiming: prev.paymentTiming ?? "now",
          };
        }
        return prev;
      },
      partialize: (s) => ({
        branchId:        s.branchId,
        walkinCustomer:  s.walkinCustomer,
        items:           s.items,
        paymentMethod:   s.paymentMethod,
        amountReceived:  s.amountReceived,
        notes:           s.notes,
        discountAmount:  s.discountAmount,
        discountCode:    s.discountCode,
        discountType:    s.discountType,
        estimatedMinutes:  s.estimatedMinutes,
        fulfillmentType:   s.fulfillmentType,
        paymentTiming:     s.paymentTiming,
        splits:            s.splits,
        referenceId:     s.referenceId,
        // Persisted so ClaimTicket re-appears if app is killed before user taps
        // "New Order" / "Back to Queue", preventing a stale cart on next launch.
        createdOrder:    s.createdOrder,
      }),
    }
  )
);
