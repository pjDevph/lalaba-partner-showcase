// Dashboard shared foundation — icon set, data types, RevenueChart, skeletons.
// Extracted from dashboard.tsx.
import React from "react";
import { View, Text } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { gqlMyOrders, gqlMyTransactions, type GqlTransaction } from "../../services/graphql/orders";

export const I = {
  Plus: ({ c = C.white }: { c?: string }) => (
    <Ionicons name="add" size={18} color={c} />
  ),
  Arrow: ({ c = C.brand500 }: { c?: string }) => (
    <Ionicons name="arrow-forward" size={16} color={c} />
  ),
  Chevron: ({ c = C.gray400 }: { c?: string }) => (
    <Ionicons name="chevron-forward" size={14} color={c} />
  ),
  Bell: ({ c = C.white }: { c?: string }) => (
    <Ionicons name="notifications-outline" size={20} color={c} />
  ),
  Building: ({ c = C.brand500 }: { c?: string }) => (
    <MaterialCommunityIcons name="office-building-outline" size={16} color={c} />
  ),
  Queue: ({ c = C.accent500, s = 16 }: { c?: string; s?: number }) => (
    <Ionicons name="list-outline" size={s} color={c} />
  ),
  Clipboard: ({ c = C.success700 }: { c?: string }) => (
    <MaterialCommunityIcons name="clipboard-check-outline" size={16} color={c} />
  ),
  Services: ({ c = C.accent700, s = 16 }: { c?: string; s?: number }) => (
    <Ionicons name="clipboard-outline" size={s} color={c} />
  ),
  TrendUp: ({ c = C.success700 }: { c?: string }) => (
    <Ionicons name="trending-up" size={13} color={c} />
  ),
  TrendDown: ({ c = C.error700 }: { c?: string }) => (
    <Ionicons name="trending-down" size={13} color={c} />
  ),
  Search: ({ c = C.info500, s = 16 }: { c?: string; s?: number }) => (
    <Ionicons name="search" size={s} color={c} />
  ),
  Report: ({ c = C.info500, s = 16 }: { c?: string; s?: number }) => (
    <Ionicons name="document-text-outline" size={s} color={c} />
  ),
  Costing: ({ c = C.brand600, s = 16 }: { c?: string; s?: number }) => (
    <FontAwesome5 name="dollar-sign" size={s} color={c} />
  ),
};

// ─── Revenue sparkline chart ───────────────────────────────────────────────────

