// src/screens/settings/HoursEditor.tsx
// The operating-hours week editor: day rows, time pickers, bulk actions.
//
// Lifted out of HoursScreen so washers and merchants edit their hours with
// literally the same component rather than two implementations that drift.
// Purely presentational — it owns no save, no branch, and no network. The
// caller holds the week in state and decides what saving means (merchant →
// gqlUpdateBranch, washer → gqlUpdateWasherProfile).

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  useWindowDimensions,
} from "react-native";
import { C } from "../../theme/tokens";
import { DAYS, type Day, type DaySchedule, type OperatingHours } from "./shared";
import {
  parseTime24,
  formatTime24,
  formatTime12,
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  TIME_PICKER_MERIDIEMS,
} from "./timeHelpers";
import { S } from "./styles";

export function TimePicker({
  value,
  onChange,
  style,
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  style?: object;
}>) {
  const [open, setOpen] = useState(false);
  const [openValue, setOpenValue] = useState(value);
  const { hour12, minute, meridiem } = parseTime24(value);

  const handleOpen = () => {
    setOpenValue(value);
    setOpen(true);
  };
  // Cancel restores the value the sheet opened with — edits apply live, so
  // there is nothing else to roll back to.
  const handleCancel = () => {
    onChange(openValue);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity style={style} onPress={handleOpen} activeOpacity={0.75}>
        <Text style={S.hoursTimeInputText}>{formatTime12(value)}</Text>
      </TouchableOpacity>
      <Modal supportedOrientations={["portrait", "landscape"]} visible={open} transparent animationType="fade" onRequestClose={handleCancel}>
        <TouchableOpacity style={S.timePickerBackdrop} activeOpacity={1} onPress={handleCancel}>
          <TouchableOpacity activeOpacity={1} style={S.timePickerCard} onPress={() => {}}>
            <Text style={S.timePickerTitle}>Select time</Text>
            <View style={S.timePickerColumns}>
              <ScrollView style={S.timePickerCol} showsVerticalScrollIndicator={false}>
                {TIME_PICKER_HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[S.timePickerOption, h === hour12 && S.timePickerOptionActive]}
                    onPress={() => onChange(formatTime24(h, minute, meridiem))}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.timePickerOptionText, h === hour12 && S.timePickerOptionTextActive]}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <ScrollView style={S.timePickerCol} showsVerticalScrollIndicator={false}>
                {TIME_PICKER_MINUTES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[S.timePickerOption, m === minute && S.timePickerOptionActive]}
                    onPress={() => onChange(formatTime24(hour12, m, meridiem))}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.timePickerOptionText, m === minute && S.timePickerOptionTextActive]}>
                      {m.toString().padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={S.timePickerCol}>
                {TIME_PICKER_MERIDIEMS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[S.timePickerOption, p === meridiem && S.timePickerOptionActive]}
                    onPress={() => onChange(formatTime24(hour12, minute, p))}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.timePickerOptionText, p === meridiem && S.timePickerOptionTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={S.timePickerActions}>
              <TouchableOpacity style={S.timePickerCancelBtn} onPress={handleCancel} activeOpacity={0.85}>
                <Text style={S.timePickerCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.timePickerDoneBtn} onPress={() => setOpen(false)} activeOpacity={0.85}>
                <Text style={S.timePickerDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const DAY_SHORT: Record<Day, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu",
  Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};
const WEEKDAYS: Day[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const FALLBACK_DAY: DaySchedule = {
  isOpen: false,
  is24Hours: false,
  openTime: "08:00",
  closeTime: "18:00",
};

export function HoursEditor({
  hours,
  onChange,
  accentColor = C.brand400,
}: Readonly<{
  hours: OperatingHours;
  onChange: (next: OperatingHours) => void;
  /** Switch tint — washers run on the teal sub-brand, merchants on blue. */
  accentColor?: string;
}>) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  const updateHours = (
    day: Day,
    key: keyof DaySchedule,
    value: string | boolean,
  ) => {
    onChange({ ...hours, [day]: { ...hours[day], [key]: value } });
  };

  // Bulk actions copy the first OPEN day rather than Monday — copying a closed
  // Monday over the week would wipe the schedule in one tap.
  const applyTo = (days: readonly Day[]) => {
    const src = DAYS.find((d) => hours[d]?.isOpen);
    if (!src) return;
    const sch = hours[src];
    const next = { ...hours };
    for (const d of days) next[d] = { ...sch };
    onChange(next);
  };

  const setAll24Hours = () => {
    const next = { ...hours };
    for (const d of DAYS) next[d] = { ...next[d], isOpen: true, is24Hours: true };
    onChange(next);
  };

  return (
    <>
      <View style={S.hoursQuickRow}>
        <TouchableOpacity style={S.hoursQuickBtn} onPress={() => applyTo(WEEKDAYS)} activeOpacity={0.8}>
          <Text style={S.hoursQuickBtnText}>Copy Mon–Fri</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.hoursQuickBtn} onPress={() => applyTo(DAYS)} activeOpacity={0.8}>
          <Text style={S.hoursQuickBtnText}>Apply to all</Text>
        </TouchableOpacity>
        <TouchableOpacity style={S.hoursQuickBtn} onPress={setAll24Hours} activeOpacity={0.8}>
          <Text style={S.hoursQuickBtnText}>Set 24/7</Text>
        </TouchableOpacity>
      </View>

      <View style={S.hoursCard}>
        {DAYS.map((day, idx) => {
          const sch = hours[day] ?? FALLBACK_DAY;
          const isLast = idx === DAYS.length - 1;
          return (
            <View key={day} style={[S.hoursDayRow, isTablet && S.hoursDayRowTablet, !isLast && S.hoursDayRowBorder]}>
              <View style={[S.hoursDayLabelWrap, isTablet && { width: 72 }]}>
                <Text style={[S.hoursDayShort, !sch.isOpen && S.hoursDayShortClosed]}>
                  {DAY_SHORT[day]}
                </Text>
                <Text style={[S.hoursDayFull, !sch.isOpen && S.hoursDayFullClosed]}>
                  {day}
                </Text>
              </View>

              <View style={S.hoursTimeBlock}>
                {sch.isOpen && sch.is24Hours ? (
                  <TouchableOpacity
                    style={S.hours24Badge}
                    onPress={() => updateHours(day, "is24Hours", false)}
                    activeOpacity={0.75}
                  >
                    <Text style={S.hours24BadgeText}>Open 24 hours</Text>
                  </TouchableOpacity>
                ) : sch.isOpen ? (
                  <View style={S.hoursTimeRow}>
                    <TimePicker
                      style={[S.hoursTimeInput, isTablet && S.hoursTimeInputTablet]}
                      value={sch.openTime}
                      onChange={(v) => updateHours(day, "openTime", v)}
                    />
                    <Text style={S.hoursTimeDash}>–</Text>
                    <TimePicker
                      style={[S.hoursTimeInput, isTablet && S.hoursTimeInputTablet]}
                      value={sch.closeTime}
                      onChange={(v) => updateHours(day, "closeTime", v)}
                    />
                  </View>
                ) : (
                  <View style={S.hoursClosedBadge}>
                    <Text style={S.hoursClosedText}>Closed</Text>
                  </View>
                )}
              </View>

              <Switch
                value={sch.isOpen}
                onValueChange={(v) => updateHours(day, "isOpen", v)}
                trackColor={{ false: C.gray200, true: accentColor }}
                thumbColor={sch.isOpen ? C.white : C.gray400}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
          );
        })}
      </View>

      <Text style={S.hoursHint}>
        Tap time fields to edit · Toggle to open/close a day
      </Text>
    </>
  );
}
