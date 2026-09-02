// src/lib/pricingLabels.ts

/**
 * What an unpriced order shows instead of an amount.
 *
 * An online order has no total until the laundry is weighed, and every surface
 * that rendered that state as "₱0" was saying something false — to a merchant
 * it looked like a free job, to a rider like there was nothing to collect.
 *
 * One constant so the merchant, staff, washer and courier views cannot end up
 * wording it differently from each other, or from the customer app (which has
 * the same constant, deliberately worded identically — a customer quoting
 * "confirmed at pickup" to a rider should hear their own phrase back).
 */
export const PENDING_PRICE_LABEL = "Confirmed at pickup";

/**
 * Format an amount, or say it is not priced yet.
 *
 * `null`/`undefined` and 0 are both "not priced": an online order can never
 * legitimately total zero, so a zero here is always a missing weigh-in rather
 * than a free wash.
 */
export function pesosOrPending(
  centavos: number | null | undefined,
  format: (n: number) => string,
): string {
  return centavos == null || centavos === 0
    ? PENDING_PRICE_LABEL
    : format(centavos);
}
