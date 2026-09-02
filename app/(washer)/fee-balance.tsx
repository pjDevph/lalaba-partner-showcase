// app/(washer)/fee-balance.tsx
// Washer › Fee balance — the platform-fee prepaid wallet. Mirrors the Partner
// App design board "Top up your fee balance" frame: balance, the 10%-reserve
// explanation, top-up presets (₱500 / ₱1,000 / ₱2,000 / custom), pay-with, and
// the "This balance is for platform fees only — not an earnings wallet and
// cannot be withdrawn" disclaimer (verbatim from the design).
//
// Balance and top-up are REAL (BE walletSummary / initializeTopUp + topUpStatus,
// driven by runTopUp). The payment method is chosen on the gateway's hosted
// checkout page — this screen picks the amount and nothing else.

import React, { useState } from "react";
import { toUserMessage } from "../../src/utils/userError";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { BackLink } from "../../src/components/BackLink";
import { showAlert } from "../../src/lib/dialog";
import { useWasherStore } from "../../src/stores/washerStore";
import {
  useWalletStore,
  isActivated,
  MIN_TOPUP_CENTAVOS,
  ACTIVATION_MIN_CENTAVOS,
} from "../../src/stores/walletStore";
import { runTopUp, topUpOutcomeMessage } from "../../src/services/topUp";

const TEAL     = C.washer500;
const TEAL_D    = C.washer700;
const TEAL_BG   = C.washer100;
const TEAL_BORDER = C.washer300;
const MONO = "monospace";

// Top-up presets, in PESOS. Once the account is activated the washer tops up in
// whatever increment suits them (₱100 minimum). Before activation there is only
// one meaningful amount — the ₱1,000 onboarding top-up — so the smaller presets
// are not offered: paying ₱100 or ₱500 would take the money without activating
// the account, which reads as a broken purchase.
const PRESETS = [100, 500, 1000] as const;
const ACTIVATION_PRESET = ACTIVATION_MIN_CENTAVOS / 100; // ₱1,000
// No "Pay with" list here. GCash/Maya were static rows carrying a hardcoded
// phone number that belonged to nobody, and `onTopUp` ignored the selection
// entirely: `initializeTopUp` takes only { branchId, amountCentavos } and the
// payment channel is chosen on the gateway's own hosted checkout page. Showing
// a picker that decided nothing meant a washer could "select Maya" and then be
// handed a page offering every method.