export function RevenueChart({ data, width = 300, height = 72 }: Readonly<{
  data: number[];
  width?: number;
  height?: number;
}>) {
  // Guard against NaN/undefined sneaking in from upstream data — a single bad
  // value would otherwise poison Math.max() and null out every y-coordinate,
  // producing an invalid SVG path that crashes the native renderer.
  const safeData = data.map((v) => (Number.isFinite(v) ? v : 0));
  const allZero = safeData.every((v) => v === 0);
  if (allZero) {
    return (
      <View style={{ width, height, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 11, color: C.gray300 }}>No revenue recorded this week</Text>
      </View>
    );
  }
  const max = Math.max(...safeData, 1);
  const padT = 8, padB = 6;
  const xStep = safeData.length > 1 ? width / (safeData.length - 1) : 0;
  const pts = safeData.map((v, i) => ({
    x: i * xStep,
    y: padT + ((max - v) / max) * (height - padT - padB),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fill = `${line} L ${width},${height} L 0,${height} Z`;
  const last = pts.at(-1)!;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={C.brand400} stopOpacity={0.18}/>
          <Stop offset="100%" stopColor={C.brand400} stopOpacity={0}/>
        </LinearGradient>
      </Defs>
      <Path d={fill} fill="url(#areaFill)"/>
      <Path d={line} stroke={C.brand500} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d={`M${last.x-5} ${last.y} A5 5 0 0 0 ${last.x+5} ${last.y} A5 5 0 0 0 ${last.x-5} ${last.y} Z`} fill={C.white}/>
      <Path d={`M${last.x-3} ${last.y} A3 3 0 0 0 ${last.x+3} ${last.y} A3 3 0 0 0 ${last.x-3} ${last.y} Z`} fill={C.brand500}/>
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Stats {
  todayRevenue: number;
  todayOrders: number;
  newOrders: number;
  processingOrders: number;
  activeOrders: number;
  readyOrders: number;
  completedOrders: number;
  weeklyRevenue: number[];
  weekTotal: number;
  prevWeekTotal: number;
  recentOrders: Activity[];
}

export interface Activity {
  id: string;
  claimCode?: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: Date;
  services: string[];
  branchId?: string | null;
}

export interface CustomRangeStats {
  revenue: number;
  orderCount: number;
  activeOrders: number;
  readyOrders: number;
  completedOrders: number;
}

export const CHIP_BG: Record<string, string> = {
  CREATED:          C.warning100,
  PROCESSING:       C.info100,
  READY_FOR_PICKUP: C.brand100,
  CLAIMED:          C.success100,
};
export const CHIP_FG: Record<string, string> = {
  CREATED:          C.warning700,
  PROCESSING:       C.info500,
  READY_FOR_PICKUP: C.brand700,
  CLAIMED:          C.success700,
};
export const STATUS_CHIP_LABEL: Record<string, string> = {
  CREATED:          "NEW",
  PROCESSING:       "PROCESSING",
  READY_FOR_PICKUP: "READY",
  CLAIMED:          "CLAIMED",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function SkeletonBlock({ w, h, r = 8, mb = 0 }: Readonly<{ w: number | string; h: number; r?: number; mb?: number }>) {
  return <View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: C.gray100, marginBottom: mb }} />;
}

export function SkeletonLoader() {
  return (
    <View style={{ gap: SP._12 }}>
      <View style={{ backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16, ...SHADOW.sm, gap: 10 }}>
        <SkeletonBlock w="100%" h={52} r={12} />
        <SkeletonBlock w="100%" h={44} r={12} />
      </View>
      <View style={{ backgroundColor: C.white, borderRadius: RADIUS.lg, overflow: "hidden", ...SHADOW.sm }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: C.gray100 }}>
            <SkeletonBlock w={36} h={36} r={10} />
            <View style={{ flex: 1, gap: 6 }}>
              <SkeletonBlock w="45%" h={12} r={6} />
              <SkeletonBlock w="30%" h={10} r={5} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Branch stats ─────────────────────────────────────────────────────────────

export interface BranchStat {
  branchId: string;
  branchName: string;
  activeOrders: number;
  todayRevenue: number;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

export function makeTodayStart(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
export function makeWeekStart(back = 0): Date {
  const d = new Date(); d.setDate(d.getDate() - 6 - back * 7); d.setHours(0, 0, 0, 0); return d;
}
export function isNetworkError(err: any): boolean {
  return err?.code === "unavailable" || err?.code === "failed-precondition" ||
    String(err?.message ?? "").toLowerCase().includes("network");
}

export function parseTodayStats(rows: any[]): Pick<Stats, "todayRevenue" | "newOrders" | "processingOrders" | "activeOrders" | "readyOrders" | "completedOrders"> {
  const todayRevenue     = rows.filter((o) => o.status === "CLAIMED").reduce((s: number, o: any) => s + (o.totalAmount ?? 0), 0);
  const newOrders        = rows.filter((o: any) => o.status === "CREATED").length;
  const processingOrders = rows.filter((o: any) => o.status === "PROCESSING").length;
  const readyOrders      = rows.filter((o: any) => o.status === "READY_FOR_PICKUP").length;
  const completedOrders  = rows.filter((o: any) => o.status === "CLAIMED").length;
  return { todayRevenue, newOrders, processingOrders, activeOrders: newOrders + processingOrders, readyOrders, completedOrders };
}

export interface RawOrderDoc {
  id: string; claimCode?: string; branchId: string | null; totalAmount: number;
  status: string; createdAt: Date; items: any[]; walkinCustomer: any;
}

export async function loadRawTransactions(dateFrom?: string, dateTo?: string): Promise<GqlTransaction[]> {
  const from = dateFrom ?? new Date(Date.now() - 14 * 86_400_000).toISOString();
  return gqlMyTransactions({ dateFrom: from, dateTo });
}

export async function loadRawOrders(_merchantId: string, dateFrom?: string, dateTo?: string): Promise<RawOrderDoc[]> {
  const orders = dateFrom
    ? await gqlMyOrders({ dateFrom, dateTo, limit: 500 })
    : await gqlMyOrders({ days: 14, limit: 100 });
  return orders.map((o) => {
    let orderStatus: string;
    if (o.laundryStatus === "completed" || o.laundryStatus === "claimed") { orderStatus = "CLAIMED"; }
    else if (o.laundryStatus === "ready") { orderStatus = "READY_FOR_PICKUP"; }
    else if (o.laundryStatus === "in_progress") { orderStatus = "PROCESSING"; }
    else if (o.laundryStatus === "cancelled" || o.laundryStatus === "void") { orderStatus = "CANCELLED"; }
    else { orderStatus = "CREATED"; }
    return {
      id: o._id, claimCode: o.claimCode, branchId: o.branchId ?? null, totalAmount: o.totalAmount,
      status: orderStatus,
      createdAt: o.createdAt ? new Date(o.createdAt) : new Date(),
      items: o.items ?? [], walkinCustomer: { name: o.customerName },
    };
  });
}

// Custom date-range stats have no meaningful "today vs. this week" split — the
// BE has already scoped `orders` to the picked range, so this is a flat totals
// aggregate over that whole set (unlike deriveStats, which slices a wider
// fetch window into today/this-week/previous-week buckets).
export function deriveCustomRangeStats(orders: RawOrderDoc[], branchId: string | null): CustomRangeStats {
  const scoped = branchId ? orders.filter((o) => o.branchId === branchId) : orders;
  const nonCancelled = scoped.filter((o) => (o.status as string) !== "CANCELLED");
  return {
    revenue:         scoped.filter((o) => o.status === "CLAIMED").reduce((s, o) => s + (o.totalAmount ?? 0), 0),
    orderCount:      scoped.length,
    activeOrders:    nonCancelled.filter((o) => o.status === "CREATED" || o.status === "PROCESSING").length,
    readyOrders:     nonCancelled.filter((o) => o.status === "READY_FOR_PICKUP").length,
    completedOrders: nonCancelled.filter((o) => o.status === "CLAIMED").length,
  };
}

export function deriveStats(orders: RawOrderDoc[], _txns: GqlTransaction[], branchId: string | null): Stats {
  const todayStart = makeTodayStart();
  const weekStart  = makeWeekStart(0);
  const prevStart  = makeWeekStart(1);
  const scoped     = branchId ? orders.filter((o) => o.branchId === branchId) : orders;
  const todayDocs  = scoped.filter((o) => o.createdAt >= todayStart);
  const thisWeekDocs = scoped.filter((o) => o.createdAt >= weekStart);
  const prevWeekDocs = scoped.filter((o) => o.createdAt >= prevStart && o.createdAt < weekStart);

  const todayCounts = parseTodayStats(todayDocs);

  // Operational queue counts use ALL loaded orders, not just today's calendar slice,
  // because orders created last evening are still actively in the queue this morning.
  const nonCancelled = scoped.filter((o) => (o.status as string) !== "CANCELLED");
  const activeOrders = nonCancelled.filter((o) => o.status === "CREATED" || o.status === "PROCESSING").length;
  const readyOrders  = nonCancelled.filter((o) => o.status === "READY_FOR_PICKUP").length;

  const buckets: number[] = new Array(7).fill(0);
  let weekTotal = 0;
  thisWeekDocs.forEach((o) => {
    if (o.status !== "CLAIMED") return;
    const daysAgo = Math.floor((Date.now() - o.createdAt.getTime()) / 86400000);
    buckets[6 - Math.min(6, daysAgo)] += o.totalAmount ?? 0;
    weekTotal += o.totalAmount ?? 0;
  });
  const prevWeekTotal = prevWeekDocs.filter((o) => o.status === "CLAIMED").reduce((s, o) => s + (o.totalAmount ?? 0), 0);

  const recentOrders: Activity[] = [...scoped].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 10).map((o) => ({
    id: o.id, claimCode: o.claimCode, customerName: o.walkinCustomer?.name || "Walk-in",
    total: o.totalAmount, status: o.status, createdAt: o.createdAt,
    services: o.items.map((i: any) => i.serviceName ?? "Service"),
    branchId: o.branchId,
  }));
  return { ...todayCounts, activeOrders, readyOrders, todayOrders: todayDocs.length, weeklyRevenue: buckets, weekTotal, prevWeekTotal, recentOrders };
}

export function deriveBranchStats(orders: RawOrderDoc[], _txns: GqlTransaction[], branches: { id: string; name: string }[]): BranchStat[] {
  if (branches.length < 2) return [];
  const todayStart = makeTodayStart();
  return branches.map((b) => {
    const branchOrders = orders.filter((o) => o.branchId === b.id);
    const todayDocs    = branchOrders.filter((o) => o.createdAt >= todayStart);
    return {
      branchId: b.id, branchName: b.name,
      activeOrders: branchOrders.filter((o) => o.status === "CREATED" || o.status === "PROCESSING").length,
      todayRevenue: todayDocs.filter((o) => o.status === "CLAIMED").reduce((s, o) => s + o.totalAmount, 0),
    };
  });
}

// ─── Needs Attention card ─────────────────────────────────────────────────────

