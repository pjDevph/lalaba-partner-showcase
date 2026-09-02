// Refund/void modal for a paid order. Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP } from "../../theme/tokens";
import { gqlVoidOrder } from "../../services/graphql/orders";
import { ActivityLog, type LogActor } from "../../utils/logActivity";
import type { POSOrder } from "../../types/pos.types";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { useCan } from "../../hooks/usePermission";
import { fp } from "./shared";
import { P, S } from "./styles";
import { toUserMessage } from "../../utils/userError";

const REFUND_REASONS = [
  "Customer dissatisfied",
  "Wrong order",
  "Duplicate payment",
  "Service not completed",
  "Overcharged",
  "Other",
] as const;

const REFUND_METHODS = ["Cash", "GCash", "Bank Transfer", "Other"] as const;

export function RefundModal({
  order,
  onClose,
  merchantId,
  actor,
}: Readonly<{
  order: POSOrder | null;
  onClose: () => void;
  merchantId: string;
  actor: LogActor;
}>) {
  const push = useNotificationStore((s) => s.push);
  const insets = useSafeAreaInsets();
  const { width: _rw, height: _rh } = useWindowDimensions();
  const isRefundLandscape = _rw > _rh;

  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<string>("Cash");
  const [amountInput, setAmountInput] = useState("");
  const [note, setNote] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [serviceCompleted, setServiceCompleted] = useState(false);

  useEffect(() => {
    if (order) {
      setReason("");
      setNote("");
      setMethod("Cash");
      setAmountInput(String(order.totalAmount ?? 0));
      setServiceCompleted(order.status === "CLAIMED");
    }
  }, [order]);

  const canRefund = useCan("canCancelPaidOrder");

  if (!order) return null;

  const handleRefund = async () => {
    if (!reason) {
      push({ type: "error", title: "Reason required", message: "Select a refund reason." });
      return;
    }
    const amount = Number.parseFloat(amountInput);
    if (Number.isNaN(amount) || amount <= 0 || amount > order.totalAmount) {
      push({ type: "error", title: "Invalid amount", message: `Enter an amount between ₱0.01 and ${fp(order.totalAmount)}.` });
      return;
    }
    setRefunding(true);
    try {
      await gqlVoidOrder(order.id, reason, !serviceCompleted);
      useQueueStore.getState().upsertOrder({ ...order, status: "VOID" });
      const noteDetail = note ? `: ${note}` : "";
      await ActivityLog.orderCancelled(
        merchantId, actor, order.id,
        order.claimCode ?? order.id.slice(-6).toUpperCase(),
        "OTHER", `REFUND — ${reason}${noteDetail}`, true
      );
      const stockMsg = serviceCompleted ? "Stock kept deducted." : "Stock returned to inventory.";
      push({ type: "success", title: "Refund recorded", message: `₱${amount.toFixed(2)} refund via ${method}. ${stockMsg}` });
      onClose();
    } catch (err: unknown) {
      push({ type: "error", title: "Refund failed", message: toUserMessage(err, "Try again.") });
    } finally {
      setRefunding(false);
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={!!order} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={[S.cancelModalBackdrop, isRefundLandscape && { justifyContent: "center" }]}>
        <TouchableOpacity style={isRefundLandscape ? StyleSheet.absoluteFillObject : { flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={isRefundLandscape ? S.sheetLandscapeWrapper : undefined}>
          <View style={[S.cancelModalSheet, { paddingBottom: Math.max(insets.bottom, SP._16) }, isRefundLandscape && S.sheetLandscape]}>
            <View style={S.shiftModalHandle} />
            <Text style={S.cancelModalTitle}>Refund Order</Text>
            <Text style={S.cancelModalSub}>
              {order.walkinCustomer?.name ?? "Walk-in"} · Total {fp(order.totalAmount)}
            </Text>

            {!canRefund ? (
              <View style={S.cancelNoPermBanner}>
                <Text style={S.cancelNoPermText}>
                  You don't have permission to process refunds.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets showsVerticalScrollIndicator={false}>
                {/* Refund amount */}
                <Text style={[S.cancelReasonLabel, { marginTop: SP._4 }]}>Refund Amount (₱)</Text>
                <View style={{ paddingHorizontal: SP._16, marginBottom: SP._12 }}>
                  <TextInput
                    style={S.cashInput}
                    value={amountInput}
                    onChangeText={setAmountInput}
                    keyboardType="decimal-pad"
                    placeholder={fp(order.totalAmount)}
                    placeholderTextColor={C.gray400}
                  />
                </View>

                {/* Refund method */}
                <Text style={S.cancelReasonLabel}>Refund via</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP._8, paddingHorizontal: SP._16, marginBottom: SP._12 }}>
                  {REFUND_METHODS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[S.cancelReasonChip, method === m && { backgroundColor: P.blue, borderColor: P.blue }]}
                      onPress={() => setMethod(m)}
                      activeOpacity={0.8}
                    >
                      <Text style={[S.cancelReasonText, method === m && { color: P.white }]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Was the service already performed? */}
                <Text style={S.cancelReasonLabel}>Was the service already completed?</Text>
                <View style={{ flexDirection: "row", gap: SP._8, paddingHorizontal: SP._16, marginBottom: SP._4 }}>
                  <TouchableOpacity
                    style={[S.cancelReasonChip, serviceCompleted && S.cancelReasonChipOn]}
                    onPress={() => setServiceCompleted(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.cancelReasonText, serviceCompleted && S.cancelReasonTextOn]}>Yes — keep stock deducted</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.cancelReasonChip, !serviceCompleted && S.cancelReasonChipOn]}
                    onPress={() => setServiceCompleted(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.cancelReasonText, !serviceCompleted && S.cancelReasonTextOn]}>No — return stock</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12, color: C.gray500, paddingHorizontal: SP._16, marginBottom: SP._12 }}>
                  {serviceCompleted
                    ? "Consumables used for this order (detergent, etc.) will NOT be added back to inventory."
                    : "Consumables reserved for this order will be returned to inventory."}
                </Text>

                {/* Reason */}
                <Text style={S.cancelReasonLabel}>Reason</Text>
                <View style={S.cancelReasonList}>
                  {REFUND_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[S.cancelReasonChip, reason === r && S.cancelReasonChipOn]}
                      onPress={() => setReason(r)}
                      activeOpacity={0.8}
                    >
                      <Text style={[S.cancelReasonText, reason === r && S.cancelReasonTextOn]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Note */}
                <TextInput
                  style={[S.cancelNoteInput, { marginTop: SP._4 }]}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Additional notes (optional)..."
                  placeholderTextColor={C.gray400}
                  multiline
                  numberOfLines={2}
                />

                <View style={{ flexDirection: "row", gap: SP._8, padding: SP._16 }}>
                  <TouchableOpacity style={S.discountCancelBtn} onPress={onClose} disabled={refunding} activeOpacity={0.8}>
                    <Text style={S.discountCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[{ flex: 1, backgroundColor: P.success, borderRadius: RADIUS.lg, height: 48, alignItems: "center", justifyContent: "center" }, refunding && { opacity: 0.6 }]}
                    onPress={() => { void handleRefund(); }}
                    disabled={refunding}
                    activeOpacity={0.85}
                  >
                    {refunding
                      ? <ActivityIndicator color={P.white} />
                      : <Text style={{ fontSize: 15, fontWeight: "700", color: P.white }}>Confirm Refund</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
