// src/services/graphql/analytics.ts
// Server-side analytics queries — revenue summaries and time-series data.
// All queries scope to paid orders only and use Philippine time (+08:00).

import { graphqlRequest } from "../../config/graphql";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RevenueSummary {
  totalRevenue:   number;
  totalOrders:    number;
  avgOrderValue:  number;
  totalRefunded:  number;
  totalDiscounts: number;
}

export interface BranchRevenueSummary {
  branchId:      string;
  branchName:    string;
  totalRevenue:  number;
  totalOrders:   number;
  avgOrderValue: number;
}

export interface RevenueDataPoint {
  period:        string;   // "YYYY-MM-DD" | "YYYY-WNN" | "YYYY-MM"
  totalRevenue:  number;
  orderCount:    number;
  avgOrderValue: number;
}

export type AnalyticsGranularity = "DAY" | "WEEK" | "MONTH";

export interface AnalyticsFilterInput {
  dateFrom:     string;              // ISO datetime e.g. "2024-01-01T00:00:00Z"
  dateTo:       string;
  branchId?:    string;              // omit for all branches
  granularity?: AnalyticsGranularity; // only used by revenueOverTime
}

// ─── revenueSummary ───────────────────────────────────────────────────────────
export async function gqlRevenueSummary(
  filter: AnalyticsFilterInput
): Promise<RevenueSummary> {
  const data = await graphqlRequest<{ revenueSummary: RevenueSummary }>(
    `query RevenueSummary($filter: AnalyticsFilterInput!) {
       revenueSummary(filter: $filter) {
         totalRevenue totalOrders avgOrderValue totalRefunded totalDiscounts
       }
     }`,
    { filter }
  );
  return data.revenueSummary;
}

// ─── revenueSummaryByBranch ───────────────────────────────────────────────────
// Always merchant-wide — branchId filter is ignored by the backend.
export async function gqlRevenueSummaryByBranch(
  filter: Omit<AnalyticsFilterInput, "branchId">
): Promise<BranchRevenueSummary[]> {
  const data = await graphqlRequest<{ revenueSummaryByBranch: BranchRevenueSummary[] }>(
    `query RevenueSummaryByBranch($filter: AnalyticsFilterInput!) {
       revenueSummaryByBranch(filter: $filter) {
         branchId branchName totalRevenue totalOrders avgOrderValue
       }
     }`,
    { filter }
  );
  return data.revenueSummaryByBranch;
}

// ─── revenueOverTime ──────────────────────────────────────────────────────────
// Sparse — periods with zero orders are omitted from the response.
export async function gqlRevenueOverTime(
  filter: AnalyticsFilterInput & { granularity: AnalyticsGranularity }
): Promise<RevenueDataPoint[]> {
  const data = await graphqlRequest<{ revenueOverTime: RevenueDataPoint[] }>(
    `query RevenueOverTime($filter: AnalyticsFilterInput!) {
       revenueOverTime(filter: $filter) {
         period totalRevenue orderCount avgOrderValue
       }
     }`,
    { filter }
  );
  return data.revenueOverTime;
}

// ─── assertReportExport ───────────────────────────────────────────────────────
// Backend authorization checkpoint for report/data exports. Reports are built
// on the client from data staff can already view, so the export flow must clear
// this server-side gate first — it throws (FORBIDDEN) unless the caller holds
// the `report_export` permission. Returns true when authorized.
export async function gqlAssertReportExport(): Promise<boolean> {
  const data = await graphqlRequest<{ assertReportExport: boolean }>(
    `query AssertReportExport { assertReportExport }`,
    {}
  );
  return data.assertReportExport;
}
