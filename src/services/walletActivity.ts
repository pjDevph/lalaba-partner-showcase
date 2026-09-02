// src/services/walletActivity.ts
// One activity list out of the two the BE keeps, because neither is the whole
// story on its own:
//
//   walletLedger  — money that actually moved. Top-up credits and fee debits,
//                   each with the running balance. Gains a row ONLY when a
//                   payment is verified by the gateway webhook.
//   topUpHistory  — top-up *attempts*. The ones still on the checkout page
//                   (PENDING) and the ones that died there (FAILED/EXPIRED)
//                   exist only here; the ledger never hears about them.
//
// Rendering both lists side by side would show a settled ₱100 twice — once as
// the SUCCEEDED intent, once as the credit it produced. So a SUCCEEDED intent
// is dropped in favour of its ledger row, which is the richer record (it knows
// the resulting balance). The join key is the ledger row's `xenditReference`,
// which the BE sets to the intent's own `_id` (see topup-intent.schema.ts).
//
// This mattered little while local dev ran the auto-succeed gateway — every
// intent settled inside the mutation, so ledger ≈ full history. Against real
// Xendit the abandoned checkout is the common case.

import type { WalletLedgerEntry, TopUpIntent, TopUpIntentStatus } from "./graphql/wallet";

export type WalletActivityKind =
  /** A verified top-up credit. */
  | "TOP_UP"
  /** A platform-fee debit. */
  | "FEE"
  /** An attempt that has not settled: PENDING / FAILED / EXPIRED. */
  | "TOP_UP_ATTEMPT";

export interface WalletActivityItem {
  /** Stable list key. Ledger `_id` or intent `_id` — they never collide. */
  id: string;
  kind: WalletActivityKind;
  /** Always positive; `kind` carries the direction. */
  amountCentavos: number;
  /** Running balance after the movement. Null for an unsettled attempt. */
  balanceAfterCentavos: number | null;
  /** ISO timestamp used for sorting and display. */
  at: string;
  /** Only set when kind === "TOP_UP_ATTEMPT". */
  status?: TopUpIntentStatus;
  /** Checkout page to resume, when an attempt is still PENDING and has one. */
  invoiceUrl?: string | null;
}

/**
 * How long a PENDING attempt is described as still settling.
 *
 * A PENDING intent means one of two things, and its status cannot tell them
 * apart: the user paid on the gateway and the webhook hasn't landed yet
 * (resolves itself, seconds), or the user closed the checkout page without
 * paying (never resolves — only they can move it). Age is the only signal we
 * have, so a fresh row reads as "processing" and a stale one tells the user
 * the ball is in their court. Calling everything "processing" would leave an
 * abandoned top-up looking permanently in-flight.
 *
 * Matched to POLL_TIMEOUT_MS in topUp.ts: that is exactly how long the app
 * itself waits for the webhook before it stops expecting one.
 */
export const SETTLING_WINDOW_MS = 3 * 60 * 1000;

/**
 * True when the only thing that can advance this row is the user paying. Drives
 * both the label and the "tap to finish paying" hint, so the two can't
 * contradict each other.
 */
export function needsUserPayment(item: WalletActivityItem, now: number = Date.now()): boolean {
  if (item.kind !== "TOP_UP_ATTEMPT" || item.status !== "PENDING") return false;
  const started = Date.parse(item.at);
  // An unreadable timestamp is treated as stale: prompting a user to finish a
  // payment they already made is recoverable, telling them to keep waiting for
  // one they never started is not.
  if (Number.isNaN(started)) return true;
  return now - started > SETTLING_WINDOW_MS;
}

/**
 * Copy for one row. Kept next to the merge so both stay in step. Deliberately
 * time-independent — the label a user sees never changes on its own; only the
 * actionable hint does, via needsUserPayment.
 */
export function activityLabel(item: WalletActivityItem): string {
  if (item.kind === "TOP_UP") return "Top up";
  if (item.kind === "FEE") return "Platform fee";
  switch (item.status) {
    // Every unsettled attempt reads as "processing", fresh or old (product
    // decision). The age split lives on in needsUserPayment, which still gates
    // the "tap to finish paying" hint — so a row the user can actually act on
    // says so, without the label itself changing under them.
    case "PENDING": return "Top up processing";
    case "FAILED": return "Top up failed";
    case "EXPIRED": return "Top up expired";
    default: return "Top up";
  }
}

const timeOf = (iso: string | null | undefined): number => {
  const t = Date.parse(iso ?? "");
  // An unparseable timestamp sorts last rather than to 1970, where it would
  // silently head the list under a descending sort.
  return Number.isNaN(t) ? -Infinity : t;
};

/**
 * Newest first. Safe to call with either list empty — a fetch for one of them
 * can fail without blanking the other.
 */
export function mergeWalletActivity(
  ledger: WalletLedgerEntry[],
  intents: TopUpIntent[],
): WalletActivityItem[] {
  // Which intents already appear as money. Only TOP_UP rows carry a reference,
  // but filtering on `type` too would break if a future credit type reuses the
  // field — presence of the reference is the real signal.
  const settled = new Set(
    ledger.map((e) => e.xenditReference).filter((r): r is string => !!r),
  );

  const fromLedger: WalletActivityItem[] = ledger.map((e) => ({
    id: e._id,
    kind: e.type === "TOP_UP" ? "TOP_UP" : "FEE",
    amountCentavos: Math.abs(e.amountCentavos),
    balanceAfterCentavos: e.balanceAfterCentavos,
    at: e.createdAt,
  }));

  const fromIntents: WalletActivityItem[] = intents
    // A SUCCEEDED intent is already in the ledger. Guard on the reference set
    // rather than on status alone: if a webhook is mid-flight the intent can
    // read SUCCEEDED while its ledger row hasn't been fetched into this list,
    // and dropping it on status would make the top-up vanish from the screen
    // entirely until the next refresh.
    .filter((i) => !settled.has(i._id))
    .map((i) => ({
      id: i._id,
      kind: "TOP_UP_ATTEMPT" as const,
      amountCentavos: Math.abs(i.amountCentavos),
      balanceAfterCentavos: null,
      at: i.resolvedAt ?? i.createdAt ?? "",
      status: i.status,
      invoiceUrl: i.invoiceUrl,
    }));

  return [...fromLedger, ...fromIntents].sort((a, b) => timeOf(b.at) - timeOf(a.at));
}
