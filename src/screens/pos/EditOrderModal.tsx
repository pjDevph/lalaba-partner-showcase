// Edit order modal — edit customer details on a CREATED order. Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP } from "../../theme/tokens";
import { gqlUpdateOrderDetails } from "../../services/graphql/orders";
import { gqlOrderToPOS } from "../../services/queueService";
import { ActivityLog, type LogActor } from "../../utils/logActivity";
import type { POSOrder } from "../../types/pos.types";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { Icon } from "./shared";
import { P, S } from "./styles";
import { toUserMessage } from "../../utils/userError";

export function EditOrderModal({
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
  const { width: _ew, height: _eh } = useWindowDimensions();
  const isEditLandscape = _ew > _eh;

  const [editNotes, setEditNotes] = useState("");
  const [editCustomer, setEditCustomer] = useState<{ name?: string; phone?: string; address?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) {
      setEditNotes(order.notes ?? "");
      setEditCustomer({
        name: order.walkinCustomer?.name,
        phone: order.walkinCustomer?.phone,
        address: order.walkinCustomer?.address,
      });
    }
  }, [order]);

  if (!order) return null;
  // Owner-only. The MANAGER arm of this check was unreachable, so this is what
  // the condition has always actually meant.
  if (actor.role !== "OWNER") return null;

  const canEdit = order.status === "CREATED";

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await gqlUpdateOrderDetails(order.id, {
        customerName:    editCustomer.name?.trim() || undefined, // NOSONAR — catches empty string
        customerPhone:   editCustomer.phone?.trim() || undefined, // NOSONAR — catches empty string
        customerAddress: editCustomer.address?.trim() || undefined, // NOSONAR — catches empty string
        notes:           editNotes.trim() || undefined, // NOSONAR — catches empty string
      });
      useQueueStore.getState().upsertOrder(gqlOrderToPOS(updated));
      await ActivityLog.orderStatusChanged(merchantId, actor, order.id, order.claimCode ?? order.id.slice(-6).toUpperCase(), "CREATED", "CREATED");
      push({ type: "success", title: "Order updated" });
      onClose();
    } catch (err: unknown) {
      push({ type: "error", title: "Update failed", message: toUserMessage(err, "Try again.") });
    } finally {
      setSaving(false);
    }
  };

  // Card sizing mirrors Settings → Services' "New/Edit Service" modal, which
  // handles the same scroll-under-keyboard problem correctly: a fixed (not
  // max) height on the element KeyboardAvoidingView sizes gives it a firm
  // baseline to shrink from when the keyboard opens, instead of the sheet
  // only ever being as tall as its content and never actually resizing.
  const editCardStyle = isEditLandscape
    ? { width: "100%" as const, maxWidth: 620, height: "86%" as const, backgroundColor: P.white, borderRadius: RADIUS.xl, overflow: "hidden" as const }
    : { width: "100%" as const, height: "90%" as const, backgroundColor: P.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" as const };

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={!!order}
      transparent
      statusBarTranslucent
      // Match OrderDetailSheet's tablet-aware animation so switching from the
      // detail sheet into edit mode doesn't feel like two unrelated modals —
      // fade/none on landscape tablets, slide on phones.
      animationType={isEditLandscape ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
      onRequestClose={onClose}
    >
      <View style={isEditLandscape ? S.editModalOverlay : [S.cancelModalBackdrop, { padding: 0 }]}>
        <TouchableOpacity
          style={isEditLandscape ? StyleSheet.absoluteFillObject : { flex: 1 }}
          onPress={onClose}
          activeOpacity={1}
        />
        <KeyboardAvoidingView
          style={editCardStyle}
          // This modal is inside a native <Modal>, which opens its own Android window
          // and does NOT inherit the Activity's windowSoftInputMode="adjustResize" —
          // so "undefined" here left focused fields hidden behind the keyboard.
          // "height" also avoids the keyboard, but re-lays out this whole subtree as
          // the keyboard animates (each keystroke that nudges the keyboard's own
          // frame, e.g. a predictive-text bar, re-shrinks it further); "padding"
          // only shifts the bottom inset and doesn't compound like that.
          behavior="padding"
        >
          <View style={{ flex: 1 }}>
            <View style={S.shiftModalHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: SP._16, marginBottom: SP._12 }}>
              <Text style={[S.shiftModalTitle, { flex: 1, paddingHorizontal: 0, marginBottom: 0 }]}>Edit Order #{order.claimCode}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8} style={{ padding: SP._4 }}>
                <Icon.X s={18} c={C.gray400} />
              </TouchableOpacity>
            </View>
            {!canEdit && (
              <View style={S.cancelNoPermBanner}>
                <Text style={S.cancelNoPermText}>Only CREATED orders can be edited. This order is already {order.status}.</Text>
              </View>
            )}
            {canEdit && (
              <>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 240 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                >
                  {/* Customer */}
                  <Text style={S.cancelReasonLabel}>Customer</Text>
                  <View style={{ paddingHorizontal: SP._16, gap: SP._6, marginBottom: SP._12 }}>
                    <TextInput style={S.cashInput} placeholder="Customer name" value={editCustomer.name ?? ""} onChangeText={(v) => setEditCustomer((p) => ({ ...p, name: v }))} placeholderTextColor={C.gray400} />
                    <TextInput style={S.cashInput} placeholder="Phone number" value={editCustomer.phone ?? ""} onChangeText={(v) => setEditCustomer((p) => ({ ...p, phone: v }))} keyboardType="phone-pad" placeholderTextColor={C.gray400} />
                    <TextInput style={S.cashInput} placeholder="Address" value={editCustomer.address ?? ""} onChangeText={(v) => setEditCustomer((p) => ({ ...p, address: v }))} placeholderTextColor={C.gray400} />
                  </View>
                  {/* Notes */}
                  <Text style={S.cancelReasonLabel}>Notes</Text>
                  <View style={{ paddingHorizontal: SP._16 }}>
                    <TextInput style={[S.cashInput, { height: 60, textAlignVertical: "top", paddingTop: 8 }]} placeholder="Special instructions..." value={editNotes} onChangeText={setEditNotes} multiline placeholderTextColor={C.gray400} />
                  </View>
                </ScrollView>

                {/* Sticky footer — stays put while the form above scrolls */}
                <View style={[S.editOrderFooter, { paddingBottom: Math.max(insets.bottom, SP._16) }]}>
                  <TouchableOpacity
                    style={[S.shiftStartBtn, { flex: 1, marginHorizontal: 0, backgroundColor: "transparent", borderWidth: 1, borderColor: C.gray200, shadowOpacity: 0, elevation: 0 }]}
                    onPress={onClose}
                    disabled={saving}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.shiftStartBtnText, { color: C.gray500 }]}>Discard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.shiftStartBtn, { flex: 1, marginHorizontal: 0 }, saving && { opacity: 0.6 }]}
                    onPress={() => { void handleSave(); }}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? <ActivityIndicator color={C.white} /> : <Text style={S.shiftStartBtnText}>Save Changes</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
