// src/utils/formatQuantity.ts
// Quantity display for stock counts — always shows the exact figure
// (comma-grouped), never abbreviated (e.g. "2,000", not "2k").

export function formatQuantityDisplay(value: number, _isTablet: boolean): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
