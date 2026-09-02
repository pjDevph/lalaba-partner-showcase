// src/stores/productsStore.ts
// Session-only store for sellable retail products (linked to Inventory).
// Loaded once during auth bootstrap (merchantStore.loadMerchant) and shared
// across the Products tab and POS terminal, same pattern as servicesStore.

import { create } from "zustand";
import { gqlMyProducts, type GqlProduct } from "../services/graphql/products";

interface ProductsState {
  products: GqlProduct[];
  isLoaded: boolean;
  isLoading: boolean;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const useProductsStore = create<ProductsState>()((set, get) => ({
  products: [],
  isLoaded: false,
  isLoading: false,

  load: async () => {
    if (get().isLoading || get().isLoaded) return;
    set({ isLoading: true });
    try {
      const result = await gqlMyProducts({ limit: 500, isArchived: false });
      set({ products: result.data, isLoaded: true });
    } catch (err) {
      console.warn("[productsStore] load failed:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  refresh: async () => {
    set({ isLoading: true });
    try {
      const result = await gqlMyProducts({ limit: 500, isArchived: false });
      set({ products: result.data, isLoaded: true });
    } catch (err) {
      console.warn("[productsStore] refresh failed:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  reset: () => set({ products: [], isLoaded: false, isLoading: false }),
}));
