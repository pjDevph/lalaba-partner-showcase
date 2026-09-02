// src/stores/servicesStore.ts
// Session-only store for active laundry services.
// Loaded once during auth bootstrap (merchantStore.loadMerchant) and shared
// across POS, dashboard, costing, and inventory screens to avoid per-screen fetches.

import { create } from "zustand";
import { gqlMyServices, type GqlService } from "../services/graphql/laundryServices";

interface ServicesState {
  services: GqlService[];
  isLoaded: boolean;
  isLoading: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useServicesStore = create<ServicesState>()((set, get) => ({
  services: [],
  isLoaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading || get().isLoaded) return;
    set({ isLoading: true });
    try {
      const services = await gqlMyServices({ limit: 100, isArchived: false });
      set({ services, isLoaded: true });
    } catch (err) {
      console.warn("[servicesStore] load failed:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    set({ isLoading: true });
    try {
      const services = await gqlMyServices({ limit: 100, isArchived: false });
      set({ services, isLoaded: true });
    } catch (err) {
      console.warn("[servicesStore] refresh failed:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({ services: [], isLoaded: false, isLoading: false }),
}));
