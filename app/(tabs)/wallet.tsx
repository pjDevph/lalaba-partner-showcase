// app/(tabs)/wallet.tsx
// Merchant › Wallet — the fee wallet: a prepaid balance that covers the 10%
// platform fee. It's consumable (not withdrawable) and must stay at/above the
// ₱1,000 activation minimum for the branch to be visible + accept bookings.
// Balance, activation, ledger, and top-up are all REAL (BE walletSummary /
// walletLedger / initializeTopUp). For a multi-branch owner, the branch selector
// switches which branch's wallet is shown.

import React, { useCallback, useMemo, useState } from "react";
import { toUserMessage } from "../../src/utils/userError";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { showAlert } from "../../src/lib/dialog";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import {
  useWalletStore, isNotVisible, isActivated,
  ACTIVATION_MIN_CENTAVOS, ACCEPT_MIN_CENTAVOS,
} from "../../src/stores/walletStore";
import { gqlWalletLedger, type WalletLedgerEntry } from "../../src/services/graphql/wallet";
import { runTopUp, topUpOutcomeMessage } from "../../src/services/topUp";
import { BranchSelectorBar } from "../../src/components/BranchSelectorBar";

const ACCENT   = C.brand500;
const ACCENT_D = C.brand700;
const ACCENT_BG = C.brand50;
// Centavos. Offered only once the branch is activated — before that the modal
// shows just ACTIVATION_MIN_CENTAVOS, since a smaller top-up would take money
// without activating the branch.
const PRESETS = [10_000, 50_000, 100_000]; // ₱100 / ₱500 / ₱1,000 (centavos)

