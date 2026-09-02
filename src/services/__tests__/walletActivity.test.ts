// Unit tests for the ledger ⊕ attempts merge. The dedupe is the whole point of
// the helper: get it wrong in one direction and a settled ₱100 renders twice,
// get it wrong in the other and an in-flight top-up disappears off the screen.

import {
  mergeWalletActivity,
  activityLabel,
  needsUserPayment,
  SETTLING_WINDOW_MS,
} from "../walletActivity";
import type { WalletLedgerEntry, TopUpIntent } from "../graphql/wallet";

const ledgerRow = (over: Partial<WalletLedgerEntry> = {}): WalletLedgerEntry => ({
  _id: "led-1",
  branchId: "b1",
  type: "TOP_UP",
  amountCentavos: 10_000,
  balanceAfterCentavos: 110_000,
  xenditReference: null,
  createdAt: "2026-08-12T10:00:00.000Z",
  ...over,
});

const intent = (over: Partial<TopUpIntent> = {}): TopUpIntent => ({
  _id: "int-1",
  branchId: "b1",
  amountCentavos: 10_000,
  status: "PENDING",
  xenditInvoiceId: null,
  invoiceUrl: null,
  resolvedAt: null,
  createdAt: "2026-08-12T10:00:00.000Z",
  ...over,
});

describe("mergeWalletActivity", () => {
  it("drops a settled intent in favour of the ledger row it produced", () => {
    const out = mergeWalletActivity(
      [ledgerRow({ _id: "led-1", xenditReference: "int-1" })],
      [intent({ _id: "int-1", status: "SUCCEEDED" })],
    );

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("led-1");
    expect(out[0].kind).toBe("TOP_UP");
    // The ledger row is kept because it's the one that knows the balance.
    expect(out[0].balanceAfterCentavos).toBe(110_000);
  });

  it("keeps a SUCCEEDED intent whose ledger row is not in this fetch", () => {
    // Webhook mid-flight: the intent already reads SUCCEEDED but the credit
    // hasn't been read back yet. Dropping it on status alone would make the
    // user's top-up vanish until the next refresh.
    const out = mergeWalletActivity([], [intent({ status: "SUCCEEDED" })]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("TOP_UP_ATTEMPT");
  });

  it("surfaces attempts the ledger can never show", () => {
    const out = mergeWalletActivity(
      [],
      [
        intent({ _id: "a", status: "PENDING" }),
        intent({ _id: "b", status: "FAILED" }),
        intent({ _id: "c", status: "EXPIRED" }),
      ],
    );
    expect(out.map((i) => i.kind)).toEqual([
      "TOP_UP_ATTEMPT",
      "TOP_UP_ATTEMPT",
      "TOP_UP_ATTEMPT",
    ]);
    // No money moved, so no running balance is claimed.
    expect(out.every((i) => i.balanceAfterCentavos === null)).toBe(true);
  });

  it("sorts newest first across both sources", () => {
    const out = mergeWalletActivity(
      [
        ledgerRow({ _id: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
        ledgerRow({ _id: "new", createdAt: "2026-08-12T00:00:00.000Z" }),
      ],
      [intent({ _id: "mid", createdAt: "2026-08-06T00:00:00.000Z" })],
    );
    expect(out.map((i) => i.id)).toEqual(["new", "mid", "old"]);
  });

  it("dates a resolved attempt by when it resolved, not when it opened", () => {
    const out = mergeWalletActivity(
      [],
      [
        intent({
          status: "FAILED",
          createdAt: "2026-08-01T00:00:00.000Z",
          resolvedAt: "2026-08-11T00:00:00.000Z",
        }),
      ],
    );
    expect(out[0].at).toBe("2026-08-11T00:00:00.000Z");
  });

  it("sorts an unparseable timestamp last instead of to the top", () => {
    const out = mergeWalletActivity(
      [ledgerRow({ _id: "good", createdAt: "2026-08-12T00:00:00.000Z" })],
      [intent({ _id: "bad", createdAt: null })],
    );
    expect(out.map((i) => i.id)).toEqual(["good", "bad"]);
  });

  it("reports fee debits as positive amounts (the kind carries direction)", () => {
    const out = mergeWalletActivity(
      [ledgerRow({ type: "FEE_CONSUMPTION", amountCentavos: -5_000 })],
      [],
    );
    expect(out[0].kind).toBe("FEE");
    expect(out[0].amountCentavos).toBe(5_000);
  });

  it("tolerates either source being empty", () => {
    expect(mergeWalletActivity([], [])).toEqual([]);
    expect(mergeWalletActivity([ledgerRow()], [])).toHaveLength(1);
    expect(mergeWalletActivity([], [intent()])).toHaveLength(1);
  });
});

describe("activityLabel", () => {
  const AT = "2026-08-12T10:00:00.000Z";
  const started = Date.parse(AT);
  const rowFor = (status: TopUpIntent["status"]) =>
    mergeWalletActivity([], [intent({ status, createdAt: AT })])[0];

  it("distinguishes each unsettled state", () => {
    expect(activityLabel(rowFor("FAILED"))).toBe("Top up failed");
    expect(activityLabel(rowFor("EXPIRED"))).toBe("Top up expired");
  });

  it("calls every unsettled attempt processing, however old", () => {
    // The label must not drift with age — only the hint does.
    const old = mergeWalletActivity(
      [],
      [intent({ createdAt: new Date(started - SETTLING_WINDOW_MS * 100).toISOString() })],
    )[0];
    expect(activityLabel(rowFor("PENDING"))).toBe("Top up processing");
    expect(activityLabel(old)).toBe("Top up processing");
  });

  it("labels settled movements", () => {
    const [credit] = mergeWalletActivity([ledgerRow()], []);
    const [debit] = mergeWalletActivity([ledgerRow({ type: "FEE_CONSUMPTION" })], []);
    expect(activityLabel(credit)).toBe("Top up");
    expect(activityLabel(debit)).toBe("Platform fee");
  });
});

describe("needsUserPayment", () => {
  const AT = "2026-08-12T10:00:00.000Z";
  const started = Date.parse(AT);
  const pendingRow = () => mergeWalletActivity([], [intent({ createdAt: AT })])[0];

  it("is false while the row may still settle on its own", () => {
    expect(needsUserPayment(pendingRow(), started + 1_000)).toBe(false);
  });

  it("is true once only the user can move it", () => {
    expect(needsUserPayment(pendingRow(), started + SETTLING_WINDOW_MS + 1)).toBe(true);
  });

  it("never prompts on a settled or dead row", () => {
    const late = started + SETTLING_WINDOW_MS + 1;
    const [credit] = mergeWalletActivity([ledgerRow()], []);
    expect(needsUserPayment(credit, late)).toBe(false);
    expect(needsUserPayment(mergeWalletActivity([], [intent({ status: "FAILED" })])[0], late)).toBe(false);
    expect(needsUserPayment(mergeWalletActivity([], [intent({ status: "EXPIRED" })])[0], late)).toBe(false);
  });

  it("treats an unreadable timestamp as needing payment, not as forever-processing", () => {
    const [row] = mergeWalletActivity([], [intent({ createdAt: null })]);
    expect(needsUserPayment(row, started)).toBe(true);
  });
});
