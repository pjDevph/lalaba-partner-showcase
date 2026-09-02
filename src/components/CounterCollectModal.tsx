// src/components/CounterCollectModal.tsx
// The counter's two collection points, which had no UI at all until deferred
// settlement made them reachable states rather than dead backend endpoints:
//
//   RECEIVE  — a CUSTOMER_DROPOFF order arriving at the counter. Staff weighs
//              or counts it and either collects or, if the shop offers Pay
//              Later, records that the customer settles at handover. The
//              counter twin of the courier's doorstep weigh-and-collect.
//   HANDOVER — a CUSTOMER_SELF_PICKUP order going back over the counter. Any
//              outstanding balance is settled first; the server refuses the
//              handover otherwise, exactly as it does on the courier's return.
//
// One modal rather than two routes because ProviderOrders is shared by the
// merchant `(tabs)` and washer `(washer)` stacks — a pushed route would have to
// exist twice, once per stack, and drift.
//
// A provider self-assigned as their own pickup/return courier does NOT use
// this modal — they're routed into the real courier task-detail screen
// (src/screens/orderLeg/TaskDetailScreen.tsx, re-exported per role) so the
// weigh/payment/proof step is the identical UI a real courier uses, not a
// second copy of the same form living here.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP } from "../theme/tokens";
import { notify } from "../stores/notificationStore";
import { useOnlineOrdersStore } from "../stores/onlineOrdersStore";
import {
  pesos,
  type CollectionInput,
  type GqlOnlineOrder,
} from "../services/graphql/onlineOrders";
import { toUserMessage } from "../utils/userError";
import HandoverProofCapture, { type ProofShot } from "./HandoverProofCapture";

const MONO = "monospace";

export type CounterMode = "RECEIVE" | "HANDOVER";

/** Which quantity a service line is billed by — mirrors the courier screen. */
function lineUnit(pricingType: string): "weight" | "piece" | "load" {
  if (pricingType === "PER_PIECE") return "piece";
  if (pricingType === "PER_LOAD" || pricingType === "PER_LOAD_WITH_CAPACITY") return "load";
  return "weight";
}

