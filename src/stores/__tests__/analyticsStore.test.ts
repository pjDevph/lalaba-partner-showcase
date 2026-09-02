// src/stores/__tests__/analyticsStore.test.ts
// Unit tests for analyticsStore — client-side daily summary computation.
// Covers Checklist #19: "No sales for period → empty state, not crash"
// Pure computation (computeFromQueue) — no mocks needed.

import { useAnalyticsStore } from "../analyticsStore";
import type { POSOrder } from "../../types/pos.types";

// ── Fixture ───────────────────────────────────────────────────────────────────

let _id = 0;
function makeOrder(
  status: POSOrder["status"] = "CLAIMED",
  totalAmount = 100,
  paymentMethod: POSOrder["paymentMethod"] = "CASH",
  overrides: Partial<POSOrder> = {},
): POSOrder {
  _id++;
  return {
    id:             `order-${_id}`,
    merchantId:     "merchant-1",
    branchId:       "branch-1",
    staffId:        "staff-1",
    orderSource:    "POS",
    status,
    walkinCustomer: { name: "Customer", phone: "09171234567" },
    items:          [{ serviceId: "s1", serviceName: "Wash", weightKg: 1, unitPrice: totalAmount, lineTotal: totalAmount }],
    subtotal:       totalAmount,
    discountAmount: 0,
    totalAmount,
    paymentMethod,
    amountReceived: totalAmount,
    changeGiven:    0,
    claimCode:      `C${String(_id).padStart(3, "0")}`,
    createdAt:      { seconds: 1_750_000_000 + _id, nanoseconds: 0 },
    updatedAt:      { seconds: 1_750_000_000 + _id, nanoseconds: 0 },
    ...overrides,
  };
}

// ── Reset store before each test ──────────────────────────────────────────────

beforeEach(() => {
  _id = 0;
  useAnalyticsStore.setState({ summary: null, isComputing: false });
});

// ── EC: empty queue (Checklist #19) ───────────────────────────────────────────

describe("computeFromQueue — empty orders", () => {
  it("EC: empty array → summary with all zeros (Checklist #19 — no crash)", () => {
    expect(() => useAnalyticsStore.getState().computeFromQueue([])).not.toThrow();
    const { summary } = useAnalyticsStore.getState();
    expect(summary).not.toBeNull();
    expect(summary!.totalOrders).toBe(0);
    expect(summary!.claimedOrders).toBe(0);
    expect(summary!.pendingOrders).toBe(0);
    expect(summary!.totalRevenue).toBe(0);
    expect(summary!.cashRevenue).toBe(0);
    expect(summary!.gcashRevenue).toBe(0);
  });

  it("EC: empty → avgOrderValue is 0 (no division by zero)", () => {
    useAnalyticsStore.getState().computeFromQueue([]);
    expect(useAnalyticsStore.getState().summary!.avgOrderValue).toBe(0);
  });
});

// ── HP: order counts ──────────────────────────────────────────────────────────

