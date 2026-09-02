// src/services/graphql/laundryServices.ts
// GraphQL operations for the laundry-services domain.

import { graphqlRequest } from "../../config/graphql";

// ─── BE shapes ────────────────────────────────────────────────────────────────

export interface GqlDefaultProduct {
  inventoryId: string;
  productName: string;
  quantity: number;
  unit?: string;
  per?: string;
}

export interface GqlService {
  _id: string;
  uid: string;
  branchId: string;
  serviceName: string;
  serviceCode?: string;
  price: number;
  pricingType: string;
  baseKilos?: number;
  excessRate?: number;
  suppliesCost?: number;
  estimatedMinutes?: number;
  category: string;
  defaultProducts?: GqlDefaultProduct[];
  requiresWeighing: boolean;
  isActive: boolean;
  isOnline: boolean;
  isFeatured: boolean;
  isArchived: boolean;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateServiceInput {
  branchId: string;
  serviceName: string;
  serviceCode?: string;
  price: number;
  pricingType: string;
  baseKilos?: number;
  excessRate?: number;
  suppliesCost?: number;
  estimatedMinutes?: number;
  category: string;
  defaultProducts?: GqlDefaultProduct[];
  requiresWeighing: boolean;
  isOnline?: boolean;
  isFeatured?: boolean;
}

export interface UpdateServiceInput {
  serviceName?: string;
  serviceCode?: string;
  price?: number;
  pricingType?: string;
  baseKilos?: number;
  excessRate?: number;
  suppliesCost?: number;
  estimatedMinutes?: number;
  category?: string;
  defaultProducts?: GqlDefaultProduct[];
  requiresWeighing?: boolean;
  isActive?: boolean;
  isOnline?: boolean;
  isFeatured?: boolean;
}

// ─── Money unit conversion (wire ↔ app) ─────────────────────────────────────────
// The backend stores service money fields in INTEGER CENTAVOS (matching the
// online-orders/discovery/customer convention). The rest of the merchant app —
// the services form, POS line math, costing, and formatCurrency — works in whole
// PESOS. Convert at this single GraphQL boundary so every consumer stays in
// pesos and nothing downstream needs to know about centavos.
// Money fields: price, suppliesCost, excessRate (₱/kg over base). baseKilos is a
// weight (kg), not money, so it is never scaled.
const MONEY_FIELDS = ["price", "suppliesCost", "excessRate"] as const;

function serviceFromWire(s: GqlService): GqlService {
  const out = { ...s };
  for (const f of MONEY_FIELDS) {
    if (typeof out[f] === "number") out[f] = (out[f] as number) / 100;
  }
  return out;
}

// Pesos → integer centavos for the wire. Math.round avoids float dust
// (e.g. 71.5 * 100 = 7150, not 7149.999…).
function moneyToWire<T extends { price?: number; suppliesCost?: number; excessRate?: number }>(input: T): T {
  const out = { ...input };
  for (const f of MONEY_FIELDS) {
    if (typeof out[f] === "number") out[f] = Math.round((out[f] as number) * 100);
  }
  return out;
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const SERVICE_FIELDS = `
  _id uid branchId serviceName serviceCode price pricingType
  baseKilos excessRate suppliesCost estimatedMinutes category
  defaultProducts { inventoryId productName quantity unit per }
  requiresWeighing isActive isOnline isFeatured isArchived archivedAt createdAt updatedAt
`;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function gqlMyServices(filter?: {
  branchId?: string;
  category?: string;
  isActive?: boolean;
  isArchived?: boolean;
  search?: string;
  limit?: number;
}): Promise<GqlService[]> {
  const res = await graphqlRequest<{ myServices: { data: GqlService[]; total: number } }>(`
    query MyServices($filter: ServiceFilterInput) {
      myServices(filter: $filter) {
        data { ${SERVICE_FIELDS} }
        total
      }
    }
  `, { filter: { limit: 100, isArchived: false, ...filter } });
  return res.myServices.data.map(serviceFromWire);
}

export async function gqlGetService(id: string): Promise<GqlService> {
  const res = await graphqlRequest<{ getService: GqlService }>(`
    query GetService($id: ID!) {
      getService(id: $id) { ${SERVICE_FIELDS} }
    }
  `, { id });
  return serviceFromWire(res.getService);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function gqlCreateService(input: CreateServiceInput): Promise<GqlService> {
  const res = await graphqlRequest<{ createService: GqlService }>(`
    mutation CreateService($input: CreateServiceInput!) {
      createService(input: $input) { ${SERVICE_FIELDS} }
    }
  `, { input: moneyToWire(input) });
  return serviceFromWire(res.createService);
}

export async function gqlUpdateService(id: string, input: UpdateServiceInput): Promise<GqlService> {
  const res = await graphqlRequest<{ updateService: GqlService }>(`
    mutation UpdateService($id: ID!, $input: UpdateServiceInput!) {
      updateService(id: $id, input: $input) { ${SERVICE_FIELDS} }
    }
  `, { id, input: moneyToWire(input) });
  return serviceFromWire(res.updateService);
}

export async function gqlArchiveService(id: string): Promise<void> {
  await graphqlRequest(`
    mutation ArchiveService($id: ID!) { archiveService(id: $id) { _id } }
  `, { id });
}

export async function gqlRestoreService(id: string): Promise<void> {
  await graphqlRequest(`
    mutation RestoreService($id: ID!) { restoreService(id: $id) { _id } }
  `, { id });
}

export async function gqlDeleteService(id: string): Promise<void> {
  await graphqlRequest(`
    mutation DeleteService($id: ID!) { deleteService(id: $id) { _id } }
  `, { id });
}

// ─── Enum mapping helpers ──────────────────────────────────────────────────────

// GraphQL enum wire values are the TypeScript enum KEY names (uppercase),
// not the string values. e.g. PricingType.PER_KILO='per_kilo' → wire: 'PER_KILO'.

const PRICING_TYPE_TO_BE: Record<string, string> = {
  "per kg":               "PER_KILO",
  "per kilo":             "PER_KILO",
  "per_kilo":             "PER_KILO",
  "PER_KILO":             "PER_KILO",
  "kg":                   "PER_KILO",
  "per pc":               "PER_PIECE",
  "per piece":            "PER_PIECE",
  "per_piece":            "PER_PIECE",
  "PER_PIECE":            "PER_PIECE",
  "per set":              "PER_PIECE",
  "per load":             "PER_LOAD",
  "per_load":             "PER_LOAD",
  "PER_LOAD":             "PER_LOAD",
  "per kg + base":        "PER_KILO_WITH_BASE",
  "per_kilo_with_base":   "PER_KILO_WITH_BASE",
  "PER_KILO_WITH_BASE":   "PER_KILO_WITH_BASE",
};

const PRICING_TYPE_FROM_BE: Record<string, string> = {
  // uppercase — what GraphQL returns
  "PER_KILO":           "per kg",
  "PER_PIECE":          "per pc",
  "PER_LOAD":           "per load",
  "PER_KILO_WITH_BASE": "per kg + base",
  // lowercase — legacy fallback
  "per_kilo":           "per kg",
  "per_piece":          "per pc",
  "per_load":           "per load",
  "per_kilo_with_base": "per kg + base",
};

const CATEGORY_TO_BE: Record<string, string> = {
  // canonical display labels
  "Wash & Fold":    "WASH_AND_FOLD",
  "Wash & Iron":    "WASH_AND_IRON",
  "Wash Only":      "WASH_ONLY",
  "Dry Clean":      "DRY_CLEAN",
  "Iron Only":      "IRON_ONLY",
  "Express":        "EXPRESS",
  "Delicate":       "DELICATE",
  "Bedding":        "BEDDING",
  "Curtains":       "CURTAINS",
  "Shoes":          "SHOES",
  "Bags":           "BAGS",
  "Other":          "OTHER",
  // legacy display labels (kept so old saved form state doesn't break)
  "Wash":           "WASH_AND_FOLD",
  "Dry":            "DRY_CLEAN",
  "Iron":           "IRON_ONLY",
  "Premium":        "OTHER",
  // BE key names passed through
  "WASH_AND_FOLD":  "WASH_AND_FOLD",
  "WASH_AND_IRON":  "WASH_AND_IRON",
  "WASH_ONLY":      "WASH_ONLY",
  "DRY_CLEAN":      "DRY_CLEAN",
  "IRON_ONLY":      "IRON_ONLY",
  "EXPRESS":        "EXPRESS",
  "DELICATE":       "DELICATE",
  "BEDDING":        "BEDDING",
  "CURTAINS":       "CURTAINS",
  "SHOES":          "SHOES",
  "BAGS":           "BAGS",
  "OTHER":          "OTHER",
  // lowercase BE values as fallback
  "wash_and_fold":  "WASH_AND_FOLD",
  "wash_and_iron":  "WASH_AND_IRON",
  "wash_only":      "WASH_ONLY",
  "dry_clean":      "DRY_CLEAN",
  "iron_only":      "IRON_ONLY",
  "express":        "EXPRESS",
  "delicate":       "DELICATE",
  "bedding":        "BEDDING",
  "curtains":       "CURTAINS",
  "shoes":          "SHOES",
  "bags":           "BAGS",
  "other":          "OTHER",
};

const CATEGORY_FROM_BE: Record<string, string> = {
  // uppercase — what GraphQL returns
  "WASH_AND_FOLD":  "Wash & Fold",
  "WASH_AND_IRON":  "Wash & Iron",
  "WASH_ONLY":      "Wash Only",
  "DRY_CLEAN":      "Dry Clean",
  "IRON_ONLY":      "Iron Only",
  "EXPRESS":        "Express",
  "DELICATE":       "Delicate",
  "BEDDING":        "Bedding",
  "CURTAINS":       "Curtains",
  "SHOES":          "Shoes",
  "BAGS":           "Bags",
  "OTHER":          "Other",
  // lowercase — legacy fallback
  "wash_and_fold":  "Wash & Fold",
  "wash_and_iron":  "Wash & Iron",
  "wash_only":      "Wash Only",
  "dry_clean":      "Dry Clean",
  "iron_only":      "Iron Only",
  "express":        "Express",
  "delicate":       "Delicate",
  "bedding":        "Bedding",
  "curtains":       "Curtains",
  "shoes":          "Shoes",
  "bags":           "Bags",
  "other":          "Other",
};

export function toPricingType(unit: string): string {
  return PRICING_TYPE_TO_BE[unit] ?? "PER_KILO";
}

export function fromPricingType(beUnit: string): string {
  return PRICING_TYPE_FROM_BE[beUnit] ?? "per kg";
}

export function toServiceCategory(category: string): string {
  return CATEGORY_TO_BE[category] ?? "OTHER";
}

export function fromServiceCategory(beCategory: string): string {
  return CATEGORY_FROM_BE[beCategory] ?? "Other";
}
