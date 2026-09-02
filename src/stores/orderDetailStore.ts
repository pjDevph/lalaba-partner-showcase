// src/stores/orderDetailStore.ts
// Manages a single selected order's detail view + status transitions.
// Used when staff taps a queue card to advance status or initiate claim.

import { create } from "zustand";
import { advancePOSStatus, claimPOSOrder } from "../services/api/posOrders";
import type { POSOrder, POSStatus } from "../types/pos.types";

interface OrderDetailState {
  selectedOrder: POSOrder | null;
  isAdvancing: boolean;
  isClaiming: boolean;
  error: string | null;

  // Actions
  setSelectedOrder: (order: POSOrder | null) => void;
  advance: () => Promise<void>;
  claim: (claimCode: string) => Promise<void>;
  patchStatus: (status: POSStatus) => void;
  clearError: () => void;
}

export const useOrderDetailStore = create<OrderDetailState>()((set, get) => ({
  selectedOrder: null,
  isAdvancing: false,
  isClaiming: false,
  error: null,

  setSelectedOrder: (order) => set({ selectedOrder: order, error: null }),

  advance: async () => {
    const { selectedOrder } = get();
    if (!selectedOrder) return;

    set({ isAdvancing: true, error: null });
    try {
      const res = await advancePOSStatus(selectedOrder.id, selectedOrder.status);
      set((state) => ({
        isAdvancing: false,
        selectedOrder: state.selectedOrder
          ? { ...state.selectedOrder, status: res.status }
          : null,
      }));
    } catch (err) {
      set({
        isAdvancing: false,
        error: err instanceof Error ? err.message : "Status advance failed",
      });
    }
  },

  claim: async (claimCode) => {
    const { selectedOrder } = get();
    if (!selectedOrder) return;

    set({ isClaiming: true, error: null });
    try {
      const res = await claimPOSOrder(selectedOrder.id, claimCode);
      set((state) => ({
        isClaiming: false,
        selectedOrder: state.selectedOrder
          ? {
              ...state.selectedOrder,
              status: res.status,
              changeGiven: res.changeGiven,
            }
          : null,
      }));
    } catch (err) {
      set({
        isClaiming: false,
        error: err instanceof Error ? err.message : "Claim failed",
      });
    }
  },

  // Optimistic patch from Firestore real-time listener
  patchStatus: (status) =>
    set((state) => ({
      selectedOrder: state.selectedOrder
        ? { ...state.selectedOrder, status }
        : null,
    })),

  clearError: () => set({ error: null }),
}));