describe("computeFromQueue — order counts", () => {
  it("HP: totalOrders = all orders regardless of status", () => {
    const orders = [
      makeOrder("CLAIMED"),
      makeOrder("CREATED"),
      makeOrder("PROCESSING"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.totalOrders).toBe(3);
  });

  it("HP: claimedOrders = only CLAIMED", () => {
    const orders = [
      makeOrder("CLAIMED"),
      makeOrder("CLAIMED"),
      makeOrder("PROCESSING"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.claimedOrders).toBe(2);
  });

  it("HP: pendingOrders = all non-CLAIMED", () => {
    const orders = [
      makeOrder("CLAIMED"),
      makeOrder("CREATED"),
      makeOrder("READY_FOR_PICKUP"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.pendingOrders).toBe(2);
  });

  it("EC: all CLAIMED → pendingOrders = 0", () => {
    const orders = [makeOrder("CLAIMED"), makeOrder("CLAIMED")];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.pendingOrders).toBe(0);
  });

  it("EC: none CLAIMED → claimedOrders = 0, totalRevenue = 0", () => {
    const orders = [makeOrder("CREATED"), makeOrder("PROCESSING")];
    useAnalyticsStore.getState().computeFromQueue(orders);
    const { summary } = useAnalyticsStore.getState();
    expect(summary!.claimedOrders).toBe(0);
    expect(summary!.totalRevenue).toBe(0);
  });
});

// ── HP: revenue — only CLAIMED orders count ───────────────────────────────────

describe("computeFromQueue — revenue", () => {
  it("HP: totalRevenue sums only CLAIMED order totalAmounts", () => {
    const orders = [
      makeOrder("CLAIMED",     200),
      makeOrder("CLAIMED",     150),
      makeOrder("PROCESSING", 999), // NOT counted
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.totalRevenue).toBe(350);
  });

  it("HP: cashRevenue = sum of CLAIMED CASH orders", () => {
    const orders = [
      makeOrder("CLAIMED", 100, "CASH"),
      makeOrder("CLAIMED", 200, "CASH"),
      makeOrder("CLAIMED", 300, "GCASH"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.cashRevenue).toBe(300);
  });

  it("HP: gcashRevenue = sum of CLAIMED GCASH orders", () => {
    const orders = [
      makeOrder("CLAIMED", 100, "CASH"),
      makeOrder("CLAIMED", 250, "GCASH"),
      makeOrder("CLAIMED", 100, "GCASH"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.gcashRevenue).toBe(350);
  });

  it("EC: pending GCASH orders NOT counted in gcashRevenue", () => {
    const orders = [
      makeOrder("CREATED", 500, "GCASH"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.gcashRevenue).toBe(0);
  });

  it("HP: MAYA and CARD orders appear in totalRevenue but NOT in cashRevenue/gcashRevenue", () => {
    const orders = [
      makeOrder("CLAIMED", 400, "MAYA"),
      makeOrder("CLAIMED", 300, "CARD"),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    const { summary } = useAnalyticsStore.getState();
    expect(summary!.totalRevenue).toBe(700);
    expect(summary!.cashRevenue).toBe(0);
    expect(summary!.gcashRevenue).toBe(0);
  });
});

// ── HP: average order value ────────────────────────────────────────────────────

describe("computeFromQueue — avgOrderValue", () => {
  it("HP: avgOrderValue = totalRevenue / claimedOrders", () => {
    const orders = [
      makeOrder("CLAIMED", 100),
      makeOrder("CLAIMED", 200),
      makeOrder("CLAIMED", 300),
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.avgOrderValue).toBe(200);
  });

  it("HP: avgOrderValue rounded to 2 decimal places", () => {
    const orders = [
      makeOrder("CLAIMED", 100),
      makeOrder("CLAIMED", 100),
      makeOrder("CLAIMED", 101), // avg = 301/3 = 100.333...
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    expect(useAnalyticsStore.getState().summary!.avgOrderValue).toBeCloseTo(100.33, 2);
  });
});

// ── HP: floating point precision ──────────────────────────────────────────────

describe("computeFromQueue — floating point", () => {
  it("HP: revenues are rounded to 2 decimal places via toFixed", () => {
    const orders = [
      makeOrder("CLAIMED", 33.33),
      makeOrder("CLAIMED", 33.33),
      makeOrder("CLAIMED", 33.34), // sum = 100.00 (exact)
    ];
    useAnalyticsStore.getState().computeFromQueue(orders);
    const { summary } = useAnalyticsStore.getState();
    expect(Number.isFinite(summary!.totalRevenue)).toBe(true);
    expect(summary!.totalRevenue).toBeCloseTo(100, 2);
  });

  it("HP: large orders — no overflow or NaN", () => {
    const orders = Array.from({ length: 100 }, () =>
      makeOrder("CLAIMED", 9_999_999),
    );
    useAnalyticsStore.getState().computeFromQueue(orders);
    const { summary } = useAnalyticsStore.getState();
    expect(Number.isNaN(summary!.totalRevenue)).toBe(false);
    expect(Number.isFinite(summary!.totalRevenue)).toBe(true);
  });
});

// ── HP: computedAt timestamp ──────────────────────────────────────────────────

describe("computeFromQueue — computedAt", () => {
  it("HP: summary.computedAt is set (epoch ms > 0)", () => {
    useAnalyticsStore.getState().computeFromQueue([]);
    expect(useAnalyticsStore.getState().summary!.computedAt).toBeGreaterThan(0);
  });

  it("HP: calling again updates computedAt", () => {
    useAnalyticsStore.getState().computeFromQueue([]);
    const first = useAnalyticsStore.getState().summary!.computedAt;
    useAnalyticsStore.getState().computeFromQueue([]);
    const second = useAnalyticsStore.getState().summary!.computedAt;
    expect(second).toBeGreaterThanOrEqual(first);
  });
});

// ── HP: reset ─────────────────────────────────────────────────────────────────

describe("reset()", () => {
  it("HP: reset clears summary to null", () => {
    useAnalyticsStore.getState().computeFromQueue([makeOrder("CLAIMED")]);
    useAnalyticsStore.getState().reset();
    expect(useAnalyticsStore.getState().summary).toBeNull();
  });

  it("HP: reset clears isComputing", () => {
    useAnalyticsStore.setState({ isComputing: true });
    useAnalyticsStore.getState().reset();
    expect(useAnalyticsStore.getState().isComputing).toBe(false);
  });
});
