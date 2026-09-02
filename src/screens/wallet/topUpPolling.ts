// src/screens/wallet/topUpPolling.ts
// Poll a TopUpIntent until it reaches a terminal state, with backoff and a
// hard timeout. Pure logic (injectable fetch/delay) so it's unit-testable.

import type { TopUpIntent } from "../../services/graphql/wallet";

export const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "EXPIRED"]);

// Backoff schedule in ms: quick first checks (the dev gateway resolves on the
// first poll), then settle to a 10s cadence while the user pays the invoice.
export const POLL_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 10_000];

export const DEFAULT_TIMEOUT_MS = 5 * 60_000;

export interface PollOptions {
  /** Overall budget; resolves { timedOut: true } when exhausted. */
  timeoutMs?: number;
  /** Injectable for tests. */
  delay?: (ms: number) => Promise<void>;
  /** Abort check — return true to stop polling (e.g. modal closed). */
  isCancelled?: () => boolean;
}

export interface PollResult {
  intent: TopUpIntent | null;
  timedOut: boolean;
  cancelled: boolean;
}

const defaultDelay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Polls `fetchStatus` until the intent is terminal, the timeout elapses, or
 * `isCancelled` returns true. Individual poll errors are tolerated (network
 * blips while the user is off in the browser paying) — the loop keeps going
 * until the budget runs out.
 */
export async function pollTopUpStatus(
  fetchStatus: () => Promise<TopUpIntent>,
  options: PollOptions = {},
): Promise<PollResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const delay = options.delay ?? defaultDelay;
  const isCancelled = options.isCancelled ?? (() => false);

  const startedAt = Date.now();
  let attempt = 0;
  let lastIntent: TopUpIntent | null = null;

  for (;;) {
    if (isCancelled()) return { intent: lastIntent, timedOut: false, cancelled: true };
    try {
      lastIntent = await fetchStatus();
      if (TERMINAL_STATUSES.has(lastIntent.status)) {
        return { intent: lastIntent, timedOut: false, cancelled: false };
      }
    } catch {
      // Transient poll failure — keep trying within the budget.
    }
    const nextDelay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)];
    attempt += 1;
    if (Date.now() - startedAt + nextDelay > timeoutMs) {
      return { intent: lastIntent, timedOut: true, cancelled: false };
    }
    await delay(nextDelay);
  }
}
