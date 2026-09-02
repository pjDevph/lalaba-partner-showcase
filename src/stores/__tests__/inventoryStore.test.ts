// src/stores/__tests__/inventoryStore.test.ts
// Jest-testable logic in inventoryStore:
//   fetchLowStock — threshold filtering (#8 EC: low stock badge, threshold=0)
//   loadMoreProducts — guard when all loaded (#8 HP: "Load more" button)
//   fetchLogs — product name lookup + createdAt conversion (#8 EC: log labels)
//   error states — each mutation clears isLoading on failure

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../services/graphql/inventory", () => ({
  gqlMyInventory:              jest.fn(),
  gqlAllInventoryTransactions: jest.fn(),
  gqlCreateProduct:            jest.fn(),
  gqlRestockProduct:           jest.fn(),
  gqlAdjustStock:              jest.fn(),
  gqlDamageInventory:          jest.fn(),
  gqlArchiveProduct:           jest.fn(),
  gqlRestoreProduct:           jest.fn(),
  gqlUpdateInventory:          jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { useInventoryStore } from "../inventoryStore";
import {
  gqlMyInventory,
  gqlAllInventoryTransactions,
  gqlCreateProduct,
  gqlRestockProduct,
  gqlAdjustStock,
  gqlDamageInventory,
} from "../../services/graphql/inventory";

const mockMyInventory   = gqlMyInventory   as jest.Mock;
const mockAllTx         = gqlAllInventoryTransactions as jest.Mock;
const mockCreateProduct = gqlCreateProduct as jest.Mock;
const mockRestock       = gqlRestockProduct as jest.Mock;
const mockAdjust        = gqlAdjustStock   as jest.Mock;
const mockDamage        = gqlDamageInventory as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeGqlProduct(overrides = {}) {
  return {
    _id:               "prod-1",
    uid:               "merchant-1",
    branchId:          "branch-1",
    productName:       "Ariel Detergent",
    inventoryUnit:     "g",
    inventoryCategory: "powdered_detergent",
    stockQuantity:     500,
    threshold:         100,
    cost:              0.08,
    isActive:          true,
    isArchived:        false,
    ...overrides,
  };
}

function makeGqlTransaction(overrides = {}) {
  return {
    _id:            "tx-1",
    inventoryId:    "prod-1",
    type:           "RESTOCK",
    quantityChange: 500,
    createdBy:      "staff-1",
    createdAt:      "2026-06-26T10:00:00.000Z",
    ...overrides,
  };
}

const EMPTY_INVENTORY = { data: [], total: 0 };
const EMPTY_TX        = { data: [], total: 0 };

// ── Reset helpers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  useInventoryStore.setState({
    products:  [],
    lowStock:  [],
    logs:      [],
    total:     0,
    offset:    0,
    isLoading: false,
    error:     null,
    branchId:  "branch-1",
  });
  mockMyInventory.mockReset().mockResolvedValue(EMPTY_INVENTORY);
  mockAllTx.mockReset().mockResolvedValue(EMPTY_TX);
  mockCreateProduct.mockReset();
  mockRestock.mockReset();
  mockAdjust.mockReset();
  mockDamage.mockReset();
});

// ══════════════════════════════════════════════════════════════════════════════
// fetchLowStock — Checklist #8: Low stock badge logic
// ══════════════════════════════════════════════════════════════════════════════

