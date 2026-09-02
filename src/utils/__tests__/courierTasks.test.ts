// src/utils/__tests__/courierTasks.test.ts
// RISK-P0-009: CustomerSnapshot.address/mapLocation/maskedPhone are nullable
// and resolve ONLY while the courier's leg is live. Every courier surface goes
// through these helpers, so they must never assume the exact address exists.
// Also covers the GAP-P0-028 collection-leg rule (ON_DELIVERY removed).

// courierTasks → onlineOrdersStore → graphql config → firebase (ESM, untransformed).
// Stub the transport at the boundary; none of these helpers make requests.
jest.mock("../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
}));

import {
  taskLocationLine,
  taskLocationRedacted,
  legCollectedCentavos,
  LOCATION_LOCKED_COPY,
  type CourierLegTask,
} from "../courierTasks";
import type { GqlOnlineOrder } from "../../services/graphql/onlineOrders";

type CustomerOverrides = Partial<GqlOnlineOrder["customer"]>;

function makeOrder(customer: CustomerOverrides = {}, extra: Partial<GqlOnlineOrder> = {}): GqlOnlineOrder {
  return {
    _id: "order-1",
    status: "pickup_assigned",
    version: 1,
    createdAt: null,
    customer: {
      uid: "cust-1",
      displayName: "Elena Cruz",
      areaLabel: "Barangay Uno, Quezon City",
      maskedPhone: null,
      address: null,
      mapLocation: null,
      ...customer,
    },
    provider: { providerUid: "p1", providerName: "Wash Ni Juan", providerType: "WASHER", branchId: "b1" },
    fulfillment: { pickupMode: "PICKUP", returnMode: "DELIVERY", deliverySubMode: null },
    pricing: { estimatedTotalCentavos: 50_000, estimatedWeightKg: 5, actualWeightKg: null, customerTotalCentavos: null },
    paymentSummary: { method: null, amountCollectedCentavos: null, tenderedCentavos: null, changeCentavos: null },
    contactPhone: null,
    paymentTiming: "ON_PICKUP",
    paymentStatus: "UNPAID",
    serviceLines: [],
    instructions: { pickupInstructions: null, laundryCareInstructions: null, returnInstructions: null, customerGeneralNotes: null },
    pickupAssignment: null,
    returnAssignment: null,
    ...extra,
  } as GqlOnlineOrder;
}

const FULL_ADDRESS = {
  unit: "Unit 2B",
  streetAddress: "12 Sampaguita St",
  barangayName: "Barangay Uno",
  cityMunicipalityName: "Quezon City",
  provinceName: "Metro Manila",
};

describe("taskLocationLine / taskLocationRedacted", () => {
  it("uses the exact address while the leg is live", () => {
    const o = makeOrder({ address: FULL_ADDRESS });
    expect(taskLocationLine(o)).toBe("Unit 2B, 12 Sampaguita St, Barangay Uno, Quezon City");
    expect(taskLocationRedacted(o)).toBe(false);
  });

  it("falls back to areaLabel before the leg starts / after it completes", () => {
    const o = makeOrder({ address: null });
    expect(taskLocationLine(o)).toBe("Barangay Uno, Quezon City");
    expect(taskLocationRedacted(o)).toBe(true);
  });

  it("explains the lock when even areaLabel is absent", () => {
    const o = makeOrder({ address: null, areaLabel: null });
    expect(taskLocationLine(o)).toBe(LOCATION_LOCKED_COPY);
    expect(taskLocationRedacted(o)).toBe(true);
  });

  it("does not crash on a partially-populated address", () => {
    const o = makeOrder({
      address: { ...FULL_ADDRESS, unit: null, streetAddress: "" },
    });
    expect(taskLocationLine(o)).toBe("Barangay Uno, Quezon City");
  });

  it("treats an all-empty address object as redacted, not as a blank line", () => {
    const o = makeOrder({
      address: { unit: null, streetAddress: "", barangayName: "", cityMunicipalityName: "", provinceName: "" },
    });
    expect(taskLocationRedacted(o)).toBe(true);
    expect(taskLocationLine(o)).toBe("Barangay Uno, Quezon City");
  });
});

describe("legCollectedCentavos", () => {
  const task = (
    leg: "PICKUP" | "RETURN",
    collected: number | null,
    paymentTiming: "ON_PICKUP" | "AT_FINAL_HANDOVER" = "ON_PICKUP",
  ): CourierLegTask => ({
    order: makeOrder({}, {
      paymentTiming,
      paymentSummary: {
        method: "CASH",
        amountCollectedCentavos: collected,
        tenderedCentavos: null,
        changeCentavos: null,
        collectedAt: null,
        lastCollectedAt: null,
      },
    }),
    leg,
    bucket: "COMPLETED",
  });

  it("credits a pay-now order's collection to the pickup leg", () => {
    expect(legCollectedCentavos(task("PICKUP", 50_000))).toBe(50_000);
    expect(legCollectedCentavos(task("RETURN", 50_000))).toBe(0);
  });

  it("credits a Pay Later order's collection to the RETURN leg", () => {
    // The return courier is the one who took the cash, and is often not the
    // same person who did the pickup.
    const deferred = (leg: "PICKUP" | "RETURN") =>
      legCollectedCentavos(task(leg, 50_000, "AT_FINAL_HANDOVER"));
    expect(deferred("RETURN")).toBe(50_000);
    expect(deferred("PICKUP")).toBe(0);
  });

  it("is zero when nothing was collected", () => {
    expect(legCollectedCentavos(task("PICKUP", null))).toBe(0);
  });
});
