// Cancel order modal (reason picker). Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { gqlCancelOrder } from "../../services/graphql/orders";
import { ActivityLog, CANCEL_REASONS, type LogActor, type CancelReasonKey } from "../../utils/logActivity";
import type { POSOrder } from "../../types/pos.types";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { useCan } from "../../hooks/usePermission";
import { Icon, fp } from "./shared";
import { S } from "./styles";
import { toUserMessage } from "../../utils/userError";

export function CancelOrderModal({
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
  const { width: _cw, height: _ch } = useWindowDimensions();
  const isCancelLandscape = _cw > _ch;
  const [reason, setReason]   = useState<CancelReasonKey | null>(null);
  const [note, setNote]       = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [consumablesUsed, setConsumablesUsed] = useState(false);

  useEffect(() => {
    if (order) { setReason(null); setNote(""); setConsumablesUsed(false); }
  }, [order]);

  const canCancelUnpaidOrder = useCan("canCancelUnpaidOrder");
  const canCancelPaidOrder   = useCan("canCancelPaidOrder");

  if (!order) return null;

  const isPaid = (order.paymentStatus as string)?.toLowerCase() === "paid";
  const canActorCancel = isPaid ? canCancelPaidOrder : canCancelUnpaidOrder;

  const handleCancel = async () => {
    if (!reason) { push({ type: "error", title: "Reason required", message: "Select a cancellation reason." }); return; }
    if (reason === "OTHER" && !note.trim()) {
      push({ type: "error", title: "Note required", message: "Describe the reason when selecting Other." });
      return;
    }
    setCancelling(true);
    try {
      await gqlCancelOrder(order.id, reason, !consumablesUsed);
      useQueueStore.getState().upsertOrder({ ...order, status: "CANCELLED" });
      await ActivityLog.orderCancelled(
        merchantId, actor, order.id,
        order.claimCode ?? order.id.slice(-6).toUpperCase(),
        reason, note.trim(), isPaid
      );
      const stockMsg = consumablesUsed ? "Stock kept deducted." : "Stock returned to inventory.";
      push({ type: "success", title: "Order cancelled", message: `#${order.claimCode ?? "order"} has been cancelled. ${stockMsg}` });
      onClose();
    } catch (err: unknown) {
      push({ type: "error", title: "Error", message: toUserMessage(err, "Try again.") });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={!!order} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={[S.cancelModalBackdrop, isCancelLandscape && { justifyContent: "center" }]}>
        <TouchableOpacity style={isCancelLandscape ? StyleSheet.absoluteFillObject : { flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={isCancelLandscape ? S.sheetLandscapeWrapper : undefined}>
          <View style={[S.cancelModalSheet, { paddingBottom: Math.max(insets.bottom, SP._16) }, isCancelLandscape && S.sheetLandscape]}>
            <View style={S.shiftModalHandle} />
            <View style={{ flexDirection: "row", alignItems: "flex-start", paddingHorizontal: SP._16, marginBottom: SP._4 }}>
              <View style={{ flex: 1 }}>
                <Text style={[S.cancelModalTitle, { paddingHorizontal: 0, marginBottom: SP._4 }]}>Cancel Order</Text>
                <Text style={[S.cancelModalSub, { paddingHorizontal: 0, marginBottom: 0 }]}>
                  {order.walkinCustomer?.name ?? "Walk-in"} · {fp(order.totalAmount)}
                  {isPaid ? " · Already paid" : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={{ padding: SP._4, marginTop: SP._2 }}>
                <Icon.X s={18} c={C.gray400} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
            {isPaid && (
              <View style={S.cancelNoPermBanner}>
                <Text style={S.cancelNoPermText}>
                  This order has already been paid. Use the{" "}
                  <Text style={{ fontWeight: "700" }}>Refund</Text>
                  {" "}option to void and refund it.
                </Text>
              </View>
            )}

            {!isPaid && !canActorCancel && (
              <View style={S.cancelNoPermBanner}>
                <Text style={S.cancelNoPermText}>
                  You don't have permission to cancel this order.
                </Text>
              </View>
            )}

            {!isPaid && canActorCancel && (
              <>

                <Text style={S.cancelReasonLabel}>Were consumables already used (e.g. mid-wash)?</Text>
                <View style={{ flexDirection: "row", gap: SP._8, paddingHorizontal: SP._16, marginBottom: SP._4 }}>
                  <TouchableOpacity
                    style={[S.cancelReasonChip, consumablesUsed && S.cancelReasonChipOn]}
                    onPress={() => setConsumablesUsed(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.cancelReasonText, consumablesUsed && S.cancelReasonTextOn]}>Yes — keep stock deducted</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.cancelReasonChip, !consumablesUsed && S.cancelReasonChipOn]}
                    onPress={() => setConsumablesUsed(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={[S.cancelReasonText, !consumablesUsed && S.cancelReasonTextOn]}>No — return stock</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 12, color: C.gray500, paddingHorizontal: SP._16, marginBottom: SP._12 }}>
                  {consumablesUsed
                    ? "Consumables already used for this order will NOT be added back to inventory."
                    : "Consumables reserved for this order will be returned to inventory."}
                </Text>

                <Text style={S.cancelReasonLabel}>Select reason</Text>
                <View style={S.cancelReasonList}>
                  {CANCEL_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[S.cancelReasonChip, reason === r.key && S.cancelReasonChipOn]}
                      onPress={() => setReason(r.key)}
                      activeOpacity={0.8}
                    >
                      <Text style={[S.cancelReasonText, reason === r.key && S.cancelReasonTextOn]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {reason === "OTHER" && (
                  <TextInput
                    style={S.cancelNoteInput}
                    value={note}
                    onChangeText={setNote}
                    placeholder="Describe the reason..."
                    placeholderTextColor={C.gray400}
                    multiline
                    numberOfLines={2}
                  />
                )}

                <View style={{ padding: SP._16, gap: SP._8 }}>
                  <TouchableOpacity
                    style={[S.cancelConfirmBtn, cancelling && { opacity: 0.6 }]}
                    onPress={() => { void handleCancel(); }}
                    disabled={cancelling}
                    activeOpacity={0.85}
                  >
                    {cancelling
                      ? <ActivityIndicator color={C.white} />
                      : <Text style={S.cancelConfirmText}>Confirm Cancellation</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.cancelConfirmBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: C.gray200, shadowOpacity: 0, elevation: 0 }]} onPress={onClose} disabled={cancelling} activeOpacity={0.75}>
                    <Text style={[S.cancelConfirmText, { color: C.gray500 }]}>Go Back</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {(isPaid || (!isPaid && !canActorCancel)) && (
              <View style={{ padding: SP._16 }}>
                <TouchableOpacity style={[S.cancelConfirmBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: C.gray200, shadowOpacity: 0, elevation: 0 }]} onPress={onClose} activeOpacity={0.75}>
                  <Text style={[S.cancelConfirmText, { color: C.gray500 }]}>Go Back</Text>
                </TouchableOpacity>
              </View>
            )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
