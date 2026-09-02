// src/services/graphql/inventory.ts
// GraphQL operations for the inventory domain.

import { graphqlRequest } from "../../config/graphql";
// The SDL enum InventoryUnit has exactly the same 9 members as this union and
// the field is non-null, so naming it here is accurate — not a narrowing guess.
import type { InventoryUnit } from "../../types/inventory.types";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export interface GqlInventory {
  _id: string;
  uid: string;
  branchId: string;
  productName: string;
  cost: number;
  inventoryUnit: InventoryUnit;
  inventoryCategory: string;
  stockQuantity: number;
  threshold?: number;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Keep alias so callers that imported GqlProduct still compile
export type GqlProduct = GqlInventory;

export interface CreateInventoryInput {
  branchId: string;
  productName: string;
  cost: number;
  inventoryUnit: InventoryUnit;
  inventoryCategory: string;
  stockQuantity: number;
  threshold?: number;
}

export interface UpdateInventoryInput {
  productName?: string;
  cost?: number;
  inventoryUnit?: InventoryUnit;
  inventoryCategory?: string;
  threshold?: number;
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const INVENTORY_FIELDS = `
  _id uid branchId productName cost inventoryUnit inventoryCategory
  stockQuantity threshold isActive isArchived archivedAt createdAt updatedAt
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function gqlMyInventory(filter?: {
  branchId?: string;
  inventoryCategory?: string;
  isArchived?: boolean;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: GqlInventory[]; total: number }> {
  const res = await graphqlRequest<{ myInventory: { data: GqlInventory[]; total: number } }>(`
    query MyInventory($filter: InventoryFilterInput) {
      myInventory(filter: $filter) {
        data { ${INVENTORY_FIELDS} }
        total
      }
    }
  `, { filter: { limit: 500, isArchived: false, ...filter } });
  return res.myInventory;
}

export interface GqlInventoryTransaction {
  _id: string;
  inventoryId: string;
  type: string;
  quantityChange: number;
  createdBy: string;
  createdByType: string;
  createdAt?: string;
}

export async function gqlAllInventoryTransactions(filter?: {
  branchId?: string;
  inventoryId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: GqlInventoryTransaction[]; total: number }> {
  const res = await graphqlRequest<{ allInventoryTransactions: { data: GqlInventoryTransaction[]; total: number } }>(`
    query AllInventoryTransactions($filter: TransactionFilterInput) {
      allInventoryTransactions(filter: $filter) {
        data { _id inventoryId type quantityChange createdBy createdByType createdAt }
        total
      }
    }
  `, { filter: { limit: 20, offset: 0, ...filter } });
  return res.allInventoryTransactions;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function gqlCreateInventory(input: CreateInventoryInput): Promise<GqlInventory> {
  const res = await graphqlRequest<{ createInventory: GqlInventory }>(`
    mutation CreateInventory($input: CreateInventoryInput!) {
      createInventory(input: $input) { ${INVENTORY_FIELDS} }
    }
  `, { input });
  return res.createInventory;
}

export async function gqlUpdateInventory(id: string, input: UpdateInventoryInput): Promise<GqlInventory> {
  const res = await graphqlRequest<{ updateInventory: GqlInventory }>(`
    mutation UpdateInventory($id: ID!, $input: UpdateInventoryInput!) {
      updateInventory(id: $id, input: $input) { ${INVENTORY_FIELDS} }
    }
  `, { id, input });
  return res.updateInventory;
}

export async function gqlRestockInventory(id: string, quantity: number, reason?: string): Promise<GqlInventory> {
  const res = await graphqlRequest<{ restockInventory: GqlInventory }>(`
    mutation RestockInventory($id: ID!, $input: RestockInventoryInput!) {
      restockInventory(id: $id, input: $input) { ${INVENTORY_FIELDS} }
    }
  `, { id, input: { quantity, reason } });
  return res.restockInventory;
}

export async function gqlAdjustInventory(id: string, quantityChange: number, reason: string): Promise<GqlInventory> {
  const res = await graphqlRequest<{ adjustInventory: GqlInventory }>(`
    mutation AdjustInventory($id: ID!, $input: AdjustInventoryInput!) {
      adjustInventory(id: $id, input: $input) { ${INVENTORY_FIELDS} }
    }
  `, { id, input: { quantityChange, reason } });
  return res.adjustInventory;
}

export async function gqlDamageInventory(id: string, quantity: number, reason: string): Promise<GqlInventory> {
  const res = await graphqlRequest<{ damageInventory: GqlInventory }>(`
    mutation DamageInventory($id: ID!, $input: DamageInventoryInput!) {
      damageInventory(id: $id, input: $input) { ${INVENTORY_FIELDS} }
    }
  `, { id, input: { quantity, reason } });
  return res.damageInventory;
}

export async function gqlArchiveInventory(id: string): Promise<void> {
  await graphqlRequest(`
    mutation ArchiveInventory($id: ID!) { archiveInventory(id: $id) { _id } }
  `, { id });
}

export async function gqlRestoreInventory(id: string): Promise<void> {
  await graphqlRequest(`
    mutation RestoreInventory($id: ID!) { restoreInventory(id: $id) { _id } }
  `, { id });
}

// Backwards-compat aliases so callers that imported old names still compile
export const gqlCreateProduct   = gqlCreateInventory;
export const gqlRestockProduct  = (id: string, qty: number, note?: string) => gqlRestockInventory(id, qty, note);
export const gqlAdjustStock     = (id: string, delta: number, reason?: string) => gqlAdjustInventory(id, delta, reason ?? "Manual adjustment");
export const gqlArchiveProduct  = gqlArchiveInventory;
export const gqlRestoreProduct  = gqlRestoreInventory;
