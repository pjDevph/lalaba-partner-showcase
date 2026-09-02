// src/components/OptionField.tsx
// A field that opens a sheet listing its options. Deliberately built on the
// same shape as DateField.tsx — trigger row, translucent backdrop, sheet with
// Cancel / confirm — because the two render side by side inside the
// verification upload cards, and a second visual language there would read as
// an accident.
//
// Not to be confused with the two screen-local `SelectField`s in
// src/screens/inventory/shared.tsx and src/screens/services/FormComponents.tsx:
// those are inline dropdowns keyed on label strings with caller-managed open
// state, which is a poor fit for an enum. This one owns its own open state and
// speaks {value,label} pairs, so callers never map labels back to values.

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";

export interface OptionFieldOption<T extends string> {
  value: T;
  label: string;
}

export function OptionField<T extends string>({
  value,
  options,
  onChange,
  placeholder = "Select an option",
  sheetTitle = "Select",
  confirmLabel = "Confirm",
  disabled = false,
}: Readonly<{
  value: T | null;
  options: readonly OptionFieldOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  sheetTitle?: string;
  confirmLabel?: string;
  /** Locks the field — used while a document of this group is under review. */
  disabled?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  // Held until confirm so backing out of the sheet leaves the current choice
  // alone, matching DateField. Re-seeded on every open, never on render, or an
  // in-flight edit would be clobbered by a parent re-render.
  const [draft, setDraft] = useState<T | null>(value);

  const selected = options.find((o) => o.value === value) ?? null;

  const openSheet = () => {
    if (disabled) return;
    setDraft(value);
    setOpen(true);
  };

  const confirm = () => {
    if (draft) onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[s.field, disabled && s.fieldDisabled]}
        onPress={openSheet}
        activeOpacity={disabled ? 1 : 0.7}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel={selected ? selected.label : placeholder}
      >
        <Text style={selected ? s.fieldText : s.fieldPlaceholder}>
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons
          name="chevron-down"
          size={18}
          color={selected && !disabled ? C.brand500 : C.gray400}
        />
      </TouchableOpacity>

      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={s.backdrop}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          <TouchableOpacity style={s.sheet} activeOpacity={1}>
            <Text style={s.sheetTitle}>{sheetTitle}</Text>

            {/* Bounded rather than free-growing: the list is long enough to run
                off a small phone, and a sheet taller than the screen loses its
                own action buttons. */}
            <ScrollView style={s.list} bounces={false}>
              {options.map((option) => {
                const active = option.value === draft;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[s.option, active && s.optionActive]}
                    onPress={() => setDraft(option.value)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.optionText, active && s.optionTextActive]}>
                      {option.label}
                    </Text>
                    {active && (
                      <Ionicons name="checkmark" size={18} color={C.brand500} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={s.actions}>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => setOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.setBtn, !draft && s.setBtnDisabled]}
                onPress={confirm}
                disabled={!draft}
                activeOpacity={0.85}
              >
                <Text style={s.setBtnText}>{confirmLabel}</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.gray50,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.gray200,
    paddingHorizontal: SP._12,
    paddingVertical: SP._12,
  },
  fieldDisabled: { opacity: 0.55 },
  fieldText: { fontSize: 14, color: C.gray900, fontWeight: "600" },
  fieldPlaceholder: { fontSize: 14, color: C.gray400 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,40,60,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: SP._24,
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    padding: SP._20,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
    marginBottom: SP._12,
  },

  list: { maxHeight: 320 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP._12,
    paddingVertical: SP._12,
    borderRadius: RADIUS.md,
  },
  optionActive: { backgroundColor: C.brand100 },
  optionText: { fontSize: 14, fontWeight: "600", color: C.gray800 },
  optionTextActive: { color: C.brand700, fontWeight: "800" },

  actions: { flexDirection: "row", gap: SP._12, marginTop: SP._20 },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.gray100,
  },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: C.gray600 },
  setBtn: {
    flex: 2,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand500,
  },
  setBtnDisabled: { backgroundColor: C.gray300 },
  setBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
});
