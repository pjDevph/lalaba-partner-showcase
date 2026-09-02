// src/services/graphql/__tests__/analytics.test.ts
// Unit tests for the analytics GraphQL service functions.
// All functions are thin wrappers around graphqlRequest — we mock the client
// and verify (a) the correct query key is forwarded, (b) variables are passed,
// and (c) errors propagate unmodified.

jest.mock('../../../config/graphql', () => ({
  graphqlRequest: jest.fn(),
}));

import { graphqlRequest } from '../../../config/graphql';
import {
  gqlRevenueSummary,
  gqlRevenueSummaryByBranch,
  gqlRevenueOverTime,
} from '../analytics';

const mockGql = graphqlRequest as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const filter = {
  dateFrom: '2026-01-01T00:00:00Z',
  dateTo: '2026-12-31T23:59:59Z',
};

const filterWithGranularity = {
  ...filter,
  granularity: 'DAY' as const,
};

const mockSummary = {
  totalRevenue: 5000,
  totalOrders: 20,
  avgOrderValue: 250,
  totalRefunded: 100,
  totalDiscounts: 50,
};

const mockBranchSummary = [
  {
    branchId: 'b1',
    branchName: 'Main',
    totalRevenue: 5000,
    totalOrders: 20,
    avgOrderValue: 250,
  },
];

const mockDataPoints = [
  {
    period: '2026-01-15',
    totalRevenue: 500,
    orderCount: 2,
    avgOrderValue: 250,
  },
];

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGql.mockReset();
});

// ─── gqlRevenueSummary ───────────────────────────────────────────────────────

describe('gqlRevenueSummary', () => {
  it('HP: returns revenueSummary from graphqlRequest response', async () => {
    mockGql.mockResolvedValueOnce({ revenueSummary: mockSummary });

    const result = await gqlRevenueSummary(filter);

    expect(result).toEqual(mockSummary);
  });

  it('HP: calls graphqlRequest with a query containing "revenueSummary"', async () => {
    mockGql.mockResolvedValueOnce({ revenueSummary: mockSummary });

    await gqlRevenueSummary(filter);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringContaining('revenueSummary'),
      { filter },
    );
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Network error'));

    await expect(gqlRevenueSummary(filter)).rejects.toThrow('Network error');
  });
});

// ─── gqlRevenueSummaryByBranch ───────────────────────────────────────────────

describe('gqlRevenueSummaryByBranch', () => {
  it('HP: returns revenueSummaryByBranch array from graphqlRequest response', async () => {
    mockGql.mockResolvedValueOnce({ revenueSummaryByBranch: mockBranchSummary });

    const result = await gqlRevenueSummaryByBranch(filter);

    expect(result).toEqual(mockBranchSummary);
  });

  it('HP: calls graphqlRequest with a query containing "revenueSummaryByBranch"', async () => {
    mockGql.mockResolvedValueOnce({ revenueSummaryByBranch: mockBranchSummary });

    await gqlRevenueSummaryByBranch(filter);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringContaining('revenueSummaryByBranch'),
      { filter },
    );
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Server error'));

    await expect(gqlRevenueSummaryByBranch(filter)).rejects.toThrow('Server error');
  });
});

// ─── gqlRevenueOverTime ───────────────────────────────────────────────────────

describe('gqlRevenueOverTime', () => {
  it('HP: returns revenueOverTime array from graphqlRequest response', async () => {
    mockGql.mockResolvedValueOnce({ revenueOverTime: mockDataPoints });

    const result = await gqlRevenueOverTime(filterWithGranularity);

    expect(result).toEqual(mockDataPoints);
  });

  it('HP: calls graphqlRequest with a query containing "revenueOverTime"', async () => {
    mockGql.mockResolvedValueOnce({ revenueOverTime: mockDataPoints });

    await gqlRevenueOverTime(filterWithGranularity);

    expect(mockGql).toHaveBeenCalledTimes(1);
    expect(mockGql).toHaveBeenCalledWith(
      expect.stringContaining('revenueOverTime'),
      { filter: filterWithGranularity },
    );
  });

  it('EC: propagates errors thrown by graphqlRequest', async () => {
    mockGql.mockRejectedValueOnce(new Error('Timeout'));

    await expect(gqlRevenueOverTime(filterWithGranularity)).rejects.toThrow('Timeout');
  });
});
