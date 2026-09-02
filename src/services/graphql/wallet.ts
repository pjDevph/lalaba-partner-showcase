// src/services/graphql/wallet.ts
// Wallet (platform-fee prepaid balance). A provider can accept bookings only
// while this balance can cover the order's platform fee — the dashboard uses it
// to surface a "top up" notice before acceptance starts failing.

import { graphqlRequest } from "../../config/graphql";

export interface WalletSummary {
  _id: string;
  branchId: string;
  balanceCentavos: number;
  activatedAt: string | null;
}

export async function gqlWalletSummary(branchId: string): Promise<WalletSummary> {
  const data = await graphqlRequest<{ walletSummary: WalletSummary }>(
    `query WalletSummary($branchId: ID!) {
       walletSummary(branchId: $branchId) { _id branchId balanceCentavos activatedAt }
     }`,
    { branchId },
  );
  return data.walletSummary;
}

// A single wallet movement (TOP_UP credit or FEE debit) for the history list.
export interface WalletLedgerEntry {
  _id: string;
  branchId: string;
  type: string; // WalletLedgerEntryType — "TOP_UP" | "FEE" | ...
  amountCentavos: number;
  balanceAfterCentavos: number;
  /** For a TOP_UP row, the TopUpIntent._id that produced it. Null on fee rows. */
  xenditReference: string | null;
  createdAt: string;
}

export async function gqlWalletLedger(branchId: string): Promise<WalletLedgerEntry[]> {
  const data = await graphqlRequest<{ walletLedger: WalletLedgerEntry[] }>(
    `query WalletLedger($branchId: ID!) {
       walletLedger(branchId: $branchId) { _id branchId type amountCentavos balanceAfterCentavos xenditReference createdAt }
     }`,
    { branchId },
  );
  return data.walletLedger ?? [];
}

// ─── Top-up lifecycle ─────────────────────────────────────────────────────────
// The client never credits the wallet. `initializeTopUp` only opens a PENDING
// intent and asks the gateway for an invoice; the balance moves solely on the
// verified webhook (BE RISK-P0-003). So the client cannot mint balance, and it
// cannot supply a payment reference either — the BE mints that from the intent
// id. The flow is: initialize → open `invoiceUrl` → poll `topUpStatus` until it
// leaves PENDING. See runTopUp() in src/services/topUp.ts, which drives it.
//
// The local dev gateway (dev-payment.gateway.ts) returns no invoiceUrl and
// settles through that same verified-posting path immediately, so in dev the
// intent usually comes back SUCCEEDED on the first response.

export type TopUpIntentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "EXPIRED";

export interface TopUpIntent {
  _id: string;
  branchId: string;
  amountCentavos: number;
  status: TopUpIntentStatus;
  /** Gateway invoice id — null on the dev gateway. */
  xenditInvoiceId: string | null;
  /** Hosted checkout page to open. Null when the gateway auto-settles (dev). */
  invoiceUrl: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
}

const TOP_UP_INTENT_FIELDS = `
  _id branchId amountCentavos status xenditInvoiceId invoiceUrl resolvedAt createdAt
`;

export async function gqlInitializeTopUp(
  branchId: string,
  amountCentavos: number,
): Promise<TopUpIntent> {
  const data = await graphqlRequest<{ initializeTopUp: TopUpIntent }>(
    `mutation InitializeTopUp($input: TopUpWalletInput!) {
       initializeTopUp(input: $input) { ${TOP_UP_INTENT_FIELDS} }
     }`,
    // TopUpWalletInput.amountCentavos is Int! and the BE re-checks with
    // Number.isInteger — a fractional value (e.g. a percentage-derived amount)
    // would be rejected outright, so round before it leaves the client. The
    // payment reference is server-minted; the client never fabricates one.
    { input: { branchId, amountCentavos: Math.round(amountCentavos) } },
  );
  return data.initializeTopUp;
}

/**
 * Every top-up ATTEMPT for a branch, newest first — including the ones that
 * never became money. `walletLedger` gains a row only when a payment is
 * verified, so an abandoned checkout (PENDING) or a rejected one
 * (FAILED/EXPIRED) appears nowhere in it. Merge the two with
 * `mergeWalletActivity()` rather than rendering this list on its own.
 */
export async function gqlTopUpHistory(branchId: string): Promise<TopUpIntent[]> {
  const data = await graphqlRequest<{ topUpHistory: TopUpIntent[] }>(
    `query TopUpHistory($branchId: ID!) {
       topUpHistory(branchId: $branchId) { ${TOP_UP_INTENT_FIELDS} }
     }`,
    { branchId },
  );
  return data.topUpHistory ?? [];
}

export async function gqlTopUpStatus(intentId: string): Promise<TopUpIntent> {
  const data = await graphqlRequest<{ topUpStatus: TopUpIntent }>(
    `query TopUpStatus($intentId: ID!) {
       topUpStatus(intentId: $intentId) { ${TOP_UP_INTENT_FIELDS} }
     }`,
    { intentId },
  );
  return data.topUpStatus;
}
