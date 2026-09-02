// app/(courier)/history.tsx
// Courier History — the tasks I've already closed out, newest first, with a
// running summary.
//
// Reads the COMPLETED slice of myAssignedOnlineOrders, and deliberately does
// NOT poll: finished work doesn't change, and this is the heavy half of the
// feed (up to a week of full order documents). It loads on focus and on
// pull-to-refresh. The live board and the map poll the ACTIVE slice instead.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/authStore";
import { useOnlineOrdersStore } from "../../src/stores/onlineOrdersStore";
import { pesos } from "../../src/services/graphql/onlineOrders";
import {
  deriveTasks,
  legCollectedCentavos,
  legCompletedAt,
  legWeightKg,
  orderRef,
  LEG_LABEL,
  type CourierLegTask,
} from "../../src/utils/courierTasks";
import { CourierHeader } from "../../src/components/CourierHeader";

const INDIGO = C.courier500;

export default function CourierHistory() {
  const uid = useAuthStore((s) => s.user?.uid ?? "");
  const myCompletedLegs = useOnlineOrdersStore((s) => s.myCompletedLegs);
  const isLoadingCompletedLegs = useOnlineOrdersStore((s) => s.isLoadingCompletedLegs);
  const completedLegsLoaded = useOnlineOrdersStore((s) => s.completedLegsLoaded);
  const fetchCompletedLegs = useOnlineOrdersStore((s) => s.fetchCompletedLegs);

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => { void fetchCompletedLegs(uid); }, [fetchCompletedLegs, uid]),
  );

  // Newest first — completedAt is an ISO string, so lexical compare is chronological.
  const completed = useMemo(
    () =>
      deriveTasks(myCompletedLegs, uid)
        .filter((t) => t.bucket === "COMPLETED")
        .sort((a, b) => (legCompletedAt(b) ?? "").localeCompare(legCompletedAt(a) ?? "")),
    [myCompletedLegs, uid],
  );

  const kgMoved   = completed.reduce((s, t) => s + (legWeightKg(t.order) ?? 0), 0);
  const collected = completed.reduce((s, t) => s + legCollectedCentavos(t), 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchCompletedLegs(uid);
    setRefreshing(false);
  };

  // Only the very first load shows the spinner — `completedLegsLoaded` stays
  // true afterwards, so a focus refetch doesn't blank a populated list.
  const loadingFirstPage = isLoadingCompletedLegs && !completedLegsLoaded;

  return (
    <View style={styles.root}>
      <CourierHeader title="History" subtitle="Your completed pickups and returns" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}
        showsVerticalScrollIndicator={false}
      >

      {/* Running summary */}
      <View style={styles.summary}>
        <SummaryStat value={String(completed.length)} label="Tasks done" />
        <View style={styles.summaryDivider} />
        <SummaryStat value={formatKg(kgMoved)} label="Kg moved" />
        <View style={styles.summaryDivider} />
        <SummaryStat value={pesos(collected)} label="Collected" />
      </View>

      {loadingFirstPage ? (
        <View style={styles.emptyCard}>
          <ActivityIndicator color={INDIGO} />
          <Text style={styles.emptySub}>Loading your completed tasks…</Text>
        </View>
      ) : completed.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={44} color={C.gray200} />
          <Text style={styles.emptyTitle}>No completed tasks yet</Text>
          <Text style={styles.emptySub}>Finished pickups and returns will show here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {completed.map((t, i) => (
            <React.Fragment key={`${t.order._id}-${t.leg}`}>
              {i > 0 && <View style={styles.divider} />}
              <HistoryRow t={t} />
            </React.Fragment>
          ))}
        </View>
      )}

        <View style={{ height: SP._24 }} />
      </ScrollView>
    </View>
  );
}

function HistoryRow({ t }: Readonly<{ t: CourierLegTask }>) {
  const o = t.order;
  const kg = legWeightKg(o);
  const cash = legCollectedCentavos(t);
  // areaLabel, not address.barangayName — the BE redacts the exact address once
  // the leg completes, and every row on this screen is a completed leg.
  const sub = [o.customer.displayName, o.customer.areaLabel, completedLabel(legCompletedAt(t))]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-done" size={16} color={C.success700} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{orderRef(o)} · {LEG_LABEL[t.leg]}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowWeight}>{kg != null ? `${formatKg(kg)} kg` : "—"}</Text>
        {cash > 0 && <Text style={styles.rowCash}>{pesos(cash)}</Text>}
      </View>
    </View>
  );
}

function SummaryStat({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// One decimal, but only when it carries information: 12 kg, not 12.0 kg.
function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

function completedLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} ${time}`;
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: {
    maxWidth: 880,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: SP._16,
    // Matches the dashboard. Without it the first card butts
    // straight against the header's bottom border.
    paddingTop: SP._16,
    paddingBottom: SP._40,
  },

  summary: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, padding: SP._16, marginBottom: SP._16 },
  summaryStat: { flex: 1, alignItems: "center" },
  summaryValue:{ fontSize: 20, fontWeight: "800", color: INDIGO },
  summaryLabel:{ fontSize: 11, color: C.gray500, marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: C.gray100 },

  list:   { backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, overflow: "hidden" },
  divider:{ height: 1, backgroundColor: C.gray100, marginLeft: 56 },
  row:    { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  iconWrap: { width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: C.success100, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  rowSub:   { fontSize: 12, color: C.gray500, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowWeight:{ fontSize: 12, fontWeight: "600", color: C.gray600 },
  rowCash:  { fontSize: 12, fontWeight: "700", color: C.success700, marginTop: 2 },

  emptyCard: { backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, padding: SP._32, alignItems: "center", gap: SP._8 },
  emptyTitle:{ fontSize: 16, fontWeight: "700", color: C.gray700 },
  emptySub:  { fontSize: 13, color: C.gray500, textAlign: "center" },
});
