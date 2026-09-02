// src/services/graphql/costing.ts
// GraphQL operations for the costing domain.
// BE uses JSON scalar (graphql-type-json) for CostingConfig and DailyReport
// since both are complex nested objects that evolve with the costing engine.

import { graphqlRequest } from "../../config/graphql";
import type { CostingConfig } from "../../features/costing/costing";
import type { DailyReport } from "../../features/costing/costing";

// ─── Config ───────────────────────────────────────────────────────────────────

// The config is a JSON scalar on the wire — the backend stores it opaquely, so
// there is no schema to derive a type from. Callers run it through
// mapConfig() (src/features/costing/costing.ts), which narrows it properly.
export async function gqlGetCostingConfig(branchId: string): Promise<unknown> {
  const res = await graphqlRequest<{ costingConfig: unknown }>(
    `query CostingConfig($branchId: ID!) {
      costingConfig(branchId: $branchId)
    }`,
    { branchId },
  );
  return res.costingConfig ?? {};
}

export async function gqlUpsertCostingConfig(
  branchId: string,
  config: CostingConfig,
): Promise<void> {
  await graphqlRequest(
    `mutation UpsertCostingConfig($branchId: ID!, $config: JSON!) {
      upsertCostingConfig(branchId: $branchId, config: $config)
    }`,
    { branchId, config },
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function gqlGetCostingReports(branchId: string): Promise<DailyReport[]> {
  const res = await graphqlRequest<{ costingReports: DailyReport[] }>(
    `query CostingReports($branchId: ID!) {
      costingReports(branchId: $branchId) {
        id date kilos revenue recipeCost
        electricity lpg water additionalDaily fixedTotal operating
        totalCost costPerKilo trueMargin
        elecReading waterReading lpgReading
        oneOffCosts { name amount }
        units { unit qty revenue recipeCost operatingCost totalCost costPerUnit trueMargin }
        branches { branchId branchName kilos revenue recipeCost operatingCost totalCost costPerKilo trueMargin }
        savedAt createdBy updatedBy firstSavedAt
      }
    }`,
    { branchId },
  );
  return res.costingReports ?? [];
}

// `report` is a JSON scalar too, and the payload the screen builds is an ad-hoc
// document rather than one of the exported domain types — so a JSON-shaped
// record is the honest constraint here. It still rejects primitives and arrays,
// which `any` did not.
export async function gqlUpsertCostingReport(
  branchId: string,
  report: Record<string, unknown>,
): Promise<void> {
  await graphqlRequest(
    `mutation UpsertCostingReport($branchId: ID!, $report: JSON!) {
      upsertCostingReport(branchId: $branchId, report: $report) { id date }
    }`,
    { branchId, report },
  );
}
