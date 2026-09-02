// src/components/TimeField.tsx
// Lightweight, fully-offline time picker. Tapping the field opens a sheet with
// hour/minute steppers, an AM·PM toggle, and quick presets. Stores "HH:MM" (24h).

import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";
import { formatDueTime } from "../features/tasks/taskHelpers";

function ClockIcon({ c = C.gray400, s = 18 }: Readonly<{ c?: string; s?: number }>) {
  return <Ionicons name="time-outline" size={s} color={c} />;
}

const PRESETS: { label: string; value: string }[] = [
  { label: "8:00 AM", value: "08:00" },
  { label: "9:00 AM", value: "09:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "6:00 PM", value: "18:00" },
  { label: "9:00 PM", value: "21:00" },
  { label: "10:00 PM", value: "22:00" },
];

// "HH:MM" → { h12, min, pm }
function parse(value: string | null): { h12: number; min: number; pm: boolean } {
  if (value) {
    const [hs, ms] = value.split(":");
    const h = Number.parseInt(hs, 10);
    const m = Number.parseInt(ms, 10);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      return { h12: h % 12 === 0 ? 12 : h % 12, min: m, pm: h >= 12 };
    }
  }
  return { h12: 9, min: 0, pm: false };
}

function to24(h12: number, min: number, pm: boolean): string {
  let h = h12 % 12;
  if (pm) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function Stepper({
  label, value, onDec, onInc,
}: Readonly<{ label: string; value: string; onDec: () => void; onInc: () => void }>) {
  return (
    <View style={s.stepperCol}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperRow}>
        <TouchableOpacity style={s.stepBtn} onPress={onDec} activeOpacity={0.7}>
          <Text style={s.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={s.stepValue}>{value}</Text>
        <TouchableOpacity style={s.stepBtn} onPress={onInc} activeOpacity={0.7}>
          <Text style={s.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function TimeField({
  value,
  onChange,
  placeholder = "Select time",
}: Readonly<{ value: string | null; onChange: (v: string | null) => void; placeholder?: string }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parse(value));

  const openSheet = () => { setDraft(parse(value)); setOpen(true); };

  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const incH = () => set({ h12: draft.h12 === 12 ? 1 : draft.h12 + 1 });
  const decH = () => set({ h12: draft.h12 === 1 ? 12 : draft.h12 - 1 });
  const incM = () => set({ min: (draft.min + 5) % 60 });
  const decM = () => set({ min: (draft.min + 55) % 60 });

  const confirm = () => { onChange(to24(draft.h12, draft.min, draft.pm)); setOpen(false); };
  const clear = () => { onChange(null); setOpen(false); };

  return (
    <>
      <TouchableOpacity style={s.field} onPress={openSheet} activeOpacity={0.7}>
        <Text style={value ? s.fieldText : s.fieldPlaceholder}>
          {value ? formatDueTime(value) : placeholder}
        </Text>
        <ClockIcon c={value ? C.brand500 : C.gray400} />
      </TouchableOpacity>

      <Modal supportedOrientations={["portrait", "landscape"]} visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <Text style={s.sheetTitle}>Due Time</Text>

            {/* Live preview */}
            <Text style={s.preview}>{formatDueTime(to24(draft.h12, draft.min, draft.pm))}</Text>

            {/* Steppers + AM/PM */}
            <View style={s.steppers}>
              <Stepper label="Hour" value={String(draft.h12)} onDec={decH} onInc={incH} />
              <Stepper label="Min" value={String(draft.min).padStart(2, "0")} onDec={decM} onInc={incM} />
              <View style={s.stepperCol}>
                <Text style={s.stepperLabel}>AM / PM</Text>
                <View style={s.ampmRow}>
                  {(["AM", "PM"] as const).map((p) => {
                    const active = (p === "PM") === draft.pm;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[s.ampmBtn, active && s.ampmBtnActive]}
                        onPress={() => set({ pm: p === "PM" })}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.ampmText, active && s.ampmTextActive]}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Presets */}
            <Text style={s.presetLabel}>Quick pick</Text>
            <View style={s.presetWrap}>
              {PRESETS.map((p) => (
                <TouchableOpacity key={p.value} style={s.presetChip} onPress={() => setDraft(parse(p.value))} activeOpacity={0.75}>
                  <Text style={s.presetChipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={s.actions}>
              <TouchableOpacity style={s.clearBtn} onPress={clear} activeOpacity={0.8}>
                <Text style={s.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.setBtn} onPress={confirm} activeOpacity={0.85}>
                <Text style={s.setBtnText}>Set time</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  field: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200,
    paddingHorizontal: SP._12, paddingVertical: SP._12,
  },
  fieldText: { fontSize: 14, color: C.gray900, fontWeight: "600" },
  fieldPlaceholder: { fontSize: 14, color: C.gray400 },

  backdrop: { flex: 1, backgroundColor: "rgba(15,40,60,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  sheet: { width: "100%", maxWidth: 380, backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._20 },
  sheetTitle: { fontSize: 13, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center" },
  preview: { fontSize: 34, fontWeight: "800", color: C.gray900, textAlign: "center", marginVertical: SP._12 },

  steppers: { flexDirection: "row", justifyContent: "space-between", gap: SP._10 },
  stepperCol: { flex: 1, alignItems: "center", gap: SP._6 },
  stepperLabel: { fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.3 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.brand100, alignItems: "center", justifyContent: "center" },
  stepBtnText: { fontSize: 20, fontWeight: "800", color: C.brand700, marginTop: -2 },
  stepValue: { fontSize: 18, fontWeight: "800", color: C.gray900, minWidth: 30, textAlign: "center" },

  ampmRow: { flexDirection: "row", gap: SP._6 },
  ampmBtn: { paddingHorizontal: SP._10, paddingVertical: SP._8, borderRadius: RADIUS.sm, backgroundColor: C.gray100 },
  ampmBtnActive: { backgroundColor: C.brand500 },
  ampmText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  ampmTextActive: { color: C.white },

  presetLabel: { fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.3, marginTop: SP._20, marginBottom: SP._8 },
  presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  presetChip: { paddingHorizontal: SP._12, paddingVertical: SP._8, borderRadius: RADIUS.full, backgroundColor: C.gray100 },
  presetChipText: { fontSize: 13, fontWeight: "600", color: C.gray700 },

  actions: { flexDirection: "row", gap: SP._12, marginTop: SP._20 },
  clearBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  clearBtnText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  setBtn: { flex: 2, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  setBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
