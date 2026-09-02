// src/stores/queueStore.ts
// Holds the live queue of today's POS orders for this branch.
// Populated and kept in sync by the useQueueSubscription hook via
// GraphQL polling — this store is the write target.

import { create } from "zustand";
import type { POSOrder, POSStatus } from "../types/pos.types";

type QueueFilter = "ALL" | POSStatus;

interface QueueState {
  orders: POSOrder[];
  filter: QueueFilter;
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: number | null;

  // Actions (called by useQueueSubscription hook)
  setOrders: (orders: POSOrder[]) => void;
  upsertOrder: (order: POSOrder) => void;
  removeOrder: (orderId: string) => void;
  setFilter: (filter: QueueFilter) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Derived (selector helpers)
  filteredOrders: () => POSOrder[];
  activeCount: () => number;
}

export const useQueueStore = create<QueueState>()((set, get) => ({
  orders: [],
  filter: "ALL",
  isLoading: true,
  error: null,
  lastSyncedAt: null,

  setOrders: (orders) =>
    set({
      orders: [...orders].sort(
        (a, b) => (b.createdAt.seconds ?? 0) - (a.createdAt.seconds ?? 0)
      ),
      isLoading: false,
      lastSyncedAt: Date.now(),
      error: null,
    }),

  upsertOrder: (order) =>
    set((state) => {
      const idx = state.orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        const updated = [...state.orders];
        updated[idx] = order;
        return { orders: updated };
      }
      return {
        orders: [order, ...state.orders].sort(
          (a, b) => (b.createdAt.seconds ?? 0) - (a.createdAt.seconds ?? 0)
        ),
      };
    }),

  removeOrder: (orderId) =>
    set((state) => ({ orders: state.orders.filter((o) => o.id !== orderId) })),

  setFilter: (filter) => set({ filter }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, isLoading: false }),

  filteredOrders: () => {
    const { orders, filter } = get();
    if (filter === "ALL") return orders;
    return orders.filter((o) => o.status === filter);
  },

  activeCount: () => {
    const { orders } = get();
    return orders.filter((o) => o.status !== "CLAIMED").length;
  },
}));
