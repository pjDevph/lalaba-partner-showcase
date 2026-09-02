// Register screen shared UI — icon set, logo mark, Field input, Stepper. Extracted from app/register.tsx.
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import { S } from "./styles";

const LOGO_MARK = require("../../../assets/logo-mark.png");

export const I = {
  Back: ({ c = C.brand500 }: Readonly<{ c?: string }>) => (
    <Ionicons name="chevron-back" size={20} color={c} />
  ),
  Success: ({ c = C.brand500, s = 40 }: Readonly<{ c?: string; s?: number }>) => (
    <Ionicons name="checkmark-circle-outline" size={s} color={c} />
  ),
  Eye: ({ visible, c = C.gray400 }: Readonly<{ visible: boolean; c?: string }>) => (
    <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={c} />
  ),
  Check: ({ c = C.white, s = 12 }: Readonly<{ c?: string; s?: number }>) => (
    <Ionicons name="checkmark" size={s} color={c} />
  ),
  X: ({ c = C.gray500, s = 18 }: Readonly<{ c?: string; s?: number }>) => (
    <Ionicons name="close" size={s} color={c} />
  ),
  CheckSquare: ({ checked }: Readonly<{ checked: boolean }>) => (
    <Ionicons
      name={checked ? "checkbox" : "square-outline"}
      size={20}
      color={checked ? C.brand500 : C.gray300}
    />
  ),
};

export function LogoMark({ size = 44 }: Readonly<{ size?: number }>) {
  return (
    <Image
      source={LOGO_MARK}
      style={{ width: size, height: size, tintColor: C.white }}
      resizeMode="contain"
    />
  );
}

export const Field = React.forwardRef<TextInput, {
  readonly label: string;
  readonly required?: boolean;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onBlur?: () => void;
  readonly placeholder?: string;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly secure?: boolean;
  readonly showToggle?: boolean;
  readonly onToggleSecure?: () => void;
  readonly hint?: string;
  readonly error?: string;
  readonly success?: string;
  readonly autoCapitalize?: "none" | "sentences" | "words";
  readonly numeric?: boolean;
  readonly maxLength?: number;
  readonly autoFocus?: boolean;
  readonly returnKeyType?: "next" | "go" | "done" | "search" | "send";
  readonly onSubmitEditing?: () => void;
}>(function Field(
  { label, required, value, onChange, onBlur, placeholder, keyboardType, secure, showToggle, onToggleSecure, hint, error, success, autoCapitalize, numeric, maxLength, autoFocus, returnKeyType, onSubmitEditing },
  ref
) {
  const [focused, setFocused] = useState(false);
  // Block any non-digit so numeric fields (e.g. mobile) can't take letters/symbols.
  const handleChange = (v: string) => onChange(numeric ? v.replace(/\D/g, "") : v);
  let fieldFooter: React.ReactNode = null;
  if (error)        fieldFooter = <Text style={S.fieldError}>{error}</Text>;
  else if (success) fieldFooter = <Text style={S.fieldSuccess}>{success}</Text>;
  else if (hint)    fieldFooter = <Text style={S.fieldHint}>{hint}</Text>;

  return (
    <View style={S.fieldWrap}>
      <Text style={S.fieldLabel}>
        {label.endsWith(" *") ? label.slice(0, -2) : label}
        {(required || label.endsWith(" *")) && <Text style={{ color: C.error500, fontWeight: "700" }}> *</Text>}
      </Text>
      <View style={S.fieldInputWrap}>
        <TextInput
          ref={ref}
          style={[
            S.fieldInput,
            focused && S.fieldInputFocused,
            error && S.fieldInputError,
            showToggle !== undefined && { paddingRight: 54 },
          ]}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={C.gray400}
          keyboardType={keyboardType ?? "default"}
          maxLength={maxLength}
          secureTextEntry={!!secure && !showToggle}
          autoCapitalize={autoCapitalize ?? "sentences"}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === "go" || returnKeyType === "done"}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur?.(); }}
        />

        {secure !== undefined && onToggleSecure && (
          <TouchableOpacity
            style={S.eyeBtn}
            onPress={onToggleSecure}
            activeOpacity={0.7}
          >
            <I.Eye visible={showToggle ?? false} c={C.gray400} />
          </TouchableOpacity>
        )}
      </View>
      {fieldFooter}
    </View>
  );
});

// ─── Compact stepper ──────────────────────────────────────────────────────────
export function Stepper({ step, total, label }: { readonly step: number; readonly total: number; readonly label: string }) {
  return (
    <View style={S.stepper}>
      <View style={S.stepperDots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              S.stepperDot,
              i < step - 1 && S.stepperDotDone,
              i === step - 1 && S.stepperDotActive,
            ]}
          />
        ))}
      </View>
      <Text style={S.stepperText}>
        Step {step} of {total} —{" "}
        <Text style={S.stepperLabel}>{label}</Text>
      </Text>
    </View>
  );
}

export type Step = 1 | 2 | 3;

export function getAuthRedirectRoute(role: string): string {
  return role.toUpperCase() === "WASHER"
    ? "/(washer)/dashboard"
    : "/(tabs)/dashboard";
}


export interface PwRules { length: boolean; uppercase: boolean; lowercase: boolean; number: boolean; special: boolean }

// Live password-requirements checklist. Shared by both Step-2 layouts.
export function PasswordRules({ rules, style }: Readonly<{ rules: PwRules; style?: object }>) {
  return (
    <View style={[{ marginTop: 6, marginBottom: 2, gap: 3 }, style]}>
      {([
        { ok: rules.length,    label: "At least 8 characters" },
        { ok: rules.uppercase, label: "Uppercase letter (A–Z)" },
        { ok: rules.lowercase, label: "Lowercase letter (a–z)" },
        { ok: rules.number,    label: "Number (0–9)" },
        { ok: rules.special,   label: "Special character (@, #, !…)" },
      ] as const).map(({ ok, label }) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: ok ? "#16A34A" : "#EF4444", width: 14 }}>
            {ok ? "✓" : "✗"}
          </Text>
          <Text style={{ fontSize: 12, color: ok ? "#16A34A" : "#6B7280" }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}
