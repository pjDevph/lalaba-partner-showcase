// app/(washer)/reports.tsx
// Washer › Reports — how the business did over a date range.
//
// New screen. Washers previously had no reports at all: the merchant "Reports"
// tab is POS/branch revenue and does not apply, and `washerStats` is a live
// snapshot (slots used today, active orders) with no window and no money.
//
// MONEY HERE IS INFORMATIONAL, and the copy says so. Customers pay the washer
// DIRECTLY — Lalaba never holds the funds and there is no payout — so "Collected"
// is what she should have taken, not a balance owed to her. The only figure
// Lalaba actually moves is the platform fee, deducted from her prepaid fee
// wallet. Presenting these as earnings would imply a payout that does not exist.

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { gqlWasherReport, type WasherReport } from "../../src/services/graphql/washer";

const TEAL = C.washer500;
const TEAL_D = C.washer700;
const TEAL_BG = C.washer100;

type RangeKey = "7d" | "30d" | "90d";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "Last 7 days", days: 6 },
  { key: "30d", label: "Last 30 days", days: 29 },
  { key: "90d", label: "Last 90 days", days: 89 },
];

/**
 * PH-local YYYY-MM-DD. The backend windows on PH day boundaries, so deriving
 * these from the device's UTC date would shift the range by a day for anyone
 * running before 8am local.
 */
function phDayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function peso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function WasherReports() {
  const insets = useSafeAreaInsets();

  const [range, setRange] = useState<RangeKey>("7d");
  const [report, setReport] = useState<WasherReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (key: RangeKey, silent = false) => {
      if (!silent) setLoading(true);
      const days = RANGES.find((r) => r.key === key)?.days ?? 6;
      try {
        const next = await gqlWasherReport(phDayKey(-days), phDayKey(0));
        setReport(next);
        setLoadError(false);
      } catch {
        if (!silent) setLoadError(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void load(range, true);
    }, [load, range]),
  );

  const pickRange = (key: RangeKey) => {
    setRange(key);
    void load(key);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load(range, true);
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + SP._16, paddingBottom: insets.bottom + SP._32 },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />
      }
    >
      <BackLink label="Settings" fallback="/(washer)/settings" />

      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>How your laundry business is doing</Text>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => {
          const active = r.key === range;
          return (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeChip, active && styles.rangeChipActive]}
              onPress={() => pickRange(r.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={TEAL} />
        </View>
      ) : loadError || !report ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>Couldn&apos;t load your reports.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void load(range)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Orders</Text>
          <View style={styles.tileRow}>
            <Tile label="Completed" value={String(report.ordersCompleted)} />
            <Tile
              label="Cancelled"
              value={String(report.ordersCancelled)}
              tone={report.ordersCancelled > 0 ? "warn" : "plain"}
            />
          </View>
          <View style={styles.tileRow}>
            <Tile
              label="Laundry washed"
              value={`${(report.totalKg ?? 0).toFixed(1)} kg`}
            />
            <Tile
              label="Rating"
              value={
                report.avgRating == null
                  ? "—"
                  : `${report.avgRating.toFixed(1)} (${report.reviewCount})`
              }
            />
          </View>

          <Text style={styles.sectionTitle}>Money</Text>
          <View style={styles.card}>
            <Row label="Collected from customers" value={peso(report.grossCentavos)} />
            <View style={styles.divider} />
            <Row
              label="Lalaba platform fee"
              value={`− ${peso(report.platformFeeCentavos)}`}
              muted
            />
            <View style={styles.divider} />
            <Row label="You kept" value={peso(report.netCentavos)} strong />
          </View>

          {/* Naming what these numbers are NOT is the point: there is no payout
              to wait for, and the fee is already gone from the fee wallet. */}
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={14} color={TEAL_D} />
            <Text style={styles.noteText}>
              Customers pay you directly, so this is a record of what you
              collected — not a balance Lalaba owes you. The platform fee is
              taken from your fee wallet as orders complete.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Tile({
  label,
  value,
  tone = "plain",
}: Readonly<{ label: string; value: string; tone?: "plain" | "warn" }>) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, tone === "warn" && { color: C.warning700 }]}>
        {value}
      </Text>
    </View>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: Readonly<{ label: string; value: string; strong?: boolean; muted?: boolean }>) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && { color: C.gray500 }]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16 },

  title: { fontSize: 22, fontWeight: "700", color: C.gray900, marginTop: SP._8 },
  subtitle: { fontSize: 13, color: C.gray500, marginTop: 2 },

  rangeRow: { flexDirection: "row", gap: SP._8, marginTop: SP._16 },
  rangeChip: {
    paddingHorizontal: SP._12,
    height: 32,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  rangeChipActive: { backgroundColor: TEAL, borderColor: TEAL },
  rangeChipText: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  rangeChipTextActive: { color: C.white },

  centerBox: { alignItems: "center", justifyContent: "center", paddingVertical: SP._40, gap: SP._8 },
  emptyText: { fontSize: 14, color: C.gray600 },
  retryBtn: {
    paddingHorizontal: SP._16,
    paddingVertical: SP._8,
    borderRadius: RADIUS.md,
    backgroundColor: TEAL_BG,
  },
  retryText: { color: TEAL_D, fontWeight: "600" },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.gray500,
    marginTop: SP._20,
    marginBottom: SP._8,
    textTransform: "uppercase",
  },

  tileRow: { flexDirection: "row", gap: SP._12, marginBottom: SP._12 },
  tile: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: SP._14,
    ...SHADOW.sm,
  },
  tileLabel: { fontSize: 12, color: C.gray500 },
  tileValue: { fontSize: 20, fontWeight: "800", color: C.gray900, marginTop: 4 },

  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    ...SHADOW.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SP._14,
  },
  rowLabel: { fontSize: 14, color: C.gray700, flex: 1, paddingRight: SP._12 },
  rowValue: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  rowValueStrong: { fontSize: 17, fontWeight: "800", color: TEAL_D },
  divider: { height: 1, backgroundColor: C.gray100 },

  noteBox: {
    flexDirection: "row",
    gap: SP._8,
    backgroundColor: TEAL_BG,
    borderRadius: RADIUS.md,
    padding: SP._12,
    marginTop: SP._16,
  },
  noteText: { flex: 1, fontSize: 12, color: TEAL_D, lineHeight: 17 },
});
