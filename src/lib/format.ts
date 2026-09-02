// Shared formatting helpers — replaces the per-screen `fp` / `fc` / `p2` / `p0`
// currency formatters that were copy-pasted across pos/sales/dashboard/inventory.
//
// Behavior is intentionally identical to those local copies: a "₱" prefix plus
// `toLocaleString("en-PH", opts)`. The default (minimumFractionDigits: 2, no max)
// matches the common `fp`/`fc`/`p2` variants exactly, including their up-to-3
// decimal fallback — so swapping a call site changes nothing on screen.
//
// NOTE: this is deliberately NOT the same as `peso()` in features/costing, which
// caps at 2 decimals (maximumFractionDigits: 2). Use `peso()` when you want that
// cap; use `formatPeso()` to preserve the existing per-screen output.
export function formatPeso(
  v: number,
  opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2 },
): string {
  return `₱${v.toLocaleString("en-PH", opts)}`;
}