export default function CounterCollectModal({
  order,
  mode,
  accent,
  onClose,
}: Readonly<{
  order: GqlOnlineOrder | null;
  mode: CounterMode;
  accent: { base: string; bg: string; dark: string };
  onClose: () => void;
}>) {
  const { receiveAtCounter, verifySelfPickup } = useOnlineOrdersStore();

  const [lineQty, setLineQty] = useState<Record<string, string>>({});
  const [payMethod, setPayMethod] = useState<"CASH" | "EWALLET_OUTSIDE_APP">("CASH");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");
  const [defer, setDefer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proofShots, setProofShots] = useState<ProofShot[]>([]);
  const insets = useSafeAreaInsets();

  const isReceive = mode === "RECEIVE";
  // Server-derived, never recomputed here — it is what the customer owes.
  const amountDue = order?.amountDueCentavos ?? 0;
  const canDefer = isReceive && order?.provider.allowsPayAtHandover === true;
  // On handover the balance is already known; on receipt it doesn't exist yet
  // because nothing has been weighed.
  const mustCollect = isReceive ? !defer : amountDue > 0;

  // One measured quantity per line, read from each line's own pricing basis.
  const lineActuals = useMemo(() => {
    if (!order || !isReceive) return [];
    return order.serviceLines.map((l) => {
      const unit = lineUnit(l.pricingType);
      if (unit === "load") return { serviceRefId: l.serviceRefId };
      const n = parseFloat(lineQty[l.serviceRefId] ?? "");
      if (!(n > 0)) return null;
      return unit === "piece"
        ? { serviceRefId: l.serviceRefId, actualPieceCount: Math.round(n) }
        : { serviceRefId: l.serviceRefId, actualWeightKg: n };
    });
  }, [order, isReceive, lineQty]);

  const measured = !isReceive || lineActuals.every((la) => la !== null);
  const eWalletNeedsRef =
    mustCollect && payMethod === "EWALLET_OUTSIDE_APP" && reference.trim().length === 0;
  const canSubmit = measured && !eWalletNeedsRef && !busy;

  const reset = () => {
    setLineQty({});
    setPayMethod("CASH");
    setReference("");
    setTendered("");
    setDefer(false);
    setProofShots([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    if (!order || !canSubmit) return;
    setBusy(true);
    try {
      const tenderedPesos = Number.parseFloat(tendered);
      const payment: CollectionInput = mustCollect
        ? {
            paymentMethod: payMethod,
            referenceId:
              payMethod === "EWALLET_OUTSIDE_APP" ? reference.trim() : undefined,
            tenderedCentavos:
              payMethod === "CASH" && Number.isFinite(tenderedPesos) && tenderedPesos > 0
                ? Math.round(tenderedPesos * 100)
                : undefined,
          }
        : {};

      const proofObjectKeys = proofShots.map((p) => p.objectKey);
      const updated = isReceive
        ? await receiveAtCounter(order._id, {
            proofObjectKeys,
            lineActuals: lineActuals.filter(Boolean) as {
              serviceRefId: string;
              actualWeightKg?: number;
              actualPieceCount?: number;
            }[],
            // Deferring and collecting are exclusive — the server rejects both.
            ...(defer ? { paymentTiming: "AT_FINAL_HANDOVER" as const } : { paymentTiming: "ON_PICKUP" as const, ...payment }),
          })
        : await verifySelfPickup(order._id, {
            ...(amountDue > 0 ? payment : {}),
            proofObjectKeys,
          });

      const change = updated.paymentSummary.changeCentavos;
      if (change != null && change > 0) {
        notify.info("Change due", `Give the customer ${pesos(change)} change.`);
      }
      notify.success(
        isReceive
          ? defer
            ? `Received — ${pesos(updated.amountDueCentavos)} due at handover.`
            : "Received and paid — laundry is in the queue."
          : "Handed over. Order complete.",
      );
      close();
    } catch (e: unknown) {
      notify.error("Couldn't save", toUserMessage(e, "Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!order) return null;

  const submitLabel = isReceive
    ? defer
      ? "Receive (pay later)"
      : "Receive & collect payment"
    : amountDue > 0
      ? `Collect ${pesos(amountDue)} & hand over`
      : "Hand over to customer";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SP._24) }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {isReceive ? "Receive at counter" : "Hand over to customer"}
            </Text>
            <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.gray500} />
            </TouchableOpacity>
          </View>
          <Text style={styles.customer} numberOfLines={1}>
            {order.customer.displayName}
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {isReceive ? (
              <>
                <Text style={styles.sectionTitle}>Confirm each service</Text>
                {order.serviceLines.map((l) => {
                  const unit = lineUnit(l.pricingType);
                  if (unit === "load") {
                    return (
                      <View key={l.serviceRefId} style={styles.lineRow}>
                        <Text style={styles.lineName} numberOfLines={1}>{l.serviceName}</Text>
                        <Text style={styles.lineFlat}>1 load</Text>
                      </View>
                    );
                  }
                  const isKg = unit === "weight";
                  return (
                    <View key={l.serviceRefId} style={styles.lineBlock}>
                      <Text style={styles.lineName} numberOfLines={1}>{l.serviceName}</Text>
                      <View style={styles.qtyRow}>
                        <TextInput
                          style={[styles.qtyInput, { borderColor: accent.base }]}
                          value={lineQty[l.serviceRefId] ?? ""}
                          onChangeText={(v) => setLineQty((p) => ({ ...p, [l.serviceRefId]: v }))}
                          placeholder={isKg ? "0.0" : "0"}
                          keyboardType={isKg ? "decimal-pad" : "number-pad"}
                          placeholderTextColor={C.gray300}
                        />
                        <Text style={styles.qtyUnit}>{isKg ? "kg" : "pcs"}</Text>
                      </View>
                    </View>
                  );
                })}
                <Text style={styles.note}>
                  The final price is calculated from what you enter here, not from the
                  customer&apos;s estimate.
                </Text>
              </>
            ) : (
              <View style={styles.dueBlock}>
                <Text style={styles.sectionTitle}>
                  {amountDue > 0 ? "Balance due" : "Nothing to collect"}
                </Text>
                <Text style={styles.dueAmount}>{pesos(amountDue)}</Text>
                {amountDue > 0 ? (
                  <Text style={styles.note}>
                    Collect this before handing the laundry over.
                  </Text>
                ) : (
                  <Text style={styles.note}>This order is fully paid.</Text>
                )}
              </View>
            )}

            {canDefer ? (
              <>
                <Text style={styles.sectionTitle}>When is the customer paying?</Text>
                <View style={styles.chipRow}>
                  {([false, true] as const).map((v) => {
                    const active = defer === v;
                    return (
                      <TouchableOpacity
                        key={String(v)}
                        style={[styles.chip, active && { backgroundColor: accent.base, borderColor: accent.base }]}
                        onPress={() => setDefer(v)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, active && { color: C.white }]}>
                          {v ? "Pay later" : "Pay now"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {mustCollect ? (
              <>
                <Text style={styles.sectionTitle}>Payment</Text>
                <View style={styles.chipRow}>
                  {(["CASH", "EWALLET_OUTSIDE_APP"] as const).map((m) => {
                    const active = payMethod === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[styles.chip, active && { backgroundColor: accent.base, borderColor: accent.base }]}
                        onPress={() => setPayMethod(m)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={m === "CASH" ? "cash-outline" : "phone-portrait-outline"}
                          size={15}
                          color={active ? C.white : C.gray600}
                        />
                        <Text style={[styles.chipText, active && { color: C.white }]}>
                          {m === "CASH" ? "Cash" : "E-wallet"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {payMethod === "EWALLET_OUTSIDE_APP" ? (
                  <TextInput
                    style={styles.input}
                    value={reference}
                    onChangeText={setReference}
                    placeholder="E-wallet reference no."
                    placeholderTextColor={C.gray300}
                    autoCapitalize="characters"
                  />
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      value={tendered}
                      onChangeText={setTendered}
                      placeholder="Cash received (₱, optional)"
                      placeholderTextColor={C.gray300}
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.note}>
                      Enter what the customer hands over and the change is computed for you.
                    </Text>
                  </>
                )}
              </>
            ) : defer ? (
              <Text style={styles.note}>
                Take the laundry in now — the whole amount is collected when the customer
                comes back for it.
              </Text>
            ) : null}

            <HandoverProofCapture
              orderId={order._id}
              leg={isReceive ? "PICKUP" : "RETURN"}
              accent={accent.base}
              shots={proofShots}
              onChange={setProofShots}
            />
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: accent.base },
              !canSubmit && styles.ctaDisabled,
            ]}
            onPress={submit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.ctaText}>{submitLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SP._16,
    paddingBottom: SP._24,
    maxHeight: "88%",
  },
  grabber: {
    width: 40, height: 4, borderRadius: RADIUS.full,
    backgroundColor: C.gray200, alignSelf: "center", marginVertical: SP._10,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  customer: { fontSize: 13, color: C.gray500, marginTop: 2 },
  body: { marginTop: SP._12 },
  bodyContent: { gap: SP._10, paddingBottom: SP._16 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.gray900, marginTop: SP._8 },
  lineBlock: { gap: SP._8 },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineName: { fontSize: 14, fontWeight: "600", color: C.gray700, flexShrink: 1 },
  lineFlat: { fontSize: 14, fontWeight: "700", color: C.gray500 },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  qtyInput: {
    width: 88, height: 44, borderWidth: 1.5, borderRadius: RADIUS.md,
    textAlign: "center", fontSize: 18, fontWeight: "700",
    color: C.gray900, fontFamily: MONO,
  },
  qtyUnit: { fontSize: 14, fontWeight: "700", color: C.gray500 },
  dueBlock: { gap: SP._4 },
  dueAmount: { fontSize: 28, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  chipRow: { flexDirection: "row", gap: SP._8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: SP._4,
    height: 40, paddingHorizontal: SP._14, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white,
  },
  chipText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  input: {
    height: 46, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.md,
    paddingHorizontal: SP._12, fontSize: 15, color: C.gray900,
  },
  note: { fontSize: 12, color: C.gray400 },
  cta: {
    height: 52, borderRadius: RADIUS.lg,
    alignItems: "center", justifyContent: "center", marginTop: SP._12,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 16, fontWeight: "800", color: C.white },
});
