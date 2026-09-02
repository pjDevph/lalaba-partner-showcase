// src/components/QualityHoldSheet.tsx
// Reporting a problem with a load mid-wash (§12).
//
// The distinction the sheet is built around is "does resolving this change the
// price or what we do to the item?":
//
//   Needs the customer's OK — an extra treatment, excluding an item, a
//   liability trade-off. The order stops until they answer, and if they never
//   do it auto-resolves to the cheaper option rather than the costlier one.
//
//   Just for the record — pre-existing damage noted with photos, a brief
//   operational pause. Nothing is asked of anyone, the load keeps moving.
//
// A hold never cancels an order. Both answers resolve back into processing; a
// customer who wants out uses the normal cancellation flow instead.

import React, { useState } from "react";
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
import {
  gqlRaiseQualityHold,
  pesos,
  type GqlOnlineOrder,
} from "../services/graphql/onlineOrders";
import { toUserMessage } from "../utils/userError";

export default function QualityHoldSheet({
  order,
  accent,
  onClose,
  onRaised,
}: Readonly<{
  order: GqlOnlineOrder | null;
  accent: { base: string; bg: string; dark: string };
  onClose: () => void;
  onRaised: () => void;
}>) {
  const [lineIndex, setLineIndex] = useState(0);
  const [reason, setReason] = useState("");
  const [blocks, setBlocks] = useState(true);
  const [charge, setCharge] = useState("");
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();

  const chargePesos = Number.parseFloat(charge);
  const chargeCentavos =
    Number.isFinite(chargePesos) && chargePesos > 0
      ? Math.round(chargePesos * 100)
      : undefined;
  const canSubmit = reason.trim().length >= 5 && !busy;

  const close = () => {
    setLineIndex(0);
    setReason("");
    setBlocks(true);
    setCharge("");
    onClose();
  };

  const submit = async () => {
    if (!order || !canSubmit) return;
    setBusy(true);
    try {
      await gqlRaiseQualityHold(order._id, {
        serviceLineIndex: lineIndex,
        reason: reason.trim(),
        blocksOrder: blocks,
        // A charge only means anything on a blocking hold — a documentary note
        // must never quietly move the customer's total.
        additionalChargeCentavos: blocks ? chargeCentavos : undefined,
      });
      notify.success(
        blocks
          ? "Sent to the customer. The load waits for their answer."
          : "Noted on the order. Processing continues.",
      );
      onRaised();
      close();
    } catch (e: unknown) {
      notify.error("Couldn't report this", toUserMessage(e, "Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!order) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, SP._24) }]}>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Report a problem</Text>
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
            {order.serviceLines.length > 1 ? (
              <>
                <Text style={styles.sectionTitle}>Which service?</Text>
                <View style={styles.chipRow}>
                  {order.serviceLines.map((l, i) => {
                    const active = lineIndex === i;
                    return (
                      <TouchableOpacity
                        key={l.serviceRefId}
                        style={[styles.chip, active && { backgroundColor: accent.base, borderColor: accent.base }]}
                        onPress={() => setLineIndex(i)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, active && { color: C.white }]}>
                          {l.serviceName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>What's wrong?</Text>
            <TextInput
              style={styles.textArea}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Stubborn ink stain on the white shirt — needs special treatment"
              placeholderTextColor={C.gray300}
              multiline
            />

            <Text style={styles.sectionTitle}>Does this need the customer's OK?</Text>
            <View style={styles.optionCol}>
              <TouchableOpacity
                style={[styles.option, blocks && { borderColor: accent.base, backgroundColor: accent.bg }]}
                onPress={() => setBlocks(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.optionTitle}>Yes — it changes the price or the handling</Text>
                <Text style={styles.optionBody}>
                  The load waits for their answer. If they don&apos;t reply in time it
                  resolves the cheaper way on its own.
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.option, !blocks && { borderColor: accent.base, backgroundColor: accent.bg }]}
                onPress={() => setBlocks(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.optionTitle}>No — just for the record</Text>
                <Text style={styles.optionBody}>
                  Noted on the order and the customer is told. Nothing stops.
                </Text>
              </TouchableOpacity>
            </View>

            {blocks ? (
              <>
                <Text style={styles.sectionTitle}>Extra charge (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={charge}
                  onChangeText={setCharge}
                  placeholder="₱ 0.00"
                  placeholderTextColor={C.gray300}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.note}>
                  {chargeCentavos
                    ? `${pesos(chargeCentavos)} plus the platform fee is added to their total only if they agree.`
                    : "Leave empty if the fix costs the customer nothing."}
                </Text>
              </>
            ) : null}
          </ScrollView>

          <TouchableOpacity
            style={[styles.cta, { backgroundColor: accent.base }, !canSubmit && styles.ctaDisabled]}
            onPress={submit}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.ctaText}>
                {blocks ? "Ask the customer" : "Add to the record"}
              </Text>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  chip: {
    height: 38, paddingHorizontal: SP._14, borderRadius: RADIUS.full,
    borderWidth: 1, borderColor: C.gray200, alignItems: "center", justifyContent: "center",
  },
  chipText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  textArea: {
    minHeight: 88, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.md,
    padding: SP._12, fontSize: 15, color: C.gray900, textAlignVertical: "top",
  },
  optionCol: { gap: SP._8 },
  option: {
    borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md,
    padding: SP._12, gap: 2,
  },
  optionTitle: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  optionBody: { fontSize: 12, color: C.gray500, lineHeight: 17 },
  input: {
    height: 46, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.md,
    paddingHorizontal: SP._12, fontSize: 15, color: C.gray900,
  },
  note: { fontSize: 12, color: C.gray400, lineHeight: 17 },
  cta: {
    height: 52, borderRadius: RADIUS.lg,
    alignItems: "center", justifyContent: "center", marginTop: SP._12,
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { fontSize: 16, fontWeight: "800", color: C.white },
});
