// src/lib/categoryLabel.ts
// Service-category enum → the label a customer reads.
//
// Kept identical to LALABA_CUSTOMER_APP_DEV's humanizeCategory, because the
// merchant's "View as customer" panel claims to show exactly what the customer
// card shows. It previously rendered the raw enum — a merchant checking their
// own listing saw "wash_and_fold" where their customers see "Wash & Fold".

/** `wash_and_fold` / `WASH_AND_FOLD` → `Wash & Fold`. */
export function humanizeCategory(raw: string): string {
  return raw
    .split("_")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
    .replace(/\bAnd\b/g, "&");
}
