// src/stores/inventoryStore.ts
// Inventory management store (NOT persisted)

import { create } from "zustand";
import {
  gqlMyInventory,
  gqlAllInventoryTransactions,
  gqlCreateProduct,
  gqlRestockProduct,
  gqlAdjustStock,
  gqlDamageInventory,
  gqlArchiveProduct,
  gqlRestoreProduct,
  gqlUpdateInventory,
  type GqlProduct,
} from "../services/graphql/inventory";
import type { CreateProductRequest, RestockRequest, AdjustRequest, InventoryUnit } from "../types/inventory.types";

// Map GqlInventory → local Product shape expected by screens
function toProduct(p: GqlProduct) {
  return {
    id:          p._id,
    merchantId:  p.uid,
    branchId:    p.branchId,
    name:        p.productName,
    unit:        p.inventoryUnit,
    category:    p.inventoryCategory,
    quantity:    p.stockQuantity,
    threshold:   p.threshold ?? 0,
    costPerUnit: p.cost,
    isActive:    p.isActive,
    isArchived:  p.isArchived,
    createdAt:   { seconds: 0, nanoseconds: 0 },
    updatedAt:   { seconds: 0, nanoseconds: 0 },
  };
}

interface InventoryState {
  products:  ReturnType<typeof toProduct>[];
  lowStock:  ReturnType<typeof toProduct>[];
  logs:      any[];
  total:     number;
  offset:    number;
  isLoading: boolean;
  error:     string | null;
  branchId:  string | null;

  setBranchId:       (id: string | null) => void;
  fetchProducts:     () => Promise<void>;
  loadMoreProducts:  () => Promise<void>;
  fetchLowStock:     () => Promise<void>;
  fetchLogs:         () => Promise<void>;
  createProduct:  (data: CreateProductRequest) => Promise<string>;
  updateProduct:  (productId: string, data: { productName?: string; cost?: number; inventoryUnit?: InventoryUnit; inventoryCategory?: string; threshold?: number }) => Promise<void>;
  restockProduct: (productId: string, data: RestockRequest) => Promise<void>;
  adjustProduct:  (productId: string, data: AdjustRequest)  => Promise<void>;
  damageProduct:  (productId: string, quantity: number, note: string) => Promise<void>;
  archiveProduct: (productId: string) => Promise<void>;
  restoreProduct: (productId: string) => Promise<void>;
  refresh:              () => Promise<void>;
  clearError:           () => void;
  reset:                () => void;
}

const PAGE_SIZE = 50;

export const useInventoryStore = create<InventoryState>((set, get) => ({
  products:  [],
  lowStock:  [],
  logs:      [],
  total:     0,
  offset:    0,
  isLoading: false,
  error:     null,
  branchId:  null,

  setBranchId: (id) => set({ branchId: id }),

  fetchProducts: async () => {
    const { branchId } = get();
    set({ isLoading: true, error: null, offset: 0 });
    try {
      const result = await gqlMyInventory({ branchId: branchId ?? undefined, isArchived: false, limit: PAGE_SIZE, offset: 0 });
      set({ products: result.data.map(toProduct), total: result.total, offset: PAGE_SIZE, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to fetch products", isLoading: false });
    }
  },

  loadMoreProducts: async () => {
    const { branchId, products, total, offset, isLoading } = get();
    if (isLoading || products.length >= total) return;
    set({ isLoading: true });
    try {
      const result = await gqlMyInventory({ branchId: branchId ?? undefined, isArchived: false, limit: PAGE_SIZE, offset });
      set({ products: [...products, ...result.data.map(toProduct)], offset: offset + PAGE_SIZE, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to load more", isLoading: false });
    }
  },

  fetchLowStock: async () => {
    const { products } = get();
    set({ lowStock: products.filter((p) => p.quantity <= p.threshold) });
  },

  fetchLogs: async () => {
    const { branchId, products } = get();
    try {
      const result = await gqlAllInventoryTransactions({ branchId: branchId ?? undefined, limit: 20 });
      const logs = result.data.map((tx) => {
        const product = products.find((p) => p.id === tx.inventoryId);
        return {
          id:          tx._id,
          productId:   tx.inventoryId,
          productName: product?.name ?? "Unknown",
          type:        tx.type,
          quantity:    tx.quantityChange,
          staffId:     tx.createdBy,
          createdAt:   { seconds: tx.createdAt ? Math.floor(new Date(tx.createdAt).getTime() / 1000) : 0, nanoseconds: 0 },
        };
      });
      set({ logs });
    } catch {
      set({ logs: [] });
    }
  },

  createProduct: async (data) => {
    const { branchId } = get();
    set({ isLoading: true, error: null });
    try {
      const created = await gqlCreateProduct({
        branchId:          branchId ?? "",
        productName:       data.name,
        inventoryUnit:     data.unit,
        inventoryCategory: data.category ?? "other",
        stockQuantity:     data.quantity,
        cost:              data.costPerUnit,
        threshold:         data.threshold,
      });
      await get().fetchProducts();
      set({ isLoading: false });
      return created._id;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create product", isLoading: false });
      throw err;
    }
  },

  updateProduct: async (productId, data) => {
    set({ isLoading: true, error: null });
    try {
      await gqlUpdateInventory(productId, data);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update product", isLoading: false });
      throw err;
    }
  },

  restockProduct: async (productId, data) => {
    set({ isLoading: true, error: null });
    try {
      await gqlRestockProduct(productId, data.quantity, data.note);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to restock", isLoading: false });
      throw err;
    }
  },

  adjustProduct: async (productId, data) => {
    set({ isLoading: true, error: null });
    try {
      await gqlAdjustStock(productId, data.quantity, data.note);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to adjust stock", isLoading: false });
      throw err;
    }
  },

  damageProduct: async (productId, quantity, note) => {
    set({ isLoading: true, error: null });
    try {
      await gqlDamageInventory(productId, quantity, note);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to record damage", isLoading: false });
      throw err;
    }
  },

  archiveProduct: async (productId) => {
    set({ isLoading: true, error: null });
    try {
      await gqlArchiveProduct(productId);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to archive", isLoading: false });
      throw err;
    }
  },

  restoreProduct: async (productId) => {
    set({ isLoading: true, error: null });
    try {
      await gqlRestoreProduct(productId);
      await get().fetchProducts();
      set({ isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to restore", isLoading: false });
      throw err;
    }
  },

  refresh: async () => {
    await get().fetchProducts();
    get().fetchLowStock();
  },

  clearError: () => set({ error: null }),

  reset: () => set({ products: [], lowStock: [], logs: [], total: 0, offset: 0, isLoading: false, error: null, branchId: null }),
}));
