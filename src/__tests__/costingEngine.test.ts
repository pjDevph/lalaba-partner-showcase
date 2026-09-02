// src/__tests__/costingEngine.test.ts
// Costing engine: supplies (recipe) cost from Services × Inventory, unit
// grouping of BE pricing types, and per-order cost aggregation.
// Pure functions — no mocks needed.

import {
  unitGroupOf,
  serviceRecipeCost,
  aggregateByUnit,
  computeDailyReport,
  DEFAULT_CONFIG,
  type InventoryCostInfo,
  type ServiceCostRef,
} from "../features/costing/costing";

// ── unitGroupOf — BE PricingType wire values ───────────────────────────────

describe("unitGroupOf()", () => {
  it("HP: maps BE wire values to unit groups", () => {
    expect(unitGroupOf("PER_KILO")).toBe("kg");
    expect(unitGroupOf("PER_KILO_WITH_BASE")).toBe("kg");
    expect(unitGroupOf("PER_LOAD")).toBe("load");
    expect(unitGroupOf("PER_PIECE")).toBe("piece");
  });

  it("HP: maps FE display labels to unit groups", () => {
    expect(unitGroupOf("per kg")).toBe("kg");
    expect(unitGroupOf("per load")).toBe("load");
    expect(unitGroupOf("per pc")).toBe("piece");
  });

  it("EC: unknown or empty unit falls back to order", () => {
    expect(unitGroupOf("")).toBe("order");
    expect(unitGroupOf("something")).toBe("order");
  });
});

// ── serviceRecipeCost — default products × inventory unit costs ────────────

const INVENTORY: Record<string, InventoryCostInfo> = {
  det: { cost: 200, unit: "kg" },   // ₱200 per kg of detergent
  fab: { cost: 0.5, unit: "ml" },   // ₱0.50 per ml of fabcon
  bag: { cost: 5, unit: "pieces" }, // ₱5 per bag
};

describe("serviceRecipeCost()", () => {
  it("HP: converts default-product units to the inventory unit", () => {
    // 50 g of detergent priced per kg → 0.05 kg × ₱200 = ₱10 per kg of laundry
    const rc = serviceRecipeCost(
      [{ inventoryId: "det", quantity: 50, unit: "g", per: "kg" }],
      INVENTORY,
    );
    expect(rc.perUnit).toBeCloseTo(10);
    expect(rc.perOrder).toBe(0);
  });

  it("HP: splits per-unit and per-order components", () => {
    const rc = serviceRecipeCost(
      [
        { inventoryId: "det", quantity: 50, unit: "g", per: "kg" },   // ₱10/kg
        { inventoryId: "bag", quantity: 1, unit: "pieces", per: "order" }, // ₱5/order
      ],
      INVENTORY,
    );
    expect(rc.perUnit).toBeCloseTo(10);
    expect(rc.perOrder).toBeCloseTo(5);
  });

  it("HP: unset `per` counts once per order", () => {
    const rc = serviceRecipeCost([{ inventoryId: "bag", quantity: 2 }], INVENTORY);
    expect(rc.perOrder).toBeCloseTo(10);
  });

  it("EC: unknown inventory ids and zero-cost items contribute nothing", () => {
    const rc = serviceRecipeCost(
      [
        { inventoryId: "missing", quantity: 5, unit: "g", per: "kg" },
        { inventoryId: "free", quantity: 5, unit: "g", per: "kg" },
      ],
      { free: { cost: 0, unit: "g" } },
    );
    expect(rc.perUnit).toBe(0);
    expect(rc.perOrder).toBe(0);
  });

  it("EC: empty / missing default products → zero", () => {
    expect(serviceRecipeCost([], INVENTORY)).toEqual({ perUnit: 0, perOrder: 0 });
    expect(serviceRecipeCost(undefined, INVENTORY)).toEqual({ perUnit: 0, perOrder: 0 });
  });
});

// ── aggregateByUnit — recipe cost lands in the daily report ────────────────

const SERVICE_BY_ID: Record<string, ServiceCostRef> = {
  wash: { cost: 10, costPerOrder: 5, unit: "PER_KILO" },
};

const ORDERS = [
  {
    status: "COMPLETED",
    items: [{ serviceId: "wash", weightKg: 8, lineTotal: 400 }],
  },
];

describe("aggregateByUnit()", () => {
  it("HP: recipe cost = qty × per-unit + per-order once per line", () => {
    const prod = aggregateByUnit(ORDERS, SERVICE_BY_ID);
    expect(prod).toHaveLength(1);
    expect(prod[0].unit).toBe("kg");
    expect(prod[0].qty).toBe(8);
    expect(prod[0].revenue).toBe(400);
    expect(prod[0].recipeCost).toBeCloseTo(8 * 10 + 5);
  });

  it("EC: cancelled orders are skipped", () => {
    const prod = aggregateByUnit(
      [{ ...ORDERS[0], status: "CANCELLED" }],
      SERVICE_BY_ID,
    );
    expect(prod).toHaveLength(0);
  });

  it("HP: recipe cost flows into computeDailyReport totals", () => {
    const production = aggregateByUnit(ORDERS, SERVICE_BY_ID);
    const report = computeDailyReport({
      date: "2026-07-17",
      production,
      electricity: 100, lpg: 0, water: 50,
      oneOffToday: 0,
      config: DEFAULT_CONFIG,
    });
    expect(report.recipeCost).toBeCloseTo(85);
    expect(report.totalCost).toBeCloseTo(85 + 150);
    expect(report.trueMargin).toBeCloseTo(400 - 235);
    expect(report.kilos).toBe(8);
  });
});
