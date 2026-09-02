// Cash drawer / shift start modal (opening float, cash count). Extracted from pos.tsx.
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, RADIUS, SP } from "../../theme/tokens";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { fp } from "./shared";
import { P, S } from "./styles";

export function CashDrawerModal({
  visible,
  onClose,
  cashSalesTotal,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  cashSalesTotal: number;
}>) {
  const insets = useSafeAreaInsets();
  const { width: _dw, height: _dh } = useWindowDimensions();
  const isDrawerLandscape = _dw > _dh;
  const { startingCash, cashMovements, addCashMovement } = useActiveStaffStore();
  const push = useNotificationStore((s) => s.push);

  const [showAdd, setShowAdd] = useState(false);
  const [movType, setMovType] = useState<"IN" | "OUT">("IN");
  const [movAmount, setMovAmount] = useState("");
  const [movNote, setMovNote] = useState("");
  const [showClose, setShowClose] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");

  const cashIn  = cashMovements.filter((m) => m.type === "IN").reduce((s, m) => s + m.amount, 0);
  const cashOut = cashMovements.filter((m) => m.type === "OUT").reduce((s, m) => s + m.amount, 0);
  const expected = startingCash + cashSalesTotal + cashIn - cashOut;

  const handleAdd = () => {
    const amount = Number.parseFloat(movAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      push({ type: "error", title: "Invalid amount", message: "Enter a valid amount." });
      return;
    }
    addCashMovement(movType, amount, movNote.trim());
    setMovAmount(""); setMovNote(""); setShowAdd(false);
    push({ type: "success", title: `Cash ${movType === "IN" ? "In" : "Out"} recorded` });
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={[S.shiftModalBackdrop, isDrawerLandscape && { justifyContent: "center" }]}>
        <TouchableOpacity style={isDrawerLandscape ? StyleSheet.absoluteFillObject : { flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={isDrawerLandscape ? S.sheetLandscapeWrapper : undefined}>
          <View style={[S.shiftModalSheet, { paddingBottom: Math.max(insets.bottom, SP._16) }, isDrawerLandscape && S.sheetLandscape]}>
            <View style={S.shiftModalHandle} />
            <Text style={S.shiftModalTitle}>Cash Drawer</Text>

            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
            {/* Summary */}
            <View style={{ marginHorizontal: SP._16, backgroundColor: P.bg, borderRadius: RADIUS.lg, padding: SP._14, gap: SP._8, marginBottom: SP._12 }}>
              {[
                { label: "Starting Cash", value: startingCash },
                { label: "Cash Sales", value: cashSalesTotal },
                { label: "Cash In", value: cashIn, positive: true },
                { label: "Cash Out", value: cashOut, negative: true },
              ].map(({ label, value, positive, negative }) => {
                const positiveColor = positive ? P.success : P.text;
                const amountColor = negative ? P.errorRed : positiveColor;
                return (
                  <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 13, color: P.muted }}>{label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: amountColor }}>
                      {negative ? "-" : ""}{fp(value)}
                    </Text>
                  </View>
                );
              })}
              <View style={{ height: 1, backgroundColor: P.border, marginVertical: SP._4 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: P.text }}>Expected in Drawer</Text>
                <Text style={{ fontSize: 14, fontWeight: "800", color: P.blue }}>{fp(expected)}</Text>
              </View>
            </View>

            {/* Movements — inlined so outer ScrollView handles keyboard avoidance */}
            {cashMovements.map((m) => (
              <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: SP._6, marginHorizontal: SP._16, borderBottomWidth: 1, borderBottomColor: P.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: m.type === "IN" ? P.success : P.errorRed }}>
                    {m.type === "IN" ? "↑ Cash In" : "↓ Cash Out"}
                  </Text>
                  {m.note ? <Text style={{ fontSize: 11, color: P.muted }}>{m.note}</Text> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: m.type === "IN" ? P.success : P.errorRed }}>
                  {m.type === "OUT" ? "-" : "+"}{fp(m.amount)}
                </Text>
              </View>
            ))}
            {cashMovements.length > 0 && <View style={{ height: SP._12 }} />}

            {/* Shift Close Reconciliation */}
            {!showAdd && (
              <View style={{ marginHorizontal: SP._16, marginBottom: SP._12 }}>
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: SP._8, paddingVertical: SP._8 }}
                  onPress={() => { setShowClose(!showClose); setActualCashInput(""); }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: showClose ? P.blue : P.text }}>
                    {showClose ? "▾ Close Shift Reconciliation" : "▸ Close Shift Reconciliation"}
                  </Text>
                </TouchableOpacity>
                {showClose && (() => {
                  const actualCash = Number.parseFloat(actualCashInput) || 0;
                  const diff = actualCash - expected;
                  const hasCount = actualCashInput.trim().length > 0;
                  const diffLabel = diff < 0 ? "Shortage" : "Balanced";
                  const drawerStatusLabel = diff > 0 ? "Overage" : diffLabel;
                  const diffNegativeColor = diff < 0 ? P.errorRed : P.success;
                  const drawerAmountColor = diff > 0 ? P.success : diffNegativeColor;
                  return (
                    <View style={{ gap: SP._8 }}>
                      <Text style={{ fontSize: 11, color: P.muted }}>Count the physical cash in the drawer and enter the total.</Text>
                      <Text style={S.shiftModalLabel}>Actual Cash Count (₱)</Text>
                      <TextInput
                        style={S.cashInput}
                        placeholder="0.00"
                        value={actualCashInput}
                        onChangeText={setActualCashInput}
                        keyboardType="decimal-pad"
                        placeholderTextColor={C.gray400}
                      />
                      {hasCount && (
                        <View style={{ backgroundColor: P.bg, borderRadius: RADIUS.md, padding: SP._12, gap: SP._6 }}>
                          {[
                            { label: "Expected in Drawer", value: fp(expected), color: P.blue },
                            { label: "Actual Count", value: fp(actualCash), color: P.text },
                          ].map(({ label, value, color }) => (
                            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                              <Text style={{ fontSize: 13, color: P.muted }}>{label}</Text>
                              <Text style={{ fontSize: 13, fontWeight: "700", color }}>{value}</Text>
                            </View>
                          ))}
                          <View style={{ height: 1, backgroundColor: P.border }} />
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 14, fontWeight: "700", color: P.text }}>
                              {drawerStatusLabel}
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: drawerAmountColor }}>
                              {diff > 0 ? "+" : ""}{fp(Math.abs(diff))}
                            </Text>
                          </View>
                          {diff !== 0 && (
                            <Text style={{ fontSize: 11, color: diff < 0 ? P.errorRed : P.success }}>
                              {diff < 0
                                ? `Cash drawer is short by ${fp(Math.abs(diff))}. Investigate missing amount.`
                                : `Cash drawer has ${fp(diff)} extra. Record as Cash In if intentional.`}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Add movement */}
            {showAdd ? (
              <View style={{ marginHorizontal: SP._16, gap: SP._8, marginBottom: SP._8 }}>
                <View style={{ flexDirection: "row", gap: SP._8 }}>
                  {(["IN", "OUT"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[S.payBtn, movType === t && S.payBtnActive, { flex: 1 }]}
                      onPress={() => setMovType(t)}
                      activeOpacity={0.75}
                    >
                      <Text style={[S.payBtnText, movType === t && S.payBtnTextActive]}>
                        {t === "IN" ? "Cash In" : "Cash Out"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={S.shiftModalLabel}>Amount (₱)</Text>
                <TextInput
                  style={S.cashInput}
                  placeholder="0.00"
                  value={movAmount}
                  onChangeText={setMovAmount}
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.gray400}
                />
                <TextInput
                  style={S.cashInput}
                  placeholder="Note (optional)"
                  value={movNote}
                  onChangeText={setMovNote}
                  placeholderTextColor={C.gray400}
                />
                <View style={{ flexDirection: "row", gap: SP._8 }}>
                  <TouchableOpacity style={[S.discountApplyBtn, { flex: 1 }]} onPress={handleAdd} activeOpacity={0.85}>
                    <Text style={S.discountApplyText}>Record</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.discountCancelBtn, { flex: 1 }]} onPress={() => setShowAdd(false)} activeOpacity={0.8}>
                    <Text style={S.discountCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ marginHorizontal: SP._16 }}>
                <TouchableOpacity
                  style={[S.shiftStartBtn, { backgroundColor: P.bg, borderWidth: 1.5, borderColor: P.border }]}
                  onPress={() => setShowAdd(true)}
                  activeOpacity={0.85}
                >
                  <Text style={[S.shiftStartBtnText, { color: P.text }]}>+ Add Cash In / Out</Text>
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
