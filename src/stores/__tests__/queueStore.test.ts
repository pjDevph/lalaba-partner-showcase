// src/stores/__tests__/queueStore.test.ts
// Unit tests for queueStore — live order queue with sorting, filtering, upsert.
// Covers Checklist #18 EC: "20+ orders in queue → scrolls, no crash"
// Covers Checklist #18 EC: "Two staff advance same order → no double-advance (upsert)"

import { useQueueStore } from "../queueStore";
import type { POSOrder } from "../../types/pos.types";

// ── Fixture ───────────────────────────────────────────────────────────────────

let _id = 0;
function makeOrder(overrides: Partial<POSOrder> = {}): POSOrder {
  _id++;
  return {
    id:             `order-${_id}`,
    merchantId:     "merchant-1",
    branchId:       "branch-1",
    staffId:        "staff-1",
    orderSource:    "POS",
    status:         "CREATED",
    walkinCustomer: { name: "Customer", phone: "09171234567" },
    items:          [{ serviceId: "s1", serviceName: "Wash", weightKg: 1, unitPrice: 60, lineTotal: 60 }],
    subtotal:       60,
    discountAmount: 0,
    totalAmount:    60,
    paymentMethod:  "CASH",
    amountReceived: 60,
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
  useQueueStore.setState({
    orders: [],
    filter: "ALL",
    isLoading: true,
    error: null,
    lastSyncedAt: null,
  });
});

// ── setOrders ─────────────────────────────────────────────────────────────────