function pesoCentavos(c: number | null): string {
  if (c == null) return "₱—";
  return `₱${(c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Resolve the branch this tab is scoped to (owner selection → device/active pin → first).
function useResolvedBranchId(): string | null {
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const branches = useMerchantStore((s) => s.branches);
  const deviceBranchId = useAuthStore((s) => s.deviceBranchId);
  const activeBranchId = useAuthStore((s) => s.activeBranchId);
  return selectedBranchId ?? deviceBranchId ?? activeBranchId ?? branches[0]?.id ?? null;
}

export default function MerchantWallet() {
  const insets = useSafeAreaInsets();
  const branchId = useResolvedBranchId();
  // Every string on this tab names the branch it is about. The wallet is
  // per-branch and topping up the wrong one costs real money, so "this branch"
  // is never good enough for an owner with more than one.
  const branches = useMerchantStore((s) => s.branches);
  const branchLabel =
    branches.find((b) => b.id === branchId)?.name ?? "this branch";

  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt     = useWalletStore((s) => s.activatedAt);
  const loadBalance     = useWalletStore((s) => s.load);

  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [amount, setAmount] = useState<number>(ACTIVATION_MIN_CENTAVOS);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!branchId) return;
    await Promise.all([
      loadBalance(branchId),
      gqlWalletLedger(branchId).then(setLedger).catch(() => { /* keep last */ }),
    ]);
  }, [branchId, loadBalance]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };

  const notVisible = isNotVisible(balanceCentavos, activatedAt);
  const activated  = isActivated(activatedAt);
  const target = activated ? ACCEPT_MIN_CENTAVOS : ACTIVATION_MIN_CENTAVOS;
  const shortfall = balanceCentavos != null ? Math.max(0, target - balanceCentavos) : 0;

  const openTopUp = () => {
    setAmount(activated ? ACCEPT_MIN_CENTAVOS : ACTIVATION_MIN_CENTAVOS);
    setTopUpOpen(true);
  };

  const confirmTopUp = async () => {
    if (!branchId || busy) return;
    setBusy(true);
    try {
      // The client never credits the wallet: runTopUp opens an intent, sends the
      // user to the gateway's checkout page, and polls until the verified
      // webhook settles it. The local dev gateway settles inside the mutation.
      const outcome = await runTopUp(branchId, amount);
      setTopUpOpen(false);
      // Refresh regardless of outcome — a late webhook may already have landed.
      await refresh();
      if (outcome.kind !== "succeeded") {
        showAlert(
          outcome.kind === "failed" ? "Top-up failed" : "Waiting for payment",
          topUpOutcomeMessage(outcome),
        );
      }
    } catch (err: unknown) {
      const msg = toUserMessage(err, "Top-up failed. Please try again.");
      showAlert("Top-up failed", msg);
    } finally {
      setBusy(false);
    }
  };

  const ledgerRows = useMemo(() => ledger.slice(0, 20), [ledger]);

  return (
    <View style={styles.root}>
      {/* Wallet was the only tab with no header at all — just a heading that
          scrolled away. Same white bar as Home and Orders so the five tabs
          read as one app. */}
      <View style={[styles.header, { paddingTop: insets.top + SP._10 }]}>
        <Text style={styles.h1}>Wallet</Text>
        <BranchSelectorBarInline />
      </View>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: SP._16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >

        {/* Fee wallet balance — red when the branch is off-market. */}
        <View style={[styles.hero, notVisible && { backgroundColor: C.error700 }]}>
          <Text style={styles.heroLabel}>Fee wallet balance</Text>
          <Text style={styles.heroValue}>{pesoCentavos(balanceCentavos)}</Text>
          {notVisible ? (
            <View style={styles.heroAlert}>
              <Ionicons name="alert-circle" size={15} color={C.white} />
              <Text style={styles.heroAlertText}>
                {activated
                  ? `Below the ${pesoCentavos(ACCEPT_MIN_CENTAVOS)} minimum to accept bookings — ${branchLabel} isn't visible. Top up ${pesoCentavos(shortfall)} to go live.`
                  : `Activate ${branchLabel} with a ${pesoCentavos(ACTIVATION_MIN_CENTAVOS)} top-up to become visible in the Marketplace. Add ${pesoCentavos(shortfall)} more.`}
              </Text>
            </View>
          ) : (
            <Text style={styles.heroOk}>{`${branchLabel} is active and visible in the Marketplace.`}</Text>
          )}
          <View style={styles.heroDivider} />
          <View style={styles.heroRow}>
            <Text style={styles.heroNote}>Covers the 10% platform fee. Consumable — can&apos;t be withdrawn. Minimum top-up ₱100.</Text>
            <TouchableOpacity style={styles.heroBtn} onPress={openTopUp} activeOpacity={0.85}>
              <Text style={styles.heroBtnText}>Top up</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* How you get paid — no platform payout. */}
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}><Ionicons name="cash-outline" size={18} color={ACCENT_D} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Customers pay you directly</Text>
            <Text style={styles.infoBody}>
              Payment is collected on delivery or via e-wallet outside the app. Lalaba has no payout — it only deducts the 10% platform fee from this wallet.
            </Text>
          </View>
        </View>

        {/* Ledger — real wallet movements */}
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <View style={styles.group}>
          {ledgerRows.length === 0 ? (
            <View style={{ padding: SP._20, alignItems: "center", gap: 4 }}>
              <Ionicons name="receipt-outline" size={30} color={C.gray200} />
              <Text style={{ fontSize: 13, color: C.gray500 }}>No wallet activity yet.</Text>
            </View>
          ) : ledgerRows.map((e, i) => {
            const credit = e.type === "TOP_UP";
            return (
              <View key={e._id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.ledgerRow}>
                  <View style={[styles.ledgerIcon, { backgroundColor: credit ? C.success100 : C.gray100 }]}>
                    <Ionicons name={credit ? "arrow-down" : "arrow-up"} size={15} color={credit ? C.success700 : C.gray500} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.ledgerTitle}>{credit ? "Top up" : "Platform fee"}</Text>
                    <Text style={styles.ledgerDate}>{new Date(e.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.ledgerAmt, { color: credit ? C.success700 : C.gray800 }]}>
                      {credit ? "+" : "−"}{pesoCentavos(Math.abs(e.amountCentavos))}
                    </Text>
                    <Text style={styles.ledgerBal}>{pesoCentavos(e.balanceAfterCentavos)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={{ height: SP._24 }} />
      </ScrollView>

      {/* Top-up modal — real credit via initializeTopUp */}
      <Modal visible={topUpOpen} transparent animationType="fade" onRequestClose={() => setTopUpOpen(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={styles.modalTitle}>Top up fee wallet</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setTopUpOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color={C.gray500} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>{`Choose an amount to add to ${branchLabel}'s wallet.`}</Text>
            <View style={styles.presetRow}>
              {(activated ? PRESETS : [ACTIVATION_MIN_CENTAVOS]).map((p) => {
                const active = amount === p;
                return (
                  <TouchableOpacity key={p} onPress={() => setAmount(p)} activeOpacity={0.8}
                    style={[styles.preset, active && { borderColor: ACCENT, backgroundColor: ACCENT_BG }]}>
                    <Text style={[styles.presetText, active && { color: ACCENT_D }]}>{pesoCentavos(p)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalNote}>
              Platform fees only — this balance can&apos;t be withdrawn. A ₱1,000 balance activates the branch.
            </Text>
            <TouchableOpacity style={[styles.modalBtn, busy && { opacity: 0.6 }]} onPress={confirmTopUp} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={C.white} /> : <Text style={styles.modalBtnText}>Top up {pesoCentavos(amount)}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// The selector renders nothing unless the owner has >1 branch. It carries its
// own horizontal padding, so cancel the header's to avoid double-indenting it.
function BranchSelectorBarInline() {
  return (
    <View style={{ marginHorizontal: -SP._16 }}>
      <BranchSelectorBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
    paddingHorizontal: SP._16,
    paddingBottom: SP._12,
  },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },
  h1:     { fontSize: 24, fontWeight: "800", color: C.gray900 },

  hero:        { backgroundColor: ACCENT, borderRadius: 20, padding: SP._16, marginBottom: SP._16, ...SHADOW.sm },
  heroLabel:   { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  heroValue:   { fontSize: 34, fontWeight: "800", color: C.white, marginTop: 2 },
  heroOk:      { fontSize: 12.5, color: "rgba(255,255,255,0.9)", marginTop: 4 },
  heroAlert:   { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: SP._8 },
  heroAlertText: { flex: 1, fontSize: 12.5, color: C.white, lineHeight: 17, fontWeight: "600" },
  heroDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: SP._12 },
  heroRow:     { flexDirection: "row", alignItems: "center", gap: SP._12 },
  heroNote:    { flex: 1, fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 16 },
  heroBtn:     { backgroundColor: C.white, borderRadius: RADIUS.full, paddingHorizontal: SP._16, paddingVertical: SP._8 },
  heroBtnText: { fontSize: 13, fontWeight: "800", color: ACCENT_D },

  infoCard:  { flexDirection: "row", gap: SP._12, backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, padding: SP._14, marginBottom: SP._20 },
  infoIcon:  { width: 34, height: 34, borderRadius: RADIUS.full, backgroundColor: ACCENT_BG, alignItems: "center", justifyContent: "center" },
  infoTitle: { fontSize: 14.5, fontWeight: "700", color: C.gray900 },
  infoBody:  { fontSize: 12.5, color: C.gray600, marginTop: 2, lineHeight: 18 },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: SP._8, marginLeft: SP._4 },
  group: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, overflow: "hidden", marginBottom: SP._20 },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  ledgerIcon: { width: 32, height: 32, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  ledgerTitle: { fontSize: 14.5, fontWeight: "700", color: C.gray900 },
  ledgerDate: { fontSize: 12, color: C.gray500, marginTop: 1 },
  ledgerAmt: { fontSize: 14.5, fontWeight: "800" },
  ledgerBal: { fontSize: 11, color: C.gray400, marginTop: 1 },
  divider:  { height: 1, backgroundColor: C.gray100, marginLeft: SP._14 },

  modalScrim: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  modalCard: { backgroundColor: C.white, borderRadius: 20, padding: SP._20, width: "100%", maxWidth: 380, gap: SP._12 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  modalSub: { fontSize: 13, color: C.gray600 },
  presetRow: { flexDirection: "row", gap: SP._8 },
  preset: { flex: 1, alignItems: "center", paddingVertical: SP._12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  presetText: { fontSize: 15, fontWeight: "800", color: C.gray800 },
  modalNote: { fontSize: 12, color: C.gray500, lineHeight: 17 },
  modalBtn: { height: 50, borderRadius: RADIUS.md, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", marginTop: SP._4 },
  modalBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
