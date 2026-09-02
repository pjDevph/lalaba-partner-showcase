// app/(staff)/activity.tsx
// Activity / order history for staff. Browse this branch's POS orders with
// search (name / claim code), status filter, a date range (today / 7d / 30d),
// incremental "load more" paging, and a tap-to-open order detail sheet.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { gqlMyOrders } from "../../src/services/graphql/orders";
import { useAuthStore } from "../../src/stores/authStore";
import { useNotificationStore } from "../../src/stores/notificationStore";

function beStatusToFE(s: string): import("../../src/types/pos.types").POSStatus {
  if (s === "in_progress") return "PROCESSING";
  if (s === "ready")       return "READY_FOR_PICKUP";
  if (s === "claimed")     return "CLAIMED";
  return "CREATED";
}

function toTs(iso?: string): { seconds: number; nanoseconds: number } {
  const ms = iso ? new Date(iso).getTime() : Date.now();
  return { seconds: Math.floor(ms / 1000), nanoseconds: 0 };
}
import { OrderDetailSheet } from "../../src/components/pos/OrderDetailSheet";
import { HeroHeader } from "../../src/components/ui";
import {
  POS_STATUS_LABELS,
  POS_STATUS_COLORS,
  POS_STATUS_BG,
  POS_STATUS_TEXT,
} from "../../src/types/pos.types";
import type { POSOrder, POSStatus } from "../../src/types/pos.types";
import { C, RADIUS, SP } from "../../src/theme/tokens";

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "today", label: "Today", days: null },
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
];

