// src/components/DateField.tsx
// Lightweight, fully-offline date picker. Tapping the field opens a sheet with
// a month calendar grid — no native dependency (mirrors TimeField.tsx).

import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";

function CalendarIcon({ c = C.gray400, s = 18 }: Readonly<{ c?: string; s?: number }>) {
  return <Ionicons name="calendar-outline" size={s} color={c} />;
}
function ChevronIcon({ c = C.gray500, dir = "left" as "left" | "right" }: Readonly<{ c?: string; dir?: "left" | "right" }>) {
  return <Ionicons name={dir === "left" ? "chevron-back" : "chevron-forward"} size={18} color={c} />;
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfDay(d: Date): Date { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
export function formatFieldDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DateField({
  value, onChange, placeholder = "Select date", minDate, maxDate,
}: Readonly<{
  value: Date | null;
  onChange: (d: Date) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
}>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => startOfDay(value ?? new Date()));
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(value ?? new Date()));

  const openSheet = () => {
    const base = startOfDay(value ?? new Date());
    setDraft(base);
    setViewMonth(startOfMonth(base));
    setOpen(true);
  };

  const isDisabled = (d: Date) =>
    (minDate ? d < startOfDay(minDate) : false) || (maxDate ? d > startOfDay(maxDate) : false);

  const confirm = () => { onChange(draft); setOpen(false); };

  const firstWeekday = startOfMonth(viewMonth).getDay();
  const total = daysInMonth(viewMonth);
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  const today = startOfDay(new Date());

  return (
    <>
      <TouchableOpacity style={s.field} onPress={openSheet} activeOpacity={0.7}>
        <Text style={value ? s.fieldText : s.fieldPlaceholder}>
          {value ? formatFieldDate(value) : placeholder}
        </Text>
        <CalendarIcon c={value ? C.brand500 : C.gray400} />
      </TouchableOpacity>

      <Modal supportedOrientations={["portrait", "landscape"]} visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <Text style={s.sheetTitle}>Select Date</Text>

            <View style={s.monthRow}>
              <TouchableOpacity style={s.monthNavBtn} onPress={() => setViewMonth((m) => addMonths(m, -1))} hitSlop={8} activeOpacity={0.7}>
                <ChevronIcon dir="left" />
              </TouchableOpacity>
              <Text style={s.monthLabel}>{monthLabel(viewMonth)}</Text>
              <TouchableOpacity style={s.monthNavBtn} onPress={() => setViewMonth((m) => addMonths(m, 1))} hitSlop={8} activeOpacity={0.7}>
                <ChevronIcon dir="right" />
              </TouchableOpacity>
            </View>

            <View style={s.weekdayRow}>
              {WEEKDAY_LABELS.map((w) => (
                <Text key={w} style={s.weekdayText}>{w}</Text>
              ))}
            </View>

            <View style={s.grid}>
              {cells.map((d, i) => {
                if (!d) return <View key={`blank-${i}`} style={s.dayCell} />;
                const disabled = isDisabled(d);
                const selected = sameDay(d, draft);
                const isToday = sameDay(d, today);
                return (
                  <TouchableOpacity
                    key={d.toISOString()}
                    style={s.dayCell}
                    onPress={() => !disabled && setDraft(d)}
                    disabled={disabled}
                    activeOpacity={0.7}
                  >
                    <View style={[s.dayCircle, selected && s.dayCircleSelected, !selected && isToday && s.dayCircleToday]}>
                      <Text style={[
                        s.dayText,
                        disabled && s.dayTextDisabled,
                        selected && s.dayTextSelected,
                        !selected && isToday && s.dayTextToday,
                      ]}>
                        {d.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={s.todayChip}
              onPress={() => { if (!isDisabled(today)) { setDraft(today); setViewMonth(startOfMonth(today)); } }}
              activeOpacity={0.75}
            >
              <Text style={s.todayChipText}>Today</Text>
            </TouchableOpacity>

            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setOpen(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.setBtn} onPress={confirm} activeOpacity={0.85}>
                <Text style={s.setBtnText}>Set date</Text>
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
  sheetTitle: { fontSize: 13, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "center", marginBottom: SP._12 },

  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._10 },
  monthNavBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontSize: 15, fontWeight: "800", color: C.gray900 },

  weekdayRow: { flexDirection: "row", marginBottom: SP._4 },
  weekdayText: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: C.gray400 },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayCircleSelected: { backgroundColor: C.brand500 },
  dayCircleToday: { borderWidth: 1.5, borderColor: C.brand400 },
  dayText: { fontSize: 13, fontWeight: "600", color: C.gray800 },
  dayTextDisabled: { color: C.gray300 },
  dayTextSelected: { color: C.white, fontWeight: "800" },
  dayTextToday: { color: C.brand600, fontWeight: "800" },

  todayChip: { alignSelf: "center", marginTop: SP._10, paddingHorizontal: SP._12, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray100 },
  todayChipText: { fontSize: 12, fontWeight: "700", color: C.gray700 },

  actions: { flexDirection: "row", gap: SP._12, marginTop: SP._20 },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  setBtn: { flex: 2, height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  setBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
