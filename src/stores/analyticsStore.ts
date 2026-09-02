// src/stores/analyticsStore.ts
// Today's POS summary metrics — derived from the queue on demand.
// Phase 1A: computed client-side from the live queue.
// Phase 2+: will pull from a server-side analytics collection.

import { create } from "zustand";
import type { POSOrder } from "../types/pos.types";

export interface DailySummary {
  totalOrders: number;
  claimedOrders: number;
  pendingOrders: number;   // not yet CLAIMED
  totalRevenue: number;    // sum of CLAIMED order totalAmounts
  cashRevenue: number;
  gcashRevenue: number;
  avgOrderValue: number;
  computedAt: number;      // epoch ms
}

interface AnalyticsState {
  summary: DailySummary | null;
  isComputing: boolean;

  // Actions
  computeFromQueue: (orders: POSOrder[]) => void;
  reset: () => void;
}

function computeSummary(orders: POSOrder[]): DailySummary {
  const claimed = orders.filter((o) => o.status === "CLAIMED");
  const pending = orders.filter((o) => o.status !== "CLAIMED");

  const totalRevenue = claimed.reduce((s, o) => s + o.totalAmount, 0);
  const cashRevenue = claimed
    .filter((o) => o.paymentMethod === "CASH")
    .reduce((s, o) => s + o.totalAmount, 0);
  const gcashRevenue = claimed
    .filter((o) => o.paymentMethod === "GCASH")
    .reduce((s, o) => s + o.totalAmount, 0);

  return {
    totalOrders: orders.length,
    claimedOrders: claimed.length,
    pendingOrders: pending.length,
    totalRevenue: Number.parseFloat(totalRevenue.toFixed(2)),
    cashRevenue: Number.parseFloat(cashRevenue.toFixed(2)),
    gcashRevenue: Number.parseFloat(gcashRevenue.toFixed(2)),
    avgOrderValue:
      claimed.length > 0
        ? Number.parseFloat((totalRevenue / claimed.length).toFixed(2))
        : 0,
    computedAt: Date.now(),
  };
}

export const useAnalyticsStore = create<AnalyticsState>()((set) => ({
  summary: null,
  isComputing: false,

  computeFromQueue: (orders) => {
    set({ isComputing: true });
    const summary = computeSummary(orders);
    set({ summary, isComputing: false });
  },

  reset: () => set({ summary: null, isComputing: false }),
}));
