// src/stores/__tests__/posOrderStore.test.ts
// Happy-path + edge-case tests for posOrderStore

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

// AsyncStorage is a native module — mock it for the Jest Node.js environment
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem:    jest.fn(() => Promise.resolve(null)),
  setItem:    jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear:      jest.fn(() => Promise.resolve()),
  getAllKeys:  jest.fn(() => Promise.resolve([])),
  multiGet:   jest.fn(() => Promise.resolve([])),
  multiSet:   jest.fn(() => Promise.resolve()),
}));

// offlineQueueStore uses AsyncStorage persist — stub it out
jest.mock("../offlineQueueStore", () => ({
  useOfflineQueueStore: {
    getState: () => ({ enqueue: jest.fn() }),
  },
}));

jest.mock("../../services/graphql/orders", () => ({
  gqlCreateOrder:    jest.fn(),
  gqlProcessPayment: jest.fn(),
}));

jest.mock("../authStore", () => ({
  useAuthStore: {
    getState: () => ({ merchantId: "mock-merchant-id" }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { usePOSOrderStore } from "../posOrderStore";
import { gqlCreateOrder, gqlProcessPayment } from "../../services/graphql/orders";
import type { POSLineItem } from "../../types/pos.types";

const mockCreate  = gqlCreateOrder   as jest.Mock;
const mockPayment = gqlProcessPayment as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_ORDER = {
  _id:         "order-123",
  claimCode:   "ABC-001",
  totalAmount: 200,
};

const SERVICE_ITEM: POSLineItem = {
  serviceId:   "svc-1",
  serviceName: "Standard Wash",
  weightKg:    2,
  unitPrice:   100,
  lineTotal:   200,
  pricingType: "PER_KILO",
  defaultProducts: [
    { inventoryId: "inv-1", productName: "Ariel",  quantity: 30, included: true },
    { inventoryId: "inv-2", productName: "Zonrox", quantity: 10, included: true },
  ],
};

const PRODUCT_ITEM: POSLineItem = {
  serviceId:   "prod:ariel-sachet",
  serviceName: "",
  weightKg:    1,
  unitPrice:   15,
  lineTotal:   15,
  type:        "product",
  productId:   "product-1",
  productName: "Ariel Sachet",
};

const NO_INVENTORY_ITEM: POSLineItem = {
  serviceId:   "svc-2",
  serviceName: "Express Dry",
  weightKg:    1,
  unitPrice:   80,
  lineTotal:   80,
  pricingType: "PER_LOAD",
  // no defaultProducts
};

// ── Reset helpers ─────────────────────────────────────────────────────────────

beforeEach(() => {
  usePOSOrderStore.setState({
    branchId:        "branch-1",
    walkinCustomer:  {},
    items:           [],
    paymentMethod:   "CASH",
    amountReceived:  0,
    notes:           "",
    discountAmount:  0,
    discountCode:    "",
    discountType:    "FLAT",
    estimatedMinutes: 0,
    splits:          [],
    isSubmitting:    false,
    error:           null,
    createdOrder:    null,
    createdOrderFull: null,
    referenceId:     undefined,
  });
  mockCreate.mockReset().mockResolvedValue(MOCK_ORDER);
  mockPayment.mockReset().mockResolvedValue({});
});

// ══════════════════════════════════════════════════════════════════════════════
// CART — addItem
// ══════════════════════════════════════════════════════════════════════════════

describe("addItem", () => {
  it("HP: adds a new service item to the cart", () => {
    const { addItem } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);

    const { items } = usePOSOrderStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      serviceId:   "svc-1",
      serviceName: "Standard Wash",
      weightKg:    2,
      unitPrice:   100,
      lineTotal:   200,
    });
  });

  it("HP: preserves pricingType and defaultProducts on the cart item", () => {
    const { addItem } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);

    const item = usePOSOrderStore.getState().items[0]!;
    expect(item.pricingType).toBe("PER_KILO");
    expect(item.defaultProducts).toHaveLength(2);
    expect(item.defaultProducts![0]).toEqual({
      inventoryId:  "inv-1",
      productName:  "Ariel",
      quantity:     30,
      included:     true,
    });
  });

  it("HP: adds a product-type item correctly", () => {
    const { addItem } = usePOSOrderStore.getState();
    addItem(PRODUCT_ITEM);

    const item = usePOSOrderStore.getState().items[0]!;
    expect(item.type).toBe("product");
    expect(item.productId).toBe("product-1");
    expect(item.productName).toBe("Ariel Sachet");
  });

  it("HP: adds a service with no defaultProducts without errors", () => {
    const { addItem } = usePOSOrderStore.getState();
    addItem(NO_INVENTORY_ITEM);

    const item = usePOSOrderStore.getState().items[0]!;
    expect(item.serviceId).toBe("svc-2");
    expect(item.defaultProducts).toBeUndefined();
  });

  // EC-P1: double-tap same service
  it("EC-P1: tapping the same service twice merges weight instead of duplicating", () => {
    const { addItem } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);        // 2 kg
    addItem({ ...SERVICE_ITEM, weightKg: 1, lineTotal: 100 }); // +1 kg

    const { items } = usePOSOrderStore.getState();
    expect(items).toHaveLength(1);          // still 1 line item
    expect(items[0]!.weightKg).toBe(3);     // weight accumulated
    expect(items[0]!.lineTotal).toBe(300);  // lineTotal recalculated
  });

  it("EC-P3: re-adding a service after removal brings back defaultProducts", () => {
    const { addItem, removeItem } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    removeItem("svc-1");
    addItem(SERVICE_ITEM);

    const item = usePOSOrderStore.getState().items[0]!;
    expect(item.defaultProducts).toHaveLength(2);
    expect(item.defaultProducts![0]!.included).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CART — derived values
// ══════════════════════════════════════════════════════════════════════════════

describe("derived values", () => {
  it("HP: subtotal sums all item lineTotals", () => {
    const { addItem, subtotal } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);  // 200
    addItem(PRODUCT_ITEM);  // 15
    expect(subtotal()).toBe(215);
  });

  it("HP: totalAmount applies flat discount", () => {
    const { addItem, setDiscount, totalAmount } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // 200
    setDiscount(50);
    expect(totalAmount()).toBe(150);
  });

  // EC-P7: discount > subtotal
  it("EC-P7: totalAmount clamps to 0 when discount exceeds subtotal", () => {
    const { addItem, setDiscount, totalAmount } = usePOSOrderStore.getState();
    addItem(NO_INVENTORY_ITEM); // 80
    setDiscount(100);
    expect(totalAmount()).toBe(0); // Math.max(0, 80-100) = 0
  });

  it("HP: changeGiven calculates correct cash change", () => {
    const { addItem, setAmountReceived, changeGiven } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // totalAmount = 200
    setAmountReceived(250);
    expect(changeGiven()).toBe(50);
  });

  it("HP: changeGiven is 0 for non-cash payments", () => {
    const { addItem, setPaymentMethod, setAmountReceived, changeGiven } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setPaymentMethod("GCASH");
    setAmountReceived(500);
    expect(changeGiven()).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// submitOrder — payload correctness
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — payload", () => {
  it("HP: sends correct items payload including pricingType and defaultProducts", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [payload] = mockCreate.mock.calls[0] as [{ items: any[] }];
    const sentItem = payload.items[0];

    expect(sentItem.type).toBe("service");
    expect(sentItem.serviceId).toBe("svc-1");
    expect(sentItem.serviceName).toBe("Standard Wash");
    expect(sentItem.pricingType).toBe("PER_KILO");
    expect(sentItem.defaultProducts).toHaveLength(2);
    expect(sentItem.defaultProducts[0]).toEqual({
      inventoryId:  "inv-1",
      productName:  "Ariel",
      quantity:     30,
      included:     true,
    });
  });

  // EC-P4: product-only items
  it("EC-P4: product items send productId/productName, not serviceId/serviceName", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(PRODUCT_ITEM);
    setAmountReceived(15);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [{ items: any[] }];
    const sentItem = payload.items[0];

    expect(sentItem.type).toBe("product");
    expect(sentItem.productId).toBe("product-1");
    expect(sentItem.productName).toBe("Ariel Sachet");
    expect(sentItem.serviceId).toBeUndefined();
    expect(sentItem.serviceName).toBeUndefined();
  });

  it("HP: service with no defaultProducts sends undefined (not empty array)", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(NO_INVENTORY_ITEM);
    setAmountReceived(80);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [{ items: any[] }];
    expect(payload.items[0].defaultProducts).toBeUndefined();
  });

  it("HP: uses branchId from store", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [{ branchId: string; items: any[] }];
    expect(payload.branchId).toBe("branch-1");
  });

  it("HP: falls back to merchantId when branchId is empty", async () => {
    usePOSOrderStore.setState({ branchId: "" });
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [{ branchId: string; items: any[] }];
    expect(payload.branchId).toBe("mock-merchant-id");
  });

  it("HP: sets createdOrder after successful submission", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const { createdOrder } = usePOSOrderStore.getState();
    expect(createdOrder).not.toBeNull();
    expect(createdOrder!.orderId).toBe("order-123");
    expect(createdOrder!.claimCode).toBe("ABC-001");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// submitOrder — guard rails
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — guards", () => {
  // EC-P6: empty cart
  it("EC-P6a: blocks submission when cart is empty", async () => {
    const { submitOrder } = usePOSOrderStore.getState();
    await submitOrder();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(usePOSOrderStore.getState().error).toBe("Add at least one service.");
  });

  // EC-P6: double-tap guard lives in the UI (button disabled when isSubmitting=true)
  // The store itself does NOT block reentry — we verify isSubmitting is set so the UI can use it.
  it("EC-P6b: isSubmitting is true during the request so UI can disable the button", async () => {
    let capturedDuringFlight = false;

    mockCreate.mockImplementation(async () => {
      capturedDuringFlight = usePOSOrderStore.getState().isSubmitting;
      return MOCK_ORDER;
    });

    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    expect(capturedDuringFlight).toBe(true);  // isSubmitting=true while in-flight
    expect(usePOSOrderStore.getState().isSubmitting).toBe(false); // cleared after completion
  });

  it("HP: clears isSubmitting after network failure (order queued offline, not errored)", async () => {
    // Network errors are handled by the offline queue — error stays null,
    // isSubmitting is cleared, and the order is enqueued for later retry.
    mockCreate.mockRejectedValue(new Error("Network request failed"));

    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    expect(usePOSOrderStore.getState().isSubmitting).toBe(false);
  });

  it("HP: sets generic error message on non-network failure", async () => {
    mockCreate.mockRejectedValue(new Error("Internal server error"));

    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    expect(usePOSOrderStore.getState().error).toBe("Internal server error");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// resetOrder
// ══════════════════════════════════════════════════════════════════════════════

describe("resetOrder", () => {
  it("HP: clears items, discount, payment, and error", () => {
    const { addItem, setDiscount, setAmountReceived, resetOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setDiscount(50, "SAVE50");
    setAmountReceived(200);
    usePOSOrderStore.setState({ error: "previous error" });

    resetOrder();

    const state = usePOSOrderStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.discountAmount).toBe(0);
    expect(state.discountCode).toBe("");
    expect(state.amountReceived).toBe(0);
    expect(state.error).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Discount type → BE payload  (Checklist #16 Discounts)
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — discount type in BE payload", () => {
  it("HP: flat discount → sends discountType='flat' to BE", async () => {
    const { addItem, setDiscount, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setDiscount(50, "SAVE50", "FLAT");
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.discountType).toBe("flat");
    expect(payload.discountValue).toBe(50);
  });

  it("HP: percent discount → sends discountType='percentage' to BE", async () => {
    const { addItem, setDiscount, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // subtotal 200
    setDiscount(20, "PCT10", "PERCENT"); // 10% of 200 = 20, pre-calculated by UI
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.discountType).toBe("percentage");
    expect(payload.discountValue).toBe(20);
  });

  it("HP: PWD discount → sends discountType='flat' to BE (flat deduction)", async () => {
    const { addItem, setDiscount, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setDiscount(40, "PWD", "PWD");
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.discountType).toBe("flat");
  });

  it("HP: Senior discount → sends discountType='flat' to BE (flat deduction)", async () => {
    const { addItem, setDiscount, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setDiscount(40, "SENIOR", "SENIOR");
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.discountType).toBe("flat");
  });

  it("EC: discountAmount=0 → discountType and discountValue both undefined in payload", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.discountType).toBeUndefined();
    expect(payload.discountValue).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Payment method → gqlProcessPayment  (Checklist #16 Payment Methods)
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — payment method", () => {
  const METHODS = ["CASH", "GCASH", "MAYA", "CARD", "QPH"] as const;

  it.each(METHODS)(
    "HP: %s → gqlProcessPayment called with lowercase '%s'",
    async (method) => {
      const { addItem, setPaymentMethod, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
      addItem(SERVICE_ITEM);
      setPaymentMethod(method);
      setAmountReceived(200);
      await submitOrder();

      expect(mockPayment).toHaveBeenCalledWith(
        "order-123",
        expect.objectContaining({ paymentMethod: method.toLowerCase() })
      );
    }
  );

  it("HP: cash payment → amountReceived sent as amountPaid", async () => {
    const { addItem, setPaymentMethod, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setPaymentMethod("CASH");
    setAmountReceived(250);
    await submitOrder();

    expect(mockPayment).toHaveBeenCalledWith(
      "order-123",
      expect.objectContaining({ amountPaid: 250 })
    );
  });

  it("HP: non-cash payment → totalAmount sent as amountPaid (not amountReceived)", async () => {
    mockCreate.mockResolvedValue({ ...MOCK_ORDER, totalAmount: 200 });
    const { addItem, setPaymentMethod, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setPaymentMethod("GCASH");
    setAmountReceived(999); // irrelevant for non-cash
    await submitOrder();

    expect(mockPayment).toHaveBeenCalledWith(
      "order-123",
      expect.objectContaining({ amountPaid: 200 }) // totalAmount, not 999
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Split payments  (Checklist #16 EC-P8 + split payment flow)
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — split payments", () => {
  it("HP: split payment calls gqlProcessPayment once per split method", async () => {
    const { addItem, setSplit, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // total 200
    setSplit("CASH", 100);
    setSplit("GCASH", 100);
    await submitOrder();

    expect(mockPayment).toHaveBeenCalledTimes(2);
    expect(mockPayment).toHaveBeenCalledWith("order-123", expect.objectContaining({ paymentMethod: "cash",  amountPaid: 100 }));
    expect(mockPayment).toHaveBeenCalledWith("order-123", expect.objectContaining({ paymentMethod: "gcash", amountPaid: 100 }));
  });

  it("HP: split with cash → changeGiven calculated from cash split only", () => {
    const { addItem, setSplit, changeGiven } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // total 200
    setSplit("GCASH", 100);
    setSplit("CASH",  150); // cash covers remaining 100, gives ₱50 change
    expect(changeGiven()).toBe(50);
  });

  it("HP: split with no cash method → changeGiven is 0", () => {
    const { addItem, setSplit, changeGiven } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM); // total 200
    setSplit("GCASH", 100);
    setSplit("MAYA",  100);
    expect(changeGiven()).toBe(0);
  });

  it("HP: removeSplit removes that method from splits", () => {
    const { setSplit, removeSplit } = usePOSOrderStore.getState();
    setSplit("CASH",  100);
    setSplit("GCASH", 100);
    removeSplit("GCASH");
    expect(usePOSOrderStore.getState().splits).toHaveLength(1);
    expect(usePOSOrderStore.getState().splits[0]?.method).toBe("CASH");
  });

  it("HP: setSplit with amount=0 removes that method", () => {
    const { setSplit } = usePOSOrderStore.getState();
    setSplit("CASH", 100);
    setSplit("CASH", 0); // set to 0 → removed
    expect(usePOSOrderStore.getState().splits).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Customer info in payload  (Checklist #16 HP: customer name + phone)
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — customer info", () => {
  it("HP: customer name and phone sent in payload", async () => {
    const { addItem, setWalkinCustomer, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setWalkinCustomer({ name: "Juan dela Cruz", phone: "09171234567" });
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.customerName).toBe("Juan dela Cruz");
    expect(payload.customerPhone).toBe("09171234567");
  });

  it("HP: blank customer name → trimmed to undefined in payload", async () => {
    const { addItem, setWalkinCustomer, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setWalkinCustomer({ name: "   ", phone: "" });
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.customerName).toBeUndefined();
    expect(payload.customerPhone).toBeUndefined();
  });

  it("HP: no customer set → customerName and customerPhone undefined", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.customerName).toBeUndefined();
    expect(payload.customerPhone).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Estimated ready time  (Checklist #16 HP: estimated ready time selection)
// ══════════════════════════════════════════════════════════════════════════════

describe("submitOrder — estimated ready time", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("HP: estimatedMinutes > 0 → estimatedReadyAt ISO string sent to BE", async () => {
    jest.setSystemTime(new Date("2026-06-26T10:00:00.000Z"));
    const { addItem, setEstimatedMinutes, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setEstimatedMinutes(60); // 1 hour
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.estimatedReadyAt).toBe("2026-06-26T11:00:00.000Z");
  });

  it("HP: estimatedMinutes=0 → estimatedReadyAt is undefined", async () => {
    const { addItem, setAmountReceived, submitOrder } = usePOSOrderStore.getState();
    addItem(SERVICE_ITEM);
    setAmountReceived(200);
    await submitOrder();

    const [payload] = mockCreate.mock.calls[0] as [any];
    expect(payload.estimatedReadyAt).toBeUndefined();
  });
});
