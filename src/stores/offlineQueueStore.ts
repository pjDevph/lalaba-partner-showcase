import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { gqlCreateOrder, gqlProcessPayment } from "../services/graphql/orders";
import type { CreateOrderInput, ProcessPaymentInput } from "../services/graphql/orders";

export interface PendingOrder {
  id: string;
  branchId: string;
  itemCount: number;
  orderInput: CreateOrderInput;
  payments: ProcessPaymentInput[];
  queuedAt: number;
  retryCount: number;
  lastError?: string;
}

interface OfflineQueueState {
  pending: PendingOrder[];
  isFlushing: boolean;
  lastSyncedAt: number | null;

  enqueue: (orderInput: CreateOrderInput, payments: ProcessPaymentInput[]) => string;
  flush: () => Promise<{ synced: number; failed: number }>;
  remove: (id: string) => void;
  clear: () => void;
}

function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.trunc(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const MAX_RETRY_COUNT = 5;

const isNetworkError = (msg: string) =>
  /network request failed|failed to fetch|networkerror/i.test(msg);

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      pending: [],
      isFlushing: false,
      lastSyncedAt: null,

      enqueue: (orderInput, payments) => {
        const id = generateId();
        const entry: PendingOrder = {
          id,
          branchId: orderInput.branchId,
          itemCount: orderInput.items.length,
          orderInput: { ...orderInput, idempotencyKey: id },
          payments,
          queuedAt: Date.now(),
          retryCount: 0,
        };
        set((s) => ({ pending: [...s.pending, entry] }));
        return id;
      },

      flush: async () => {
        if (get().isFlushing || get().pending.length === 0) {
          return { synced: 0, failed: 0 };
        }
        set({ isFlushing: true });

        let synced = 0;
        let failed = 0;

        const snapshot = [...get().pending].sort((a, b) => a.queuedAt - b.queuedAt);

        for (const entry of snapshot) {
          // Evict orders that have permanently failed (non-network errors exceeded cap)
          if (entry.retryCount >= MAX_RETRY_COUNT) {
            get().remove(entry.id);
            failed++;
            continue;
          }

          try {
            const order = await gqlCreateOrder(entry.orderInput);
            for (const payment of entry.payments) {
              await gqlProcessPayment(order._id, payment);
            }
            get().remove(entry.id);
            synced++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            if (isNetworkError(msg)) {
              set({ isFlushing: false });
              return { synced, failed };
            }
            set((s) => ({
              pending: s.pending.map((p) =>
                p.id === entry.id
                  ? { ...p, retryCount: p.retryCount + 1, lastError: msg }
                  : p
              ),
            }));
            failed++;
          }
        }

        set({ isFlushing: false, lastSyncedAt: synced > 0 ? Date.now() : get().lastSyncedAt });
        return { synced, failed };
      },

      remove: (id) =>
        set((s) => ({ pending: s.pending.filter((p) => p.id !== id) })),

      clear: () => set({ pending: [], isFlushing: false }),
    }),
    {
      name: "lalaba-offline-queue",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      partialize: (s) => ({ pending: s.pending, lastSyncedAt: s.lastSyncedAt }),
    }
  )
);