const STATUS_FILTERS: { key: "ALL" | POSStatus; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "CREATED", label: "New" },
  { key: "PROCESSING", label: "Processing" },
  { key: "READY_FOR_PICKUP", label: "Ready" },
  { key: "CLAIMED", label: "Claimed" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function tsToDate(t?: { seconds: number }): Date | null {
  return t?.seconds ? new Date(t.seconds * 1000) : null;
}

function formatMoney(v?: number): string {
  return typeof v === "number" ? `₱${v.toFixed(2)}` : "—";
}

function formatTime(d: Date | null): string {
  return d ? d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "";
}

function formatDateTime(d: Date | null): string {
  if (!d) return "";
  return `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} · ${formatTime(d)}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const { merchantId, activeBranchId } = useAuthStore((s) => ({
    merchantId: s.merchantId,
    activeBranchId: s.activeBranchId,
  }));

  const [orders, setOrders] = useState<POSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeKey, setRangeKey] = useState("today");
  const [statusFilter, setStatusFilter] = useState<"ALL" | POSStatus>("ALL");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<POSOrder | null>(null);

  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];

  const fetchOrders = useCallback(async () => {
    if (!merchantId) { setLoading(false); return; }
    try {
      const gqlOrders = await gqlMyOrders({
        branchId: activeBranchId ?? undefined,
        days: range.days ?? 1,
        limit: 200,
      });
      setOrders(gqlOrders.map((o) => ({
        id: o._id,
        merchantId: o.uid,
        branchId: o.branchId,
        staffId: "",
        orderSource: "POS" as const,
        status: beStatusToFE(o.laundryStatus),
        walkinCustomer: { name: o.customerName },
        items: (o.items ?? []).map((i) => ({
          serviceId: i.serviceId ?? "",
          serviceName: i.serviceName ?? "",
          weightKg: i.quantity,
          unitPrice: i.unitPrice,
          lineTotal: i.subtotal,
        })),
        subtotal: o.subtotal,
        discountAmount: o.discountValue ?? 0,
        discountCode: undefined,
        totalAmount: o.totalAmount,
        paymentMethod: "CASH" as any,
        amountReceived: 0,
        changeGiven: 0,
        claimCode: o.claimCode,
        notes: o.notes,
        estimatedReadyAt: o.estimatedReadyAt,
        createdAt: toTs(o.createdAt),
        updatedAt: toTs(o.updatedAt),
        claimedAt: o.claimedAt ? toTs(o.claimedAt) : undefined,
      })));
    } catch (err) {
      console.warn("Activity fetch:", err);
      setOrders([]);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load activity." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [merchantId, activeBranchId, range.days]);

  // Fetch only when the screen is entered/focused (or the range changes while
  // focused — fetchOrders' identity changes with range.days, re-running this).
  // useFocusEffect already covers the first focus on mount, so no separate mount
  // effect is needed; adding one would double-call myOrders on every visit.
  useFocusEffect(useCallback(() => { setLoading(true); void fetchOrders(); }, [fetchOrders]));

  // Reset paging whenever the result set's shape changes.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [rangeKey, statusFilter, search]);

  const onRefresh = useCallback(() => { setRefreshing(true); void fetchOrders(); }, [fetchOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => statusFilter === "ALL" || o.status === statusFilter)
      .filter((o) => {
        if (!q) return true;
        const name = o.walkinCustomer?.name?.toLowerCase() ?? "";
        const code = o.claimCode?.toLowerCase() ?? "";
        return name.includes(q) || code.includes(q);
      })
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
  }, [orders, statusFilter, search]);

  const paged = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const loadMore = () => {
    if (hasMore) setVisibleCount((c) => c + PAGE_SIZE);
  };

  const showDate = range.days != null; // multi-day range → show date with time

  let listBody: React.ReactNode;
  if (loading && orders.length === 0) {
    listBody = (
      <View style={s.center}><ActivityIndicator color={C.brand500} /></View>
    );
  } else if (filtered.length === 0) {
    listBody = (
      <View style={s.center}>
        <Text style={s.emptyTitle}>No orders found</Text>
        <Text style={s.emptySub}>
          {search || statusFilter !== "ALL"
            ? "Try clearing the search or filter."
            : "Orders created at the POS will appear here."}
        </Text>
      </View>
    );
  } else {
    listBody = (
      <FlatList
        data={paged}
        keyExtractor={(o) => o.id}
        style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <OrderRow order={item} showDate={showDate} onPress={() => setSelected(item)} />
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} />}
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={s.loadMore} onPress={loadMore} activeOpacity={0.7}>
              <Text style={s.loadMoreText}>Load more ({filtered.length - visibleCount} left)</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.endText}>{filtered.length} order{filtered.length !== 1 ? "s" : ""}</Text>
          )
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <SafeAreaView style={[s.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <HeroHeader
        compact
        noWave
        title="Activity"
        subtitle="Order history"
        onBack={() => router.replace("/(staff)/profile")}
      />

      {/* Search */}
      <View style={s.searchWrap}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", paddingHorizontal: SP._16 }}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or claim code…"
            placeholderTextColor={C.gray400}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} style={s.searchClear}>
              <Text style={s.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Date range */}
      <View style={s.rangeRow}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", flexDirection: "row", gap: SP._8 }}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[s.rangeChip, rangeKey === r.key && s.rangeChipActive]}
              onPress={() => setRangeKey(r.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.rangeChipText, rangeKey === r.key && s.rangeChipTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Status filter */}
      <View style={s.filterBar}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  style={[s.filterChip, active && s.filterChipActive]}
                  onPress={() => setStatusFilter(f.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      <View style={{ flex: 1, backgroundColor: C.gray100 }}>{listBody}</View>

      <OrderDetailSheet order={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ─── Order row ───────────────────────────────────────────────────────────────

function OrderRow({
  order,
  showDate,
  onPress,
}: Readonly<{ order: POSOrder; showDate: boolean; onPress: () => void }>) {
  const label = POS_STATUS_LABELS[order.status] ?? order.status;
  const fg = (POS_STATUS_TEXT as Record<string, string>)[order.status] ?? C.gray600;
  const bg = (POS_STATUS_BG as Record<string, string>)[order.status] ?? C.gray100;
  const stripe = (POS_STATUS_COLORS as Record<string, string>)[order.status] ?? C.gray400;
  const name = order.walkinCustomer?.name ?? "Walk-in";
  const created = tsToDate(order.createdAt);
  const itemCount = order.items?.length ?? 0;

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.rowStripe, { backgroundColor: stripe }]} />
      <View style={s.rowLeft}>
        <Text style={s.rowName} numberOfLines={1}>{name}</Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {showDate ? formatDateTime(created) : formatTime(created)}
          {itemCount > 0 ? ` · ${itemCount} item${itemCount !== 1 ? "s" : ""}` : ""}
          {order.claimCode ? ` · ${order.claimCode}` : ""}
        </Text>
      </View>
      <View style={s.rowRight}>
        <Text style={s.rowTotal}>{formatMoney(order.totalAmount)}</Text>
        <View style={[s.badge, { backgroundColor: bg }]}>
          <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.gray100 },

  todoStrip: { flexDirection: "row", alignItems: "center", gap: SP._12, backgroundColor: C.warning100, borderRadius: RADIUS.md, padding: SP._12, borderWidth: 1, borderColor: C.warning300 },
  todoBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.warning500, alignItems: "center", justifyContent: "center" },
  todoBadgeText: { fontSize: 14, fontWeight: "800", color: C.white },
  todoTitle: { fontSize: 14, fontWeight: "700", color: C.warning700 },
  todoSub: { fontSize: 12, color: C.warning700, opacity: 0.85, marginTop: 1 },
  todoArrow: { fontSize: 18, fontWeight: "800", color: C.warning700 },

  searchWrap: { backgroundColor: C.white, paddingBottom: SP._10, justifyContent: "center" },
  searchInput: {
    backgroundColor: C.gray100, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10,
    fontSize: 14, color: C.gray900, paddingRight: 36,
  },
  searchClear: { position: "absolute", right: SP._24, top: 0, bottom: SP._10, justifyContent: "center" },
  searchClearText: { fontSize: 14, color: C.gray400, fontWeight: "700" },

  rangeRow: { backgroundColor: C.white, paddingHorizontal: SP._16, paddingBottom: SP._10 },
  rangeChip: { flex: 1, paddingVertical: SP._8, borderRadius: RADIUS.md, alignItems: "center", backgroundColor: C.gray100, borderWidth: 1.5, borderColor: "transparent" },
  rangeChipActive: { backgroundColor: C.brand100, borderColor: C.brand500 },
  rangeChipText: { fontSize: 13, fontWeight: "600", color: C.gray600 },
  rangeChipTextActive: { color: C.brand700 },

  filterBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  filterContent: { paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._8 },
  filterChip: { paddingHorizontal: SP._14, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray100 },
  filterChipActive: { backgroundColor: C.gray900 },
  filterChipText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  filterChipTextActive: { color: C.white },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray700, textAlign: "center", marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.gray400, textAlign: "center" },

  list: { padding: SP._16, gap: SP._8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.white, borderRadius: 12, paddingHorizontal: SP._16, paddingVertical: SP._12, overflow: "hidden" },
  rowStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  rowLeft: { gap: 3, flex: 1, paddingRight: SP._8 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  rowName: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  rowMeta: { fontSize: 12, color: C.gray400 },
  rowTotal: { fontSize: 15, fontWeight: "800", color: C.gray900 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  loadMore: { alignItems: "center", paddingVertical: SP._14 },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: C.brand600 },
  endText: { textAlign: "center", fontSize: 12, color: C.gray400, paddingVertical: SP._14 },
});