export default function WasherFeeBalance() {
  const insets = useSafeAreaInsets();
  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt = useWalletStore((s) => s.activatedAt);
  const loadBalance = useWalletStore((s) => s.load);
  // The washer's wallet hangs off the Branch anchor created at registration.
  const branchId = useWasherStore((s) => s.profile?.branchId ?? null);
  const activated = isActivated(activatedAt);
  // Not-yet-activated accounts default to the ₱1,000 onboarding top-up.
  const [amount, setAmount] = useState<number>(activated ? 100 : ACTIVATION_PRESET);
  // First-time (not yet activated) accounts are offered only the ₱1,000
  // activation amount — see the PRESETS comment above.
  const presets = activated ? PRESETS : [ACTIVATION_PRESET];
  const [busy, setBusy] = useState(false);
  const [waitingForPayment, setWaitingForPayment] = useState(false);

  const balance = Math.round((balanceCentavos ?? 0) / 100);
  const ordersCovered = Math.floor(amount / 50);
  // Presets are pesos; the wire format is integer centavos.
  const amountCentavos = amount * 100;
  const canSubmit = branchId != null && !busy && amountCentavos >= MIN_TOPUP_CENTAVOS;

  const onTopUp = async () => {
    if (!canSubmit || !branchId) return;
    setBusy(true);
    setWaitingForPayment(false);
    try {
      const outcome = await runTopUp(branchId, amountCentavos, () =>
        setWaitingForPayment(true),
      );
      // Refresh regardless of outcome — a late webhook may already have landed.
      await loadBalance(branchId);
      if (outcome.kind === "succeeded") {
        showAlert("Top-up complete", `₱${amount.toLocaleString()} added to your fee balance.`);
      } else {
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
      setWaitingForPayment(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SP._10 }]}>
        <BackLink label="Wallet" fallback="/(washer)/wallet" />
        <Text style={styles.title}>Fee balance</Text>
        <Text style={styles.sub}>Prepaid platform fees</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current balance</Text>
          <Text style={styles.balanceValue}>₱{balance.toLocaleString()}</Text>
          <View style={styles.reserveNote}>
            <Ionicons name="information-circle-outline" size={15} color={TEAL_D} />
            <Text style={styles.reserveText}>
              Each accepted order reserves 10% of the commissionable amount. A ₱500 order reserves ₱50.
            </Text>
          </View>
        </View>

        {/* Top up amount */}
        <Text style={styles.sectionTitle}>Top up amount</Text>
        <View style={styles.presetRow}>
          {presets.map((p) => {
            const active = amount === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.preset, active ? styles.presetActive : styles.presetIdle]}
                onPress={() => setAmount(p)}
                activeOpacity={0.85}
              >
                <Text style={[styles.presetText, { color: active ? TEAL_D : C.gray700, fontFamily: MONO }]}>₱{p.toLocaleString()}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.minNote}>
          {activated
            ? "Custom amount · minimum ₱100"
            : "Activation requires the full ₱1,000 — you can top up any amount after that."}
        </Text>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ₱{amount.toLocaleString()} covers roughly {ordersCovered} orders at ₱50 each. This balance is for platform
            fees only — it is not an earnings wallet and cannot be withdrawn.
          </Text>
        </View>

        <View style={{ height: SP._16 }} />
      </ScrollView>

      <View style={[styles.actionCard, { paddingBottom: insets.bottom + SP._12 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
          activeOpacity={0.85}
          onPress={onTopUp}
          disabled={!canSubmit}
        >
          {busy ? (
            <View style={styles.btnBusyRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.primaryBtnText}>
                {waitingForPayment ? "Waiting for payment…" : "Starting top-up…"}
              </Text>
            </View>
          ) : (
            <Text style={styles.primaryBtnText}>Top up ₱{amount.toLocaleString()}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: 2 },
  title: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  sub: { fontSize: 13, color: C.gray500 },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, gap: SP._12 },

  balanceCard: { backgroundColor: C.white, borderWidth: 1, borderColor: TEAL_BORDER, borderRadius: 16, padding: SP._16, gap: SP._8 },
  balanceLabel: { fontSize: 12, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase" },
  balanceValue: { fontSize: 32, fontWeight: "800", color: TEAL_D, fontFamily: MONO },
  reserveNote: { flexDirection: "row", gap: SP._8, backgroundColor: TEAL_BG, borderRadius: RADIUS.md, padding: SP._12, marginTop: SP._4 },
  reserveText: { flex: 1, fontSize: 12.5, color: C.gray700, lineHeight: 18 },

  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.gray700, marginTop: SP._4 },
  presetRow: { flexDirection: "row", gap: SP._8 },
  preset: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  presetActive: { backgroundColor: TEAL_BG, borderWidth: 1.5, borderColor: TEAL },
  presetIdle: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  presetText: { fontSize: 15, fontWeight: "700" },
  minNote: { fontSize: 12, color: C.gray400 },

  listCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16 },
  divider: { height: 1, backgroundColor: C.gray100, marginLeft: 56 },

  disclaimer: { paddingHorizontal: SP._4 },
  disclaimerText: { fontSize: 12.5, color: C.gray500, lineHeight: 18 },

  actionCard: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200, paddingHorizontal: SP._16, paddingTop: SP._12, ...SHADOW.sm },
  primaryBtn: { height: 48, borderRadius: RADIUS.md, backgroundColor: TEAL, alignItems: "center", justifyContent: "center" },
  primaryBtnDisabled: { backgroundColor: C.gray300 },
  btnBusyRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: C.white },
});
