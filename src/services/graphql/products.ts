// src/services/graphql/products.ts
// Sellable retail products derived from an Inventory parent record.
// Products = what gets sold to customers (e.g. Tide Pods single pack).
// Inventory = the raw stock that backs them (e.g. Tide Powder bulk bag).

import { graphqlRequest } from "../../config/graphql";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export interface GqlProduct {
  _id:             string;
  productName:     string;
  price:           number;
  quantity:        number;
  productUnit:     string;
  productCategory: string;
  inventoryId:     string;
  isActive:        boolean;
  isArchived:      boolean;
  archivedAt?:     string | null;
  createdAt:       string;
  updatedAt:       string;
}

const PRODUCT_FIELDS = `
  _id productName price quantity productUnit productCategory
  inventoryId isActive isArchived archivedAt createdAt updatedAt
`;

// ─── Input shapes ─────────────────────────────────────────────────────────────

export interface CreateProductInput {
  inventoryId:     string;
  productName:     string;
  price:           number;
  quantity:        number;
  productUnit:     string;
  productCategory: string;
}

export interface UpdateProductInput {
  productName?:     string;
  price?:           number;
  quantity?:        number;
  productUnit?:     string;
  productCategory?: string;
}

export interface ProductFilterInput {
  inventoryId?:     string;
  branchId?:        string;
  search?:          string;
  productCategory?: string;
  isActive?:        boolean;
  isArchived?:      boolean;
  limit?:           number;
  offset?:          number;
}

// ─── myProducts ───────────────────────────────────────────────────────────────
// Fetch all sellable products for the merchant (optionally scoped to a branch
// via its linked Inventory item's branchId — resolved server-side).
export async function gqlMyProducts(filter?: ProductFilterInput): Promise<{ data: GqlProduct[]; total: number }> {
  const data = await graphqlRequest<{ myProducts: { data: GqlProduct[]; total: number } }>(
    `query MyProducts($filter: ProductFilterInput) {
       myProducts(filter: $filter) {
         data { ${PRODUCT_FIELDS} }
         total
       }
     }`,
    { filter: { limit: 500, isArchived: false, ...filter } }
  );
  return data.myProducts;
}

// ─── inventoryProducts ────────────────────────────────────────────────────────
// Fetch all products linked to a specific inventory item.
export async function gqlInventoryProducts(
  inventoryId: string
): Promise<GqlProduct[]> {
  const data = await graphqlRequest<{ inventoryProducts: GqlProduct[] }>(
    `query InventoryProducts($inventoryId: ID!) {
       inventoryProducts(inventoryId: $inventoryId) { ${PRODUCT_FIELDS} }
     }`,
    { inventoryId }
  );
  return data.inventoryProducts;
}

// ─── getProduct ───────────────────────────────────────────────────────────────
export async function gqlGetProduct(id: string): Promise<GqlProduct> {
  const data = await graphqlRequest<{ getProduct: GqlProduct }>(
    `query GetProduct($id: ID!) {
       getProduct(id: $id) { ${PRODUCT_FIELDS} }
     }`,
    { id }
  );
  return data.getProduct;
}

// ─── createProduct ────────────────────────────────────────────────────────────
export async function gqlCreateProduct(input: CreateProductInput): Promise<GqlProduct> {
  const data = await graphqlRequest<{ createProduct: GqlProduct }>(
    `mutation CreateProduct($input: CreateProductInput!) {
       createProduct(input: $input) { ${PRODUCT_FIELDS} }
     }`,
    { input }
  );
  return data.createProduct;
}

// ─── updateProduct ────────────────────────────────────────────────────────────
export async function gqlUpdateProduct(
  id: string,
  input: UpdateProductInput
): Promise<GqlProduct> {
  const data = await graphqlRequest<{ updateProduct: GqlProduct }>(
    `mutation UpdateProduct($id: ID!, $input: UpdateProductInput!) {
       updateProduct(id: $id, input: $input) { ${PRODUCT_FIELDS} }
     }`,
    { id, input }
  );
  return data.updateProduct;
}

// ─── archiveProduct ───────────────────────────────────────────────────────────
export async function gqlArchiveProduct(id: string): Promise<void> {
  await graphqlRequest<{ archiveProduct: { _id: string } }>(
    `mutation ArchiveProduct($id: ID!) { archiveProduct(id: $id) { _id } }`,
    { id }
  );
}

// ─── restoreProduct ───────────────────────────────────────────────────────────
export async function gqlRestoreProduct(id: string): Promise<void> {
  await graphqlRequest<{ restoreProduct: { _id: string } }>(
    `mutation RestoreProduct($id: ID!) { restoreProduct(id: $id) { _id } }`,
    { id }
  );
}
