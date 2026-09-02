// app/(washer)/wallet.tsx
// Washer › Wallet — the fee wallet. The prepaid balance that covers the 10%
// platform fee is the ONLY wallet: it's consumable, not withdrawable, and must
// stay at/above the ₱1,000 activation minimum for the account to be visible and
// accept bookings. There is no payout — customers pay the washer directly (cash
// or e-wallet); Lalaba only deducts the fee from this balance.
//
// Order counts used to sit at the bottom under "Work done". They belong on the
// dashboard and in Reports, not on the screen about money the washer never
// receives — this one is only about the balance that keeps her visible.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { useWasherStore } from "../../src/stores/washerStore";
import {
  useWalletStore,
  isNotVisible,
  isActivated,
  ACTIVATION_MIN_CENTAVOS,
  ACCEPT_MIN_CENTAVOS,
} from "../../src/stores/walletStore";
import { gqlWalletLedger, gqlTopUpHistory } from "../../src/services/graphql/wallet";
import {
  mergeWalletActivity,
  activityLabel,
  needsUserPayment,
  type WalletActivityItem,
} from "../../src/services/walletActivity";

const TEAL   = C.washer500;
const TEAL_D = C.washer700;
const TEAL_BG = C.washer100;

function pesoCentavos(c: number | null): string {
  if (c == null) return "₱—";
  return `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export default function WasherWallet() {
  const insets = useSafeAreaInsets();
  const branchId = useWasherStore((s) => s.profile?.branchId ?? null);

  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt = useWalletStore((s) => s.activatedAt);
  const loadBalance = useWalletStore((s) => s.load);

  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<WalletActivityItem[]>([]);

  // Ledger and attempts are fetched independently and merged: if one call
  // fails the other still renders, and a partial list beats an empty one on a
  // screen whose whole job is "where did my money go".
  const loadActivity = useCallback(async (id: string) => {
    const [ledger, intents] = await Promise.all([
      gqlWalletLedger(id).catch(() => null),
      gqlTopUpHistory(id).catch(() => null),
    ]);
    if (ledger == null && intents == null) return; // total failure — keep last
    setActivity(mergeWalletActivity(ledger ?? [], intents ?? []));
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      branchId ? loadBalance(branchId) : Promise.resolve(),
      branchId ? loadActivity(branchId) : Promise.resolve(),
    ]);
  }, [branchId, loadBalance, loadActivity]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };

  const notVisible = isNotVisible(balanceCentavos, activatedAt);
  const activated = isActivated(activatedAt);
  // How much to add: to the ₱1,000 activation minimum (onboarding) or up to the
  // ₱100 accept-a-booking minimum (depleted).
  const target = activated ? ACCEPT_MIN_CENTAVOS : ACTIVATION_MIN_CENTAVOS;
  const shortfall = balanceCentavos != null ? Math.max(0, target - balanceCentavos) : 0;

  // A wallet screen, not an audit log — the BE caps the attempt list at 50 and
  // this trims the merged view to a scannable page.
  const activityRows = useMemo(() => activity.slice(0, 20), [activity]);

  // Read once per render so every row ages against the same clock. A row that
  // crosses the settling window while the screen sits idle re-labels on the
  // next focus or pull-to-refresh, which is when its status would be re-read
  // anyway — no timer needed just to relabel a row nobody is looking at.
  const now = Date.now();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._16 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TEAL} />}
    >
      <Text style={styles.h1}>Wallet</Text>

      {/* Fee wallet — the balance that gates visibility. Red when off-market. */}
      <View style={[styles.hero, notVisible && { backgroundColor: C.error700 }]}>
        <Text style={styles.heroLabel}>Fee wallet balance</Text>
        <Text style={styles.heroValue}>{pesoCentavos(balanceCentavos)}</Text>

        {notVisible ? (
          <View style={styles.heroAlert}>
            <Ionicons name="alert-circle" size={15} color={C.white} />
            <Text style={styles.heroAlertText}>
              {activated
                ? `Below the ${pesoCentavos(ACCEPT_MIN_CENTAVOS)} minimum to accept bookings — your account isn't visible. Top up ${pesoCentavos(shortfall)} to go live.`
                : `Activate your account with a ${pesoCentavos(ACTIVATION_MIN_CENTAVOS)} top-up to become visible in the Marketplace. Add ${pesoCentavos(shortfall)} more.`}
            </Text>
          </View>
        ) : (
          <Text style={styles.heroOk}>Your account is active and visible in the Marketplace.</Text>
        )}

        <View style={styles.heroDivider} />
        <View style={styles.heroRow}>
          <Text style={styles.heroNote}>Covers the 10% platform fee. Consumable — can&apos;t be withdrawn. Minimum top-up ₱100.</Text>
          <TouchableOpacity style={styles.heroBtn} onPress={() => router.push("/(washer)/fee-balance")} activeOpacity={0.85}>
            <Text style={styles.heroBtnText}>Top up</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* How you get paid — no platform payout. */}
      <View style={styles.infoCard}>
        <View style={styles.infoIcon}><Ionicons name="cash-outline" size={18} color={TEAL_D} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>Customers pay you directly</Text>
          <Text style={styles.infoBody}>
            Payment is collected on delivery or via e-wallet outside the app. Lalaba has no payout — it only deducts the 10% platform fee from your fee wallet.
          </Text>
        </View>
      </View>

      {/* Activity — settled ledger movements merged with unsettled top-up
          attempts, so an abandoned or failed checkout is visible instead of
          silently missing. See src/services/walletActivity.ts. */}
      <Text style={styles.sectionTitle}>Recent activity</Text>
      <View style={styles.group}>
        {activityRows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={30} color={C.gray200} />
            <Text style={styles.emptyText}>No wallet activity yet.</Text>
          </View>
        ) : activityRows.map((item, i) => {
          const credit = item.kind === "TOP_UP";
          const attempt = item.kind === "TOP_UP_ATTEMPT";
          const pending = attempt && item.status === "PENDING";
          const tone = attempt
            ? (pending ? { bg: C.warning100, fg: C.warning700 } : { bg: C.error100, fg: C.error700 })
            : credit
              ? { bg: C.success100, fg: C.success700 }
              : { bg: C.gray100, fg: C.gray500 };
          // Only prompt once the row has stopped plausibly settling on its own —
          // "Tap to finish paying" under a "processing" label would contradict it.
          const resumable = needsUserPayment(item, now) && !!item.invoiceUrl;

          return (
            <View key={item.id}>
              {i > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.actRow}
                activeOpacity={resumable ? 0.6 : 1}
                disabled={!resumable}
                onPress={() => { if (item.invoiceUrl) void Linking.openURL(item.invoiceUrl); }}
              >
                <View style={[styles.actIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons
                    name={pending ? "time-outline" : attempt ? "close" : credit ? "arrow-down" : "arrow-up"}
                    size={15}
                    color={tone.fg}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.actTitle}>{activityLabel(item)}</Text>
                  <Text style={styles.actDate}>
                    {new Date(item.at).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {resumable ? " · Tap to finish paying" : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {/* An attempt moved no money, so it gets no sign and no
                      running balance — showing "+₱100" for a failed top-up
                      would read as a credit. */}
                  <Text style={[styles.actAmt, { color: attempt ? C.gray400 : credit ? C.success700 : C.gray800 }]}>
                    {attempt ? "" : credit ? "+" : "−"}{pesoCentavos(item.amountCentavos)}
                  </Text>
                  {item.balanceAfterCentavos != null && (
                    <Text style={styles.actBal}>{pesoCentavos(item.balanceAfterCentavos)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

            <View style={{ height: SP._24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },
  h1:     { fontSize: 24, fontWeight: "800", color: C.gray900, marginBottom: SP._16 },

  hero:        { backgroundColor: TEAL, borderRadius: 20, padding: SP._16, marginBottom: SP._16, ...SHADOW.sm },
  heroLabel:   { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  heroValue:   { fontSize: 34, fontWeight: "800", color: C.white, marginTop: 2 },
  heroOk:      { fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 4 },
  heroAlert:   { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: SP._8 },
  heroAlertText: { flex: 1, fontSize: 12.5, color: C.white, lineHeight: 17, fontWeight: "600" },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: SP._12 },
  heroRow:     { flexDirection: "row", alignItems: "center", gap: SP._12 },
  heroNote:    { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 16 },
  heroBtn:     { backgroundColor: C.white, borderRadius: RADIUS.full, paddingHorizontal: SP._16, paddingVertical: SP._8 },
  heroBtnText: { fontSize: 13, fontWeight: "800", color: TEAL_D },

  infoCard:  { flexDirection: "row", gap: SP._12, backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, padding: SP._14, marginBottom: SP._20 },
  infoIcon:  { width: 34, height: 34, borderRadius: RADIUS.full, backgroundColor: TEAL_BG, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 14.5, fontWeight: "700", color: C.gray900 },
  infoBody:  { fontSize: 12.5, color: C.gray600, marginTop: 2, lineHeight: 18 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: SP._8, marginLeft: SP._4 },
  group: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, overflow: "hidden", marginBottom: SP._20 },
  divider:  { height: 1, backgroundColor: C.gray100, marginLeft: SP._14 },

  emptyBox:  { padding: SP._20, alignItems: "center", gap: 4 },
  emptyText: { fontSize: 13, color: C.gray500 },
  actRow:   { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  actIcon:  { width: 32, height: 32, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  actTitle: { fontSize: 14.5, fontWeight: "700", color: C.gray900 },
  actDate:  { fontSize: 12, color: C.gray500, marginTop: 1 },
  actAmt:   { fontSize: 14.5, fontWeight: "800" },
  actBal:   { fontSize: 11, color: C.gray400, marginTop: 1 },
  linkRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: SP._14 },
  linkLabel:{ fontSize: 15, fontWeight: "600", color: C.gray900 },
});
