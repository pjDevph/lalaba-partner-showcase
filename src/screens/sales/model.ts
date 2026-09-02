// Sales report model — types, status/payment constants, and aggregation helpers.
// Extracted from sales.tsx (no JSX).
import { C } from "../../theme/tokens";
import { formatPeso } from "../../lib/format";

export type Period       = "today" | "week" | "month" | "custom";
export type ReportBasis  = "all" | "claimed" | "excl_cancelled";
export type ReportTab    = "overview" | "transactions" | "payments" | "services";

export interface SaleOrder {
  id: string;
  claimCode: string;
  customerName: string;
  total: number;
  subtotal: number;
  amountReceived: number;
  discountAmount: number;
  discountCode: string | null;
  status: "CREATED" | "PROCESSING" | "READY_FOR_PICKUP" | "CLAIMED" | "CANCELLED";
  createdAt: Date;
  cancelledAt: Date | null;
  items: { serviceName: string; unitPrice: number; weightKg: number }[];
  branchId: string | null;
  paymentMethod: string | null;
  txList: { paymentMethod: string | null; amountPaid: number }[];
  paymentStatus: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_MAP: Record<string, SaleOrder["status"]> = {
  pending:     "CREATED",
  in_progress: "PROCESSING",
  ready:       "READY_FOR_PICKUP",
  completed:   "CLAIMED",
  claimed:     "CLAIMED",
  cancelled:   "CANCELLED",
  void:        "CANCELLED",
};

export const STATUS_STYLE: Record<SaleOrder["status"], { bg: string; text: string; label: string }> = {
  CREATED:          { bg: C.warning100, text: C.warning700,  label: "Created" },
  PROCESSING:       { bg: C.info100,    text: C.info500,     label: "Processing" },
  READY_FOR_PICKUP: { bg: "#F0FDF4",    text: "#15803D",     label: "Ready" },
  CLAIMED:          { bg: "#DCFCE7",    text: "#15803D",     label: "Claimed" },
  CANCELLED:        { bg: C.error100,   text: C.error700,    label: "Cancelled" },
};

export const PM_LABEL: Record<string, string> = {
  CASH: "Cash", GCASH: "GCash", MAYA: "Maya",
  CARD: "Card", QPH: "QPH",
  SPLIT: "Split",
  // lowercase from BE
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qph: "QPH", split: "Split",
  // Null / unknown → show as unpaid, not as a broken label
  UNKNOWN: "No payment recorded",
  NO_PAYMENT: "No payment recorded",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPeriodRange(period: Period, customRange?: { from: Date; to: Date } | null): [Date, Date] {
  if (period === "custom" && customRange) return [customRange.from, customRange.to];
  const now = new Date();
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  if (period === "today")       { start.setHours(0, 0, 0, 0); }
  else if (period === "week")   { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
  else                          { start.setDate(1); start.setHours(0, 0, 0, 0); }
  return [start, end];
}

export function fc(v: number) {
  return formatPeso(v);
}

export function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function computeSummary(orders: SaleOrder[], basis: ReportBasis) {
  const nonClaimedBasisOrders = basis === "excl_cancelled" ? orders.filter(o => o.status !== "CANCELLED") : orders;
  const basisOrders = basis === "claimed" ? orders.filter(o => o.status === "CLAIMED") : nonClaimedBasisOrders;

  // Gross Sales / Collected / Avg Order exclude CANCELLED — that value lives in the Cancelled KPI.
  const revenueBasis  = basisOrders.filter(o => o.status !== "CANCELLED");
  const grossSales    = revenueBasis.reduce((s, o) => s + o.total, 0);
  const collected     = revenueBasis.reduce((s, o) => s + (o.amountReceived || 0), 0);
  const unpaidBalance = orders
    .filter(o => ["CREATED", "PROCESSING", "READY_FOR_PICKUP"].includes(o.status) && o.paymentStatus !== "refunded")
    .reduce((s, o) => s + Math.max(0, o.total - (o.amountReceived || 0)), 0);
  const cancelledOrders = orders.filter(o => o.status === "CANCELLED");
  const cancelledValue  = cancelledOrders.reduce((s, o) => s + o.total, 0);
  const avgOrder = revenueBasis.length > 0 ? grossSales / revenueBasis.length : 0;

  return { grossSales, collected, unpaidBalance, cancelledValue, cancelledCount: cancelledOrders.length, orderCount: basisOrders.length, avgOrder, basisOrders };
}

export function computePayments(basisOrders: SaleOrder[]) {
  const map: Record<string, { amount: number; count: number }> = {};
  basisOrders.filter(o => o.paymentStatus !== "refunded").forEach(o => {
    const txs = o.txList.length > 0 ? o.txList : [{ paymentMethod: null as string | null, amountPaid: 0 }];
    const seen = new Set<string>();
    txs.forEach(tx => {
      const raw = (tx.paymentMethod ?? "").trim().toUpperCase();
      const pm  = (!raw || raw === "UNKNOWN") ? "NO_PAYMENT" : raw;
      if (!map[pm]) map[pm] = { amount: 0, count: 0 };
      map[pm].amount += tx.amountPaid;
      if (!seen.has(pm)) { seen.add(pm); map[pm].count++; }
    });
  });
  return Object.entries(map)
    .map(([method, d]) => ({ method, label: PM_LABEL[method] ?? method, ...d }))
    .sort((a, b) => b.amount - a.amount);
}

export function computeServices(basisOrders: SaleOrder[]) {
  const map: Record<string, { count: number; revenue: number }> = {};
  basisOrders.filter(o => o.paymentStatus !== "refunded").forEach(o => {
    o.items.forEach(item => {
      const key = item.serviceName ?? "Unknown";
      if (!map[key]) map[key] = { count: 0, revenue: 0 };
      map[key].count   += item.weightKg ?? 1;
      map[key].revenue += (item.unitPrice ?? 0) * (item.weightKg ?? 1);
    });
  });
  return Object.entries(map).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue);
}

// ─── Icons ────────────────────────────────────────────────────────────────────
