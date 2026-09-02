// src/utils/orderAcceptance.ts
// Wallet-gate detection for acceptOnlineOrder failures. The BE now applies the
// same wallet guard to merchants AND washers (WalletAcceptanceGuardService);
// the error strings are part of the contract
// (docs/release-evidence/phase2/agent-online-order-integrity/contract.md):
//   "Wallet balance is negative. Top up before accepting new orders."
//   "Insufficient wallet balance to cover this order's platform fee."

export interface WalletGateResult {
  blocked: boolean;
  /** User-facing copy for the blocking state (only when blocked). */
  message: string | null;
}

const NEGATIVE_RE = /wallet balance is negative/i;
const INSUFFICIENT_RE = /insufficient wallet balance/i;

function messageOf(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "";
}

/**
 * Classify an acceptOnlineOrder failure. Wallet-gate errors get a clear
 * blocking message with a top-up call to action; anything else is not ours to
 * interpret (callers fall back to the generic error path).
 */
export function walletGateFromError(err: unknown): WalletGateResult {
  const msg = messageOf(err);
  if (NEGATIVE_RE.test(msg)) {
    return {
      blocked: true,
      message:
        "Your fee wallet balance is negative, so new orders can't be accepted. Top up your wallet to keep accepting orders.",
    };
  }
  if (INSUFFICIENT_RE.test(msg)) {
    return {
      blocked: true,
      message:
        "Your fee wallet can't cover this order's platform fee. Top up your wallet to accept it.",
    };
  }
  return { blocked: false, message: null };
}
