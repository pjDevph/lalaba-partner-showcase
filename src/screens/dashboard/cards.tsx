// Dashboard card components (Needs Attention, Queue, Revenue, Quick Tools, Branch carousel).
// Extracted from dashboard.tsx; each carries its own co-located StyleSheet.
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";
import { Card } from "../../components/ui";
import { formatPeso } from "../../lib/format";
import { type UnitGroup, UNIT_LABEL, peso, COSTING_ENABLED } from "../../features/costing/costing";
import { I, RevenueChart, type BranchStat } from "./shared";

export function NeedsAttentionCard({ readyOrders }: Readonly<{ readyOrders: number }>) {
  const [agg] = useState<{
    totalCost: number; trueMargin: number; branches: number;
    units: { unit: UnitGroup; costPerUnit: number }[];
  } | null>(null);

  const state: "saved" | "todo" = agg ? "saved" : "todo";
  const savedAccent = (agg?.trueMargin ?? 0) >= 0 ? C.success500 : C.error500;
  const costingAccent = state === "saved" ? savedAccent : C.brand400;
  const accent = COSTING_ENABLED ? costingAccent : C.success500;
  const pillStyle = state === "saved" ? CK.pillGreen : CK.pillBlue;
  const pillText  = state === "saved" ? "Saved" : "To do";

  // Phase 2: costing deferred — without it this card only exists for ready orders.
  if (!COSTING_ENABLED && readyOrders === 0) return null;

  return (
    <View style={[CK.card, { borderLeftWidth: 4, borderLeftColor: accent }]}>
      {/* Costing row */}
      {COSTING_ENABLED && (
      <TouchableOpacity style={CK.section} onPress={() => router.push("/(tabs)/costing")} activeOpacity={0.85}>
        <View style={CK.headRow}>
          <Text style={CK.label}>NEEDS ATTENTION</Text>
          <View style={[CK.pill, pillStyle]}><Text style={[CK.pillTxt, pillStyle]}>{pillText}</Text></View>
        </View>
        {state === "saved" ? (
          <>
            <Text style={[CK.value, { color: accent }]}>Margin {peso(agg!.trueMargin)}</Text>
            <Text style={CK.meta}>Cost {peso(agg!.totalCost)} · {agg!.branches} branch{agg!.branches !== 1 ? "es" : ""}</Text>
            {agg!.units.length > 0 && (
              <View style={CK.chipRow}>
                {agg!.units.map((x) => (<View key={x.unit} style={CK.chip}><Text style={CK.chipText}>{peso(x.costPerUnit)}/{UNIT_LABEL[x.unit]}</Text></View>))}
              </View>
            )}
            <Text style={CK.ctaText}>View breakdown →</Text>
          </>
        ) : (
          <>
            <Text style={CK.valueMuted}>Daily costing not saved</Text>
            <Text style={CK.meta}>Utilities · Fixed costs · Extra costs need review</Text>
            <Text style={CK.ctaText}>Complete daily costing →</Text>
          </>
        )}
      </TouchableOpacity>
      )}

      {/* Ready orders row */}
      {readyOrders > 0 && (
        <>
          {COSTING_ENABLED && <View style={CK.sectionDivider} />}
          <TouchableOpacity style={CK.readyRow} onPress={() => router.push("/(tabs)/pos")} activeOpacity={0.85}>
            <View style={CK.readyDot} />
            <View style={{ flex: 1 }}>
              <Text style={CK.readyTitle}>{readyOrders} order{readyOrders !== 1 ? "s" : ""} ready for pickup</Text>
              <Text style={CK.readySub}>Notify customers · open queue →</Text>
            </View>
            <I.Chevron c={C.success700} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const CK = StyleSheet.create({
  card:          { backgroundColor: C.white, borderRadius: RADIUS.lg, marginBottom: SP._14, borderWidth: 1, borderColor: C.gray100, ...SHADOW.xs, overflow: "hidden" },
  section:       { padding: SP._16 },
  sectionDivider:{ height: 1, backgroundColor: C.gray100 },
  headRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._4 },
  label:         { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6 },
  value:         { fontSize: 20, fontWeight: "900", color: C.brand700, marginTop: 2 },
  valueMuted:    { fontSize: 16, fontWeight: "800", color: C.gray500, marginTop: 4 },
  meta:          { fontSize: 12, color: C.gray500, marginTop: 2, lineHeight: 17 },
  ctaText:       { fontSize: 12, fontWeight: "700", color: C.brand600, marginTop: 6 },
  chipRow:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip:          { backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  chipText:      { fontSize: 11, fontWeight: "700", color: C.gray700 },
  pill:          { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  pillTxt:       { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  pillGreen:     { backgroundColor: C.success100, color: C.success700 },
  pillAmber:     { backgroundColor: C.warning100, color: C.warning700 },
  pillBlue:      { backgroundColor: C.brand100, color: C.brand700 },
  readyRow:      { flexDirection: "row", alignItems: "center", paddingHorizontal: SP._16, paddingVertical: SP._12, gap: SP._10 },
  readyDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: C.success500, flexShrink: 0 },
  readyTitle:    { fontSize: 13, fontWeight: "700", color: C.success700 },
  readySub:      { fontSize: 11, color: C.success700, marginTop: 1 },
});

// ─── Today's Queue card ───────────────────────────────────────────────────────

export function TodayQueueCard({ newOrders, processingOrders, readyOrders, completedOrders }: Readonly<{
  newOrders: number;
  processingOrders: number;
  readyOrders: number;
  completedOrders: number;
}>) {
  const hasWork = newOrders > 0 || processingOrders > 0 || readyOrders > 0;

  return (
    <TouchableOpacity style={QC.card} onPress={() => router.push("/(tabs)/pos")} activeOpacity={0.85}>
      <Text style={QC.label}>TODAY&apos;S LAUNDRY QUEUE</Text>
      {hasWork ? (
        <View style={QC.statsRow}>
          <View style={QC.stat}>
            <View style={[QC.dot, { backgroundColor: C.warning500 }]} />
            <Text style={[QC.statNum, { color: C.warning700 }]}>{newOrders}</Text>
            <Text style={QC.statLbl}>Received</Text>
          </View>
          <View style={QC.statDivider} />
          <View style={QC.stat}>
            <View style={[QC.dot, { backgroundColor: C.info500 }]} />
            <Text style={[QC.statNum, { color: C.info500 }]}>{processingOrders}</Text>
            <Text style={QC.statLbl}>In Wash</Text>
          </View>
          <View style={QC.statDivider} />
          <View style={QC.stat}>
            <View style={[QC.dot, { backgroundColor: C.brand500 }]} />
            <Text style={[QC.statNum, { color: C.brand600 }]}>{readyOrders}</Text>
            <Text style={QC.statLbl}>For Pickup</Text>
          </View>
          <View style={QC.statDivider} />
          <View style={QC.stat}>
            <View style={[QC.dot, { backgroundColor: C.success500 }]} />
            <Text style={[QC.statNum, { color: C.success700 }]}>{completedOrders}</Text>
            <Text style={QC.statLbl}>Claimed</Text>
          </View>
        </View>
      ) : (
        <View style={QC.emptyRow}>
          <Text style={QC.emptyText}>No clothes in progress yet</Text>
          <Text style={QC.emptySub}>New laundry orders will appear here once created</Text>
        </View>
      )}
      <Text style={QC.cta}>Open POS Terminal →</Text>
    </TouchableOpacity>
  );
}

const QC = StyleSheet.create({
  card:       { backgroundColor: C.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.gray100, padding: SP._16, marginBottom: SP._14, ...SHADOW.xs },
  label:      { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6, marginBottom: SP._12 },
  statsRow:   { flexDirection: "row", alignItems: "center", marginBottom: SP._10 },
  stat:       { flex: 1, alignItems: "center", gap: 4 },
  statDivider:{ width: 1, height: 40, backgroundColor: C.gray100 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  statNum:    { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  statLbl:    { fontSize: 10, color: C.gray400, fontWeight: "600", textAlign: "center" },
  emptyRow:   { paddingVertical: SP._8, marginBottom: SP._4 },
  emptyText:  { fontSize: 14, fontWeight: "600", color: C.gray500 },
  emptySub:   { fontSize: 11, color: C.gray400, marginTop: 3 },
  cta:        { fontSize: 12, fontWeight: "700", color: C.brand500 },
});

// ─── Compact Revenue card (landscape right column) ────────────────────────────

export function CompactRevenueCard({ weekTotal, prevWeekTotal, weeklyRevenue, dayLabels, chartWidth, onPress }: Readonly<{
  weekTotal: number;
  prevWeekTotal: number;
  weeklyRevenue: number[];
  dayLabels: string[];
  chartWidth: number;
  onPress: () => void;
}>) {
  const p2 = (v: number) => formatPeso(v);
  const growth = prevWeekTotal > 0 ? ((weekTotal - prevWeekTotal) / prevWeekTotal) * 100 : null;

  return (
    <View style={RC.card}>
      <Text style={RC.label}>REVENUE · LAST 7 DAYS</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SP._10 }}>
        <Text style={RC.total}>{p2(weekTotal)}</Text>
        {growth !== null && (
          <View style={[RC.growBadge, { backgroundColor: growth >= 0 ? C.success100 : C.error100 }]}>
            {growth >= 0 ? <I.TrendUp /> : <I.TrendDown />}
            <Text style={[RC.growText, { color: growth >= 0 ? C.success700 : C.error700 }]}>
              {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
      <RevenueChart data={weeklyRevenue} width={chartWidth} height={48} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: SP._10 }}>
        {dayLabels.map((d, i) => (
          <Text key={d} style={[RC.dayLbl, i === 6 && { color: C.brand500, fontWeight: "800" }]}>{d}</Text>
        ))}
      </View>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Text style={RC.cta}>View full sales report →</Text>
      </TouchableOpacity>
    </View>
  );
}

const RC = StyleSheet.create({
  card:     { backgroundColor: C.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.gray100, padding: SP._16, marginBottom: SP._14, ...SHADOW.xs },
  label:    { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6, marginBottom: SP._8 },
  total:    { fontSize: 22, fontWeight: "800", color: C.gray900, letterSpacing: -0.5 },
  growBadge:{ flexDirection: "row", alignItems: "center", gap: 3, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  growText: { fontSize: 11, fontWeight: "700" },
  dayLbl:   { fontSize: 9, color: C.gray400, fontWeight: "500" },
  cta:      { fontSize: 12, fontWeight: "700", color: C.brand500 },
});

// A single totals summary for an arbitrary custom range — no day-by-day bar
// chart or week-over-week growth badge, since neither is meaningful once the
// range isn't a fixed calendar week.
export function CustomRangeSummaryCard({ rangeLabel, revenue, orderCount, onPress }: Readonly<{
  rangeLabel: string;
  revenue: number;
  orderCount: number;
  onPress: () => void;
}>) {
  const p2 = (v: number) => formatPeso(v);
  return (
    <View style={RC.card}>
      <Text style={RC.label}>REVENUE · {rangeLabel.toUpperCase()}</Text>
      <Text style={RC.total}>{p2(revenue)}</Text>
      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4, marginBottom: SP._10 }}>
        {orderCount} order{orderCount !== 1 ? "s" : ""} in this range
      </Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Text style={RC.cta}>View full sales report →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Quick Tools grid (compact, for right column) ─────────────────────────────

export function QuickToolsSection({ isMerchant }: Readonly<{ isMerchant: boolean }>) {
  const tools = [
    { key: "services", label: "Services", icon: <I.Services c={C.accent700} s={18} />, bg: C.accent700 + "15", onPress: () => router.push("/(tabs)/services") },
    ...(isMerchant ? [
      // Phase 2: Costing deferred — restored via COSTING_ENABLED
      ...(COSTING_ENABLED ? [{ key: "costing", label: "Costing", icon: <I.Costing c={C.brand600} s={18} />, bg: C.brand600 + "15", onPress: () => router.push("/(tabs)/costing") }] : []),
      { key: "reports", label: "Reports", icon: <I.Report c={C.info500} s={18} />,    bg: C.info500 + "15",  onPress: () => router.push("/(tabs)/sales") },
    ] : []),
    { key: "settings", label: "Settings", icon: (
        <Ionicons name="settings-outline" size={18} color={C.gray500} />
      ), bg: C.gray500 + "15", onPress: () => router.push("/(tabs)/settings") },
  ];

  return (
    <View style={QT.card}>
      <Text style={QT.label}>QUICK TOOLS</Text>
      <View style={QT.grid}>
        {tools.map((t) => (
          <TouchableOpacity key={t.key} style={QT.tile} onPress={t.onPress} activeOpacity={0.75}>
            <View style={[QT.tileIcon, { backgroundColor: t.bg }]}>{t.icon}</View>
            <Text style={QT.tileLbl} numberOfLines={1}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const QT = StyleSheet.create({
  card:     { backgroundColor: C.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.gray100, padding: SP._16, marginBottom: SP._14, ...SHADOW.xs },
  label:    { fontSize: 11, fontWeight: "800", color: C.gray400, letterSpacing: 0.6, marginBottom: SP._12 },
  grid:     { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  tile:     { width: "47%", flexDirection: "row", alignItems: "center", gap: SP._8, backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray100, paddingHorizontal: SP._10, paddingVertical: SP._10 },
  tileIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tileLbl:  { fontSize: 12, fontWeight: "700", color: C.gray800 ?? C.gray900, flex: 1 },
});

// ─── Branch cards ─────────────────────────────────────────────────────────────

export function BranchCarousel({
  branchStats,
  selectedId,
  onSelect,
  p0,
}: Readonly<{
  branchStats: BranchStat[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  p0: (v: number) => string;
}>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", gap: SP._10, paddingRight: SP._4 }}>
      {/* All */}
      <TouchableOpacity
        style={[BC.card, selectedId === null && BC.cardSelected]}
        onPress={() => onSelect(null)} activeOpacity={0.85}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <I.Building c={selectedId === null ? C.brand500 : C.gray400} />
          <Text style={[BC.name, selectedId === null && BC.nameSelected]}>All</Text>
        </View>
        <Text style={[BC.revenue, selectedId === null && BC.revenueSelected]}>
          {p0(branchStats.reduce((s, bs) => s + bs.todayRevenue, 0))}
        </Text>
        <Text style={[BC.sub, { color: branchStats.some((bs) => bs.activeOrders > 0) ? C.info500 : C.gray500 }]}>
          {branchStats.reduce((s, bs) => s + bs.activeOrders, 0)} active
        </Text>
      </TouchableOpacity>
      {branchStats.map((bs) => {
        const sel = selectedId === bs.branchId;
        return (
          <TouchableOpacity key={bs.branchId} style={[BC.card, sel && BC.cardSelected]}
            onPress={() => onSelect(bs.branchId)} activeOpacity={0.85}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <I.Building c={sel ? C.brand500 : C.gray400} />
              <Text style={[BC.name, sel && BC.nameSelected]} numberOfLines={2}>{bs.branchName}</Text>
            </View>
            <Text style={[BC.revenue, sel && BC.revenueSelected]}>{p0(bs.todayRevenue)}</Text>
            <Text style={[BC.sub, { color: bs.activeOrders > 0 ? C.info500 : C.gray500 }]}>{bs.activeOrders} active</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const BC = StyleSheet.create({
  card:            { width: 140, padding: SP._12, borderRadius: RADIUS.md, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, ...SHADOW.sm },
  cardSelected:    { borderWidth: 2, borderColor: C.brand500, backgroundColor: C.brand50 },
  name:            { flex: 1, fontSize: 12, fontWeight: "600", color: C.gray900, marginTop: 2, lineHeight: 16 },
  nameSelected:    { color: C.brand700 },
  revenue:         { fontSize: 17, fontWeight: "700", color: C.gray900, marginTop: SP._8 },
  revenueSelected: { color: C.brand600 },
  sub:             { fontSize: 11, marginTop: 2 },
});

// ─── Portrait quick actions (list on mobile, 2-col on tablet portrait) ────────

export interface QaItem {
  key: string; label: string; sub: string;
  icon: React.ReactNode; bg: string; badge: number;
  onPress: () => void;
}

export function PortraitQuickActions({ items, numCols, containerW, fs }: Readonly<{
  items: QaItem[]; numCols: number; containerW: number; fs: number;
}>) {
  if (numCols >= 2 && containerW > 0) {
    const tileW = (containerW - SP._10) / 2;
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP._10, marginBottom: SP._20 }}>
        {items.map((a) => (
          <TouchableOpacity key={a.key} style={[PQ.tile, { width: tileW }]} onPress={a.onPress} activeOpacity={0.8}>
            <View style={[PQ.tileIcon, { backgroundColor: a.bg }]}>{a.icon}</View>
            <Text style={[PQ.tileLabel, { fontSize: 13 * fs }]} numberOfLines={1}>{a.label}</Text>
            <Text style={[PQ.tileSub, { fontSize: 10 * fs }]} numberOfLines={1}>{a.sub}</Text>
            {a.badge > 0 && (
              <View style={PQ.tileBadge}><Text style={PQ.tileBadgeText}>{a.badge}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  return (
    <Card style={PQ.list} elevation="sm">
      {items.map((a, idx) => (
        <React.Fragment key={a.key}>
          {idx > 0 && <View style={{ height: 1, backgroundColor: C.gray100, marginLeft: 62 }} />}
          <TouchableOpacity style={PQ.row} onPress={a.onPress} activeOpacity={0.7}>
            <View style={[PQ.rowIcon, { backgroundColor: a.bg }]}>{a.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={[PQ.rowLabel, { fontSize: 14 * fs }]}>{a.label}</Text>
              <Text style={[PQ.rowSub, { fontSize: 11 * fs }]}>{a.sub}</Text>
            </View>
            {a.badge > 0 && (
              <View style={PQ.rowBadge}><Text style={PQ.rowBadgeText}>{a.badge}</Text></View>
            )}
            <I.Chevron />
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </Card>
  );
}

const PQ = StyleSheet.create({
  list:          { marginBottom: SP._20, padding: 0 },
  row:           { flexDirection: "row", alignItems: "center", gap: SP._12, paddingHorizontal: SP._14, paddingVertical: SP._14 },
  rowIcon:       { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel:      { fontSize: 14, fontWeight: "700", color: C.gray900 },
  rowSub:        { fontSize: 11, color: C.gray400, marginTop: 1 },
  rowBadge:      { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, marginRight: SP._4 },
  rowBadgeText:  { fontSize: 11, fontWeight: "800", color: C.white },
  tile:          { backgroundColor: C.white, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.gray100, paddingHorizontal: SP._14, paddingVertical: SP._12, alignItems: "flex-start", ...SHADOW.sm },
  tileIcon:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: SP._8 },
  tileLabel:     { fontSize: 13, fontWeight: "700", color: C.gray900, marginBottom: 2 },
  tileSub:       { fontSize: 10, color: C.gray400 },
  tileBadge:     { position: "absolute", top: SP._10, right: SP._10, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tileBadgeText: { fontSize: 10, fontWeight: "800", color: C.white },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

