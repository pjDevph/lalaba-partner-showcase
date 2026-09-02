// src/utils/__tests__/orderAcceptance.test.ts
// The wallet gate now applies to merchants AND washers on acceptOnlineOrder.
// These are the exact error strings from the BE contract — if they drift, the
// provider gets a generic toast instead of a "Top up" CTA, so pin them.

import { walletGateFromError } from "../orderAcceptance";

describe("walletGateFromError", () => {
  it("detects the negative-balance gate", () => {
    const r = walletGateFromError(
      new Error("Wallet balance is negative. Top up before accepting new orders.")
    );
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/negative/i);
    expect(r.message).toMatch(/top up/i);
  });

  it("detects the insufficient-balance gate", () => {
    const r = walletGateFromError(
      new Error("Insufficient wallet balance to cover this order's platform fee.")
    );
    expect(r.blocked).toBe(true);
    expect(r.message).toMatch(/top up/i);
  });

  it("matches regardless of case and surrounding text", () => {
    expect(walletGateFromError(new Error("Error: INSUFFICIENT WALLET BALANCE to cover…")).blocked).toBe(true);
    expect(walletGateFromError("wallet balance is negative").blocked).toBe(true);
  });

  it("reads error-like objects and plain strings", () => {
    expect(walletGateFromError({ message: "Insufficient wallet balance to cover this order's platform fee." }).blocked).toBe(true);
  });

  it("does not claim unrelated failures", () => {
    for (const e of [
      new Error("This provider is not currently able to take marketplace orders"),
      new Error("Order already accepted"),
      new Error("Network request failed"),
      null,
      undefined,
      {},
    ]) {
      const r = walletGateFromError(e);
      expect(r.blocked).toBe(false);
      expect(r.message).toBeNull();
    }
  });

  it("never surfaces the raw backend string as the user message", () => {
    const raw = "Insufficient wallet balance to cover this order's platform fee.";
    expect(walletGateFromError(new Error(raw)).message).not.toBe(raw);
  });
});
