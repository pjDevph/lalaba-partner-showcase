// src/types/inventory.types.ts
// Inventory domain types for the Lalaba merchant app

export type InventoryUnit = "g" | "kg" | "ml" | "L" | "sachet" | "pieces" | "pack" | "box" | "scoop";
export type InventoryLogType = "RESTOCK" | "CONSUME" | "RETURN" | "ADJUSTMENT" | "DAMAGE";

export const INVENTORY_LOG_LABELS: Record<InventoryLogType, string> = {
  RESTOCK:    "Restock",
  CONSUME:    "Used",
  RETURN:     "Return",
  ADJUSTMENT: "Adjust",
  DAMAGE:     "Damage",
};

export interface Product {
  id: string;
  merchantId: string;
  branchId?: string | null;
  name: string;
  unit: InventoryUnit;
  category?: string;
  quantity: number;
  threshold: number;
  costPerUnit: number;
  isActive: boolean;
  createdAt: { seconds: number; nanoseconds: number };
  updatedAt: { seconds: number; nanoseconds: number };
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: InventoryLogType;
  quantity: number;
  staffId: string;
  note?: string;
  createdAt: { seconds: number; nanoseconds: number };
}

export interface CreateProductRequest {
  name: string;
  unit: InventoryUnit;
  quantity: number;
  threshold: number;
  costPerUnit: number;
  category?: string;
}

export interface RestockRequest {
  quantity: number;
  note?: string;
}

export interface AdjustRequest {
  quantity: number;
  note: string;
}
