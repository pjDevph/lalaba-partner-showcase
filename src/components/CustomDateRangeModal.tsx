// src/components/CustomDateRangeModal.tsx
// Custom date-range filter: pick a start date and an end date (full-day range).
// Composes DateField (fully offline, no native dependency).

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../theme/tokens";
import { DateField, formatFieldDate } from "./DateField";

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}
export function formatRangeLabel(from: Date, to: Date): string {
  return `${formatFieldDate(from)} – ${formatFieldDate(to)}`;
}

export function CustomDateRangeModal({
  visible, initialFrom, initialTo, onApply, onClose,
}: Readonly<{
  visible: boolean;
  initialFrom?: Date | null;
  initialTo?: Date | null;
  onApply: (from: Date, to: Date) => void;
  onClose: () => void;
}>) {
  const [fromDate, setFromDate] = useState<Date>(() => initialFrom ?? new Date());
  const [toDate, setToDate]     = useState<Date>(() => initialTo ?? new Date());

  useEffect(() => {
    if (!visible) return;
    const now = new Date();
    setFromDate(initialFrom ?? now);
    setToDate(initialTo ?? now);
  }, [visible, initialFrom, initialTo]);

  const from = startOfDay(fromDate);
  const to   = endOfDay(toDate);
  const invalid = to.getTime() <= from.getTime();

  const apply = () => {
    if (invalid) return;
    onApply(from, to);
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.sheet} activeOpacity={1}>
          <Text style={s.title}>Custom Date Range</Text>

          <Text style={s.sectionLabel}>Start</Text>
          <DateField value={fromDate} onChange={setFromDate} />

          <Text style={[s.sectionLabel, { marginTop: SP._16 }]}>End</Text>
          <DateField value={toDate} onChange={setToDate} minDate={fromDate} />

          {invalid && (
            <Text style={s.errorText}>End date must be on or after the start date.</Text>
          )}

          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.applyBtn, invalid && s.applyBtnDisabled]}
              onPress={apply}
              activeOpacity={0.85}
              disabled={invalid}
            >
              <Text style={s.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,40,60,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  sheet: { width: "100%", maxWidth: 420, backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._20 },
  title: { fontSize: 16, fontWeight: "800", color: C.gray900, marginBottom: SP._16, textAlign: "center" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SP._8 },
  errorText: { fontSize: 12, color: C.error500, marginTop: SP._12, textAlign: "center", fontWeight: "600" },
  actions: { flexDirection: "row", gap: SP._12, marginTop: SP._20 },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  applyBtn: { flex: 2, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  applyBtnDisabled: { backgroundColor: C.gray300 },
  applyBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
