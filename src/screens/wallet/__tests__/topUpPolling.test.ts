// src/screens/wallet/__tests__/topUpPolling.test.ts
// Polling loop: resolves on terminal states, tolerates transient errors,
// respects cancellation, and times out while still pending.

import { pollTopUpStatus } from "../topUpPolling";
import type { TopUpIntent } from "../../../services/graphql/wallet";

const intent = (status: TopUpIntent["status"]): TopUpIntent => ({
  _id: "i1",
  branchId: "b1",
  amountCentavos: 10_000,
  status,
  invoiceUrl: null,
  xenditInvoiceId: null,
  resolvedAt: null,
  createdAt: null,
});

const instantDelay = () => Promise.resolve();

describe("pollTopUpStatus", () => {
  it("resolves immediately on SUCCEEDED (dev gateway auto-succeed)", async () => {
    const fetchStatus = jest.fn().mockResolvedValue(intent("SUCCEEDED"));
    const result = await pollTopUpStatus(fetchStatus, { delay: instantDelay });
    expect(result).toEqual({ intent: intent("SUCCEEDED"), timedOut: false, cancelled: false });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps polling through PENDING until a terminal state", async () => {
    const fetchStatus = jest.fn()
      .mockResolvedValueOnce(intent("PENDING"))
      .mockResolvedValueOnce(intent("PENDING"))
      .mockResolvedValueOnce(intent("FAILED"));
    const result = await pollTopUpStatus(fetchStatus, { delay: instantDelay });
    expect(result.intent?.status).toBe("FAILED");
    expect(result.timedOut).toBe(false);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("stops on EXPIRED", async () => {
    const fetchStatus = jest.fn()
      .mockResolvedValueOnce(intent("PENDING"))
      .mockResolvedValueOnce(intent("EXPIRED"));
    const result = await pollTopUpStatus(fetchStatus, { delay: instantDelay });
    expect(result.intent?.status).toBe("EXPIRED");
  });

  it("tolerates transient fetch errors and keeps polling", async () => {
    const fetchStatus = jest.fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(intent("SUCCEEDED"));
    const result = await pollTopUpStatus(fetchStatus, { delay: instantDelay });
    expect(result.intent?.status).toBe("SUCCEEDED");
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("times out while still pending (recoverable — webhook may still land)", async () => {
    const fetchStatus = jest.fn().mockResolvedValue(intent("PENDING"));
    const result = await pollTopUpStatus(fetchStatus, { delay: instantDelay, timeoutMs: 2_500 });
    expect(result.timedOut).toBe(true);
    expect(result.intent?.status).toBe("PENDING");
    // Budget 2.5s with delays [2s, 3s, …] → poll, wait 2s, poll, then the next
    // 3s wait would exceed the budget → stop after 2 polls.
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("stops when cancelled (sheet closed)", async () => {
    const fetchStatus = jest.fn().mockResolvedValue(intent("PENDING"));
    let calls = 0;
    const result = await pollTopUpStatus(fetchStatus, {
      delay: instantDelay,
      isCancelled: () => ++calls > 2,
    });
    expect(result.cancelled).toBe(true);
  });
});
