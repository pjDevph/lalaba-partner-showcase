// src/services/topUp.ts
// Drives the wallet top-up lifecycle for both wallet screens (merchant
// app/(tabs)/wallet.tsx and washer app/(washer)/fee-balance.tsx).
//
// The client is deliberately NOT trusted to credit the wallet — the BE moves
// balance only on a verified gateway webhook (RISK-P0-003). So all this does is:
//
//   1. initializeTopUp        → a PENDING intent (+ an invoiceUrl in production)
//   2. open invoiceUrl        → the user pays on the gateway's hosted page
//   3. poll topUpStatus       → until the webhook flips it off PENDING
//
// On the local dev gateway there is no invoiceUrl and the intent comes back
// already SUCCEEDED, so step 2 is skipped and step 3 exits on its first check.

import { Linking } from "react-native";
import {
  gqlInitializeTopUp,
  gqlTopUpStatus,
  type TopUpIntent,
} from "./graphql/wallet";

/** How long to keep polling before handing the user back to the wallet screen. */
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS = 2_000;

export type TopUpOutcome =
  /** Balance credited — refresh the wallet. */
  | { kind: "succeeded"; intent: TopUpIntent }
  /** Gateway reported a definitive failure or the invoice expired. */
  | { kind: "failed"; intent: TopUpIntent }
  /** Still PENDING when we stopped polling. NOT a failure — the webhook may
   *  land later, so never tell the user the payment did not go through. */
  | { kind: "pending"; intent: TopUpIntent };

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function outcomeFor(intent: TopUpIntent): TopUpOutcome | null {
  if (intent.status === "SUCCEEDED") return { kind: "succeeded", intent };
  if (intent.status === "FAILED" || intent.status === "EXPIRED") {
    return { kind: "failed", intent };
  }
  return null; // PENDING — keep waiting
}

/**
 * Runs one top-up attempt to completion. Throws only if `initializeTopUp`
 * itself is rejected (bad amount, unowned/deactivated branch, network) — once
 * an intent exists, every terminal state is reported through TopUpOutcome so
 * the caller can phrase "pending" differently from "failed".
 *
 * @param onInvoiceOpened called after the hosted checkout page is launched, so
 *        the screen can swap its spinner for a "waiting for payment" state.
 */
export async function runTopUp(
  branchId: string,
  amountCentavos: number,
  onInvoiceOpened?: () => void,
): Promise<TopUpOutcome> {
  const intent = await gqlInitializeTopUp(branchId, amountCentavos);

  // Dev gateway settles inside the mutation — no page to open, nothing to poll.
  const settledImmediately = outcomeFor(intent);
  if (settledImmediately) return settledImmediately;

  if (intent.invoiceUrl) {
    // A checkout page we cannot open is a dead end: the intent would sit
    // PENDING forever with no way for the user to pay it.
    const url = intent.invoiceUrl;
    const canOpen = await Linking.canOpenURL(url).catch(() => false);
    if (!canOpen) {
      throw new Error("Could not open the payment page. Please try again.");
    }
    await Linking.openURL(url);
    onInvoiceOpened?.();
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let latest = intent;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      latest = await gqlTopUpStatus(intent._id);
    } catch {
      // A dropped poll is not a failed payment — the webhook is what settles
      // this. Keep polling until the deadline.
      continue;
    }
    const outcome = outcomeFor(latest);
    if (outcome) return outcome;
  }
  return { kind: "pending", intent: latest };
}

/** User-facing copy for a non-succeeded outcome. */
export function topUpOutcomeMessage(outcome: TopUpOutcome): string {
  if (outcome.kind === "failed") {
    return outcome.intent.status === "EXPIRED"
      ? "The payment page expired before the payment completed. Please try again."
      : "The payment did not go through. Please try again.";
  }
  return "We haven't received confirmation of your payment yet. If you completed it, your balance will update shortly.";
}
