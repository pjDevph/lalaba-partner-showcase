// src/services/graphql/__tests__/walletTopUp.test.ts
// Wave 2B secure top-up contract: initializeTopUp sends { branchId,
// amountCentavos: Int } ONLY (no client-fabricated xenditReference) and
// returns a TopUpIntent; topUpStatus polls by intent id.

jest.mock("../../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
}));

import { graphqlRequest } from "../../../config/graphql";
import { gqlInitializeTopUp, gqlTopUpStatus } from "../wallet";

const mockRequest = graphqlRequest as jest.Mock;

const INTENT = {
  _id: "intent-1",
  branchId: "branch-1",
  amountCentavos: 100_000,
  status: "PENDING",
  invoiceUrl: "https://checkout.example/inv-1",
  xenditInvoiceId: "inv-1",
  resolvedAt: null,
  createdAt: "2026-08-12T00:00:00Z",
};

beforeEach(() => jest.clearAllMocks());

describe("gqlInitializeTopUp", () => {
  it("sends only branchId + integer amountCentavos (no xenditReference)", async () => {
    mockRequest.mockResolvedValueOnce({ initializeTopUp: INTENT });
    await gqlInitializeTopUp("branch-1", 100_000);
    const [query, variables] = mockRequest.mock.calls[0];
    expect(query).toContain("initializeTopUp(input: $input)");
    expect(variables.input).toEqual({ branchId: "branch-1", amountCentavos: 100_000 });
    expect(variables.input).not.toHaveProperty("xenditReference");
  });

  it("rounds fractional centavos so the Int! input never gets a float", async () => {
    mockRequest.mockResolvedValueOnce({ initializeTopUp: INTENT });
    await gqlInitializeTopUp("branch-1", 100_000.4);
    expect(mockRequest.mock.calls[0][1].input.amountCentavos).toBe(100_000);
  });

  it("returns the PENDING intent (not a credited wallet)", async () => {
    mockRequest.mockResolvedValueOnce({ initializeTopUp: INTENT });
    const intent = await gqlInitializeTopUp("branch-1", 100_000);
    expect(intent.status).toBe("PENDING");
    expect(intent.invoiceUrl).toBe("https://checkout.example/inv-1");
  });
});

describe("gqlTopUpStatus", () => {
  it("queries topUpStatus by intent id", async () => {
    mockRequest.mockResolvedValueOnce({ topUpStatus: { ...INTENT, status: "SUCCEEDED" } });
    const intent = await gqlTopUpStatus("intent-1");
    expect(mockRequest.mock.calls[0][0]).toContain("topUpStatus(intentId: $intentId)");
    expect(mockRequest.mock.calls[0][1]).toEqual({ intentId: "intent-1" });
    expect(intent.status).toBe("SUCCEEDED");
  });
});