describe("setOrders", () => {
  it("HP: stores the provided orders", () => {
    const orders = [makeOrder(), makeOrder()];
    useQueueStore.getState().setOrders(orders);
    expect(useQueueStore.getState().orders).toHaveLength(2);
  });

  it("HP: clears isLoading and error", () => {
    useQueueStore.setState({ isLoading: true, error: "stale error" });
    useQueueStore.getState().setOrders([]);
    const { isLoading, error } = useQueueStore.getState();
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it("HP: sorts orders newest-first by createdAt.seconds descending", () => {
    const old   = makeOrder({ id: "old",   createdAt: { seconds: 1_000, nanoseconds: 0 } });
    const mid   = makeOrder({ id: "mid",   createdAt: { seconds: 2_000, nanoseconds: 0 } });
    const newer = makeOrder({ id: "newer", createdAt: { seconds: 3_000, nanoseconds: 0 } });
    useQueueStore.getState().setOrders([old, newer, mid]); // intentionally out of order
    const { orders } = useQueueStore.getState();
    expect(orders[0].id).toBe("newer");
    expect(orders[1].id).toBe("mid");
    expect(orders[2].id).toBe("old");
  });

  it("HP: sets lastSyncedAt", () => {
    useQueueStore.getState().setOrders([]);
    expect(useQueueStore.getState().lastSyncedAt).not.toBeNull();
  });

  it("EC: 25 orders (Checklist #18 — 20+ queue) — no crash, all stored", () => {
    const orders = Array.from({ length: 25 }, () => makeOrder());
    expect(() => useQueueStore.getState().setOrders(orders)).not.toThrow();
    expect(useQueueStore.getState().orders).toHaveLength(25);
  });
});

// ── upsertOrder ───────────────────────────────────────────────────────────────

describe("upsertOrder", () => {
  it("HP: adds a new order to the store", () => {
    const order = makeOrder();
    useQueueStore.getState().upsertOrder(order);
    expect(useQueueStore.getState().orders).toHaveLength(1);
    expect(useQueueStore.getState().orders[0].id).toBe(order.id);
  });

  it("HP: updates an existing order in-place (no duplicate)", () => {
    const order = makeOrder({ status: "CREATED" });
    useQueueStore.getState().setOrders([order]);
    const updated = { ...order, status: "READY_FOR_PICKUP" as const };
    useQueueStore.getState().upsertOrder(updated);
    const { orders } = useQueueStore.getState();
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("READY_FOR_PICKUP");
  });

  it("HP: preserves other orders when upserting", () => {
    const a = makeOrder({ id: "a" });
    const b = makeOrder({ id: "b" });
    useQueueStore.getState().setOrders([a, b]);
    const bUpdated = { ...b, status: "PROCESSING" as const };
    useQueueStore.getState().upsertOrder(bUpdated);
    const { orders } = useQueueStore.getState();
    expect(orders).toHaveLength(2);
    expect(orders.find((o) => o.id === "a")?.status).toBe("CREATED");
  });

  it("EC: inserting new order re-sorts by time (new order lands at head if newest)", () => {
    const old = makeOrder({ id: "old", createdAt: { seconds: 1_000, nanoseconds: 0 } });
    useQueueStore.getState().setOrders([old]);
    const fresh = makeOrder({ id: "fresh", createdAt: { seconds: 2_000, nanoseconds: 0 } });
    useQueueStore.getState().upsertOrder(fresh);
    expect(useQueueStore.getState().orders[0].id).toBe("fresh");
  });
});

// ── removeOrder ───────────────────────────────────────────────────────────────

describe("removeOrder", () => {
  it("HP: removes the matching order by id", () => {
    const a = makeOrder({ id: "a" });
    const b = makeOrder({ id: "b" });
    useQueueStore.getState().setOrders([a, b]);
    useQueueStore.getState().removeOrder("a");
    const { orders } = useQueueStore.getState();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe("b");
  });

  it("EC: removing non-existent id → no crash, no change", () => {
    const order = makeOrder({ id: "keep" });
    useQueueStore.getState().setOrders([order]);
    expect(() => useQueueStore.getState().removeOrder("ghost")).not.toThrow();
    expect(useQueueStore.getState().orders).toHaveLength(1);
  });

  it("EC: removing from empty store → no crash", () => {
    expect(() => useQueueStore.getState().removeOrder("any")).not.toThrow();
    expect(useQueueStore.getState().orders).toHaveLength(0);
  });
});

// ── setFilter ────────────────────────────────────────────────────────────────

describe("setFilter", () => {
  it("HP: updates the filter", () => {
    useQueueStore.getState().setFilter("CLAIMED");
    expect(useQueueStore.getState().filter).toBe("CLAIMED");
  });

  it("HP: reset to ALL", () => {
    useQueueStore.getState().setFilter("PROCESSING");
    useQueueStore.getState().setFilter("ALL");
    expect(useQueueStore.getState().filter).toBe("ALL");
  });
});

// ── filteredOrders ───────────────────────────────────────────────────────────

describe("filteredOrders()", () => {
  beforeEach(() => {
    const orders = [
      makeOrder({ id: "a", status: "CREATED" }),
      makeOrder({ id: "b", status: "PROCESSING" }),
      makeOrder({ id: "c", status: "READY_FOR_PICKUP" }),
      makeOrder({ id: "d", status: "CLAIMED" }),
    ];
    useQueueStore.getState().setOrders(orders);
  });

  it("HP: ALL filter returns all 4 orders", () => {
    useQueueStore.getState().setFilter("ALL");
    expect(useQueueStore.getState().filteredOrders()).toHaveLength(4);
  });

  it("HP: CREATED filter returns only CREATED orders", () => {
    useQueueStore.getState().setFilter("CREATED");
    const filtered = useQueueStore.getState().filteredOrders();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a");
  });

  it("HP: PROCESSING filter returns only in-progress orders", () => {
    useQueueStore.getState().setFilter("PROCESSING");
    const filtered = useQueueStore.getState().filteredOrders();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("b");
  });

  it("HP: CLAIMED filter returns only claimed orders", () => {
    useQueueStore.getState().setFilter("CLAIMED");
    const filtered = useQueueStore.getState().filteredOrders();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("d");
  });

  it("EC: filter with no matching orders → empty array", () => {
    useQueueStore.getState().setFilter("READY_FOR_PICKUP");
    useQueueStore.getState().setOrders([makeOrder({ status: "CREATED" })]);
    const filtered = useQueueStore.getState().filteredOrders();
    expect(filtered).toHaveLength(0);
  });
});

// ── activeCount ───────────────────────────────────────────────────────────────

describe("activeCount()", () => {
  it("HP: counts all non-CLAIMED orders", () => {
    useQueueStore.getState().setOrders([
      makeOrder({ status: "CREATED" }),
      makeOrder({ status: "PROCESSING" }),
      makeOrder({ status: "READY_FOR_PICKUP" }),
      makeOrder({ status: "CLAIMED" }),
    ]);
    expect(useQueueStore.getState().activeCount()).toBe(3);
  });

  it("EC: all CLAIMED → count is 0", () => {
    useQueueStore.getState().setOrders([
      makeOrder({ status: "CLAIMED" }),
      makeOrder({ status: "CLAIMED" }),
    ]);
    expect(useQueueStore.getState().activeCount()).toBe(0);
  });

  it("EC: empty store → count is 0", () => {
    expect(useQueueStore.getState().activeCount()).toBe(0);
  });

  it("HP: none CLAIMED → count equals total", () => {
    const orders = [makeOrder(), makeOrder(), makeOrder()];
    useQueueStore.getState().setOrders(orders);
    expect(useQueueStore.getState().activeCount()).toBe(3);
  });
});

// ── setError / setLoading ─────────────────────────────────────────────────────

describe("setError / setLoading", () => {
  it("HP: setError stores the error and clears isLoading", () => {
    useQueueStore.setState({ isLoading: true });
    useQueueStore.getState().setError("fetch failed");
    expect(useQueueStore.getState().error).toBe("fetch failed");
    expect(useQueueStore.getState().isLoading).toBe(false);
  });

  it("HP: setLoading(true) sets isLoading", () => {
    useQueueStore.getState().setLoading(true);
    expect(useQueueStore.getState().isLoading).toBe(true);
  });

  it("HP: setLoading(false) clears isLoading", () => {
    useQueueStore.setState({ isLoading: true });
    useQueueStore.getState().setLoading(false);
    expect(useQueueStore.getState().isLoading).toBe(false);
  });
});