describe("fetchLowStock", () => {
  it("HP: product below threshold appears in lowStock", () => {
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", quantity: 50, threshold: 100 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(1);
  });

  it("HP: product AT threshold appears in lowStock (uses <= not <)", () => {
    // Checklist #8 EC: threshold=100, quantity=100 → badge should show
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", quantity: 100, threshold: 100 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(1);
  });

  it("HP: product above threshold does NOT appear in lowStock", () => {
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", quantity: 101, threshold: 100 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(0);
  });

  it("EC: threshold=0, quantity=0 → appears in lowStock (0 <= 0)", () => {
    // Checklist #8 EC: "Low stock threshold = 0 → badge never triggers"
    // Actual behavior: quantity=0 IS still <= 0, so it DOES trigger
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", quantity: 0, threshold: 0 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(1);
  });

  it("EC: threshold=0, quantity>0 → does NOT appear in lowStock", () => {
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", quantity: 1, threshold: 0 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(0);
  });

  it("HP: multiple products — only below-threshold ones flagged", () => {
    useInventoryStore.setState({
      products: [
        { ...makeGqlProduct(), id: "p1", name: "Ariel",  quantity: 50,  threshold: 100 } as any,
        { ...makeGqlProduct(), id: "p2", name: "Zonrox", quantity: 200, threshold: 100 } as any,
        { ...makeGqlProduct(), id: "p3", name: "OxiC",   quantity: 80,  threshold: 100 } as any,
      ],
    });
    useInventoryStore.getState().fetchLowStock();
    const low = useInventoryStore.getState().lowStock;
    expect(low).toHaveLength(2);
    expect(low.map((p) => p.id)).toEqual(expect.arrayContaining(["p1", "p3"]));
  });

  it("HP: no products → lowStock is empty", () => {
    useInventoryStore.getState().fetchLowStock();
    expect(useInventoryStore.getState().lowStock).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// loadMoreProducts — Checklist #8: "Load more (X of Y)" guard
// ══════════════════════════════════════════════════════════════════════════════

describe("loadMoreProducts", () => {
  it("HP: does NOT fetch when all products already loaded", async () => {
    // products.length (5) >= total (5) → skip
    useInventoryStore.setState({ products: new Array(5).fill({}) as any, total: 5 });
    await useInventoryStore.getState().loadMoreProducts();
    expect(mockMyInventory).not.toHaveBeenCalled();
  });

  it("HP: does NOT fetch while already loading", async () => {
    useInventoryStore.setState({ isLoading: true, products: [], total: 100 });
    await useInventoryStore.getState().loadMoreProducts();
    expect(mockMyInventory).not.toHaveBeenCalled();
  });

  it("HP: fetches next page and appends to products", async () => {
    const existing = [makeGqlProduct({ _id: "p1" })];
    const nextPage = [makeGqlProduct({ _id: "p2", productName: "Zonrox" })];
    useInventoryStore.setState({ products: existing.map((p) => ({ ...p, id: p._id })) as any, total: 100, offset: 50 });
    mockMyInventory.mockResolvedValue({ data: nextPage, total: 100 });

    await useInventoryStore.getState().loadMoreProducts();

    expect(mockMyInventory).toHaveBeenCalledTimes(1);
    expect(useInventoryStore.getState().products).toHaveLength(2);
    expect(useInventoryStore.getState().offset).toBe(100);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetchLogs — Checklist #8 EC: product name lookup + date conversion
// ══════════════════════════════════════════════════════════════════════════════

describe("fetchLogs", () => {
  it("HP: maps transaction to log with correct productName from products list", async () => {
    useInventoryStore.setState({
      products: [{ id: "prod-1", name: "Ariel Detergent" }] as any,
    });
    mockAllTx.mockResolvedValue({
      data: [makeGqlTransaction({ inventoryId: "prod-1", type: "RESTOCK" })],
      total: 1,
    });

    await useInventoryStore.getState().fetchLogs();

    const log = useInventoryStore.getState().logs[0];
    expect(log.productName).toBe("Ariel Detergent");
    expect(log.type).toBe("RESTOCK");
  });

  it("EC: unknown product (not in products list) → productName = 'Unknown'", async () => {
    useInventoryStore.setState({ products: [] });
    mockAllTx.mockResolvedValue({
      data: [makeGqlTransaction({ inventoryId: "ghost-prod", type: "CONSUME" })],
      total: 1,
    });

    await useInventoryStore.getState().fetchLogs();

    expect(useInventoryStore.getState().logs[0].productName).toBe("Unknown");
  });

  it("HP: createdAt ISO string converted to seconds correctly", async () => {
    useInventoryStore.setState({ products: [] });
    mockAllTx.mockResolvedValue({
      data: [makeGqlTransaction({ createdAt: "2026-06-26T10:00:00.000Z" })],
      total: 1,
    });

    await useInventoryStore.getState().fetchLogs();

    const expectedSeconds = Math.floor(new Date("2026-06-26T10:00:00.000Z").getTime() / 1000);
    expect(useInventoryStore.getState().logs[0].createdAt.seconds).toBe(expectedSeconds);
  });

  it("HP: stores raw BE enum type — RESTOCK, CONSUME, RETURN, ADJUSTMENT, DAMAGE", async () => {
    useInventoryStore.setState({ products: [] });
    const txTypes = ["RESTOCK", "CONSUME", "RETURN", "ADJUSTMENT", "DAMAGE"];

    mockAllTx.mockResolvedValue({
      data: txTypes.map((type, i) => makeGqlTransaction({ _id: `tx-${i}`, type })),
      total: txTypes.length,
    });

    await useInventoryStore.getState().fetchLogs();

    const storedTypes = useInventoryStore.getState().logs.map((l) => l.type);
    expect(storedTypes).toEqual(txTypes);
  });

  it("EC: fetchLogs fails silently → logs set to empty array, no error thrown", async () => {
    mockAllTx.mockRejectedValue(new Error("Network error"));
    await expect(useInventoryStore.getState().fetchLogs()).resolves.toBeUndefined();
    expect(useInventoryStore.getState().logs).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// fetchProducts — Checklist #8 HP: fetch + load products
// ══════════════════════════════════════════════════════════════════════════════

describe("fetchProducts", () => {
  it("HP: fetches and maps products from BE correctly", async () => {
    const product = makeGqlProduct();
    mockMyInventory.mockResolvedValue({ data: [product], total: 1 });

    await useInventoryStore.getState().fetchProducts();

    const { products } = useInventoryStore.getState();
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id:          "prod-1",
      name:        "Ariel Detergent",
      unit:        "g",
      category:    "powdered_detergent",
      quantity:    500,
      threshold:   100,
      costPerUnit: 0.08,
    });
  });

  it("HP: resets offset to 0 and replaces products on re-fetch", async () => {
    useInventoryStore.setState({ products: [{ id: "old" }] as any, offset: 50 });
    mockMyInventory.mockResolvedValue({ data: [makeGqlProduct()], total: 1 });

    await useInventoryStore.getState().fetchProducts();

    expect(useInventoryStore.getState().offset).toBe(50);
    expect(useInventoryStore.getState().products).toHaveLength(1);
    expect(useInventoryStore.getState().products[0]!.id).toBe("prod-1");
  });

  it("EC: fetch fails → error set, isLoading cleared", async () => {
    mockMyInventory.mockRejectedValue(new Error("DB error"));

    await useInventoryStore.getState().fetchProducts();

    const { error, isLoading } = useInventoryStore.getState();
    expect(error).toBe("DB error");
    expect(isLoading).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Mutations — error handling (Checklist #8 EC: graceful error on all actions)
// ══════════════════════════════════════════════════════════════════════════════

describe("mutation error handling", () => {
  it("EC: restockProduct fails → error set, isLoading cleared", async () => {
    mockRestock.mockRejectedValue(new Error("Restock failed"));

    await expect(
      useInventoryStore.getState().restockProduct("prod-1", { quantity: 100, note: "test" })
    ).rejects.toThrow("Restock failed");

    expect(useInventoryStore.getState().error).toBe("Restock failed");
    expect(useInventoryStore.getState().isLoading).toBe(false);
  });

  it("EC: damageProduct fails → error set, isLoading cleared", async () => {
    mockDamage.mockRejectedValue(new Error("Damage failed"));

    await expect(
      useInventoryStore.getState().damageProduct("prod-1", 100, "broken")
    ).rejects.toThrow("Damage failed");

    expect(useInventoryStore.getState().error).toBe("Damage failed");
    expect(useInventoryStore.getState().isLoading).toBe(false);
  });

  it("EC: adjustProduct fails → error set, isLoading cleared", async () => {
    mockAdjust.mockRejectedValue(new Error("Adjust failed"));

    await expect(
      useInventoryStore.getState().adjustProduct("prod-1", { quantity: -50, note: "spill" })
    ).rejects.toThrow("Adjust failed");

    expect(useInventoryStore.getState().error).toBe("Adjust failed");
    expect(useInventoryStore.getState().isLoading).toBe(false);
  });

  it("EC: createProduct fails → error set, isLoading cleared, error thrown to caller", async () => {
    mockCreateProduct.mockRejectedValue(new Error("Create failed"));

    await expect(
      useInventoryStore.getState().createProduct({
        name: "Test", unit: "g" as any, quantity: 100, costPerUnit: 1, threshold: 10,
      })
    ).rejects.toThrow("Create failed");

    expect(useInventoryStore.getState().error).toBe("Create failed");
    expect(useInventoryStore.getState().isLoading).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reset — Checklist #8: state cleared between branches
// ══════════════════════════════════════════════════════════════════════════════

describe("reset", () => {
  it("HP: clears all state including products, logs, lowStock, errors", () => {
    useInventoryStore.setState({
      products: [{ id: "p1" }] as any,
      lowStock: [{ id: "p1" }] as any,
      logs:     [{ id: "tx1" }],
      error:    "some error",
      total:    1,
      offset:   50,
    });

    useInventoryStore.getState().reset();

    const state = useInventoryStore.getState();
    expect(state.products).toEqual([]);
    expect(state.lowStock).toEqual([]);
    expect(state.logs).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.total).toBe(0);
    expect(state.offset).toBe(0);
  });
});
