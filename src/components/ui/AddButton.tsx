// Shared "Add" trigger button — one component for every screen's header
// add action ("link") and empty-state primary CTA ("cta").

import React from "react";
import { Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { C, SHADOW, SP } from "../../theme/tokens";

type AddButtonVariant = "link" | "cta";

interface AddButtonProps {
  label: string;
  onPress: () => void;
  variant?: AddButtonVariant;
  disabled?: boolean;
  style?: ViewStyle;
  /** White text for use on a colored (blue) header instead of the brand-blue default. */
  onColor?: boolean;
}

export function AddButton({ label, onPress, variant = "link", disabled, style, onColor }: Readonly<AddButtonProps>) {
  if (variant === "cta") {
    return (
      <TouchableOpacity
        style={[
          {
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: SP._8, backgroundColor: C.brand500,
            borderRadius: 14, paddingVertical: 14,
            ...SHADOW.xs,
          },
          disabled && { opacity: 0.4 },
          style,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
      >
        <View style={{
          width: 24, height: 24, borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 15, fontWeight: "800", color: C.white, lineHeight: 16 }}>+</Text>
        </View>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.white }}>{label}</Text>
      </TouchableOpacity>
    );
  }

  const linkColor = onColor
    ? (disabled ? "rgba(255,255,255,0.5)" : C.white)
    : (disabled ? C.gray300 : C.brand500);
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: linkColor }}>
        + {label}
      </Text>
    </TouchableOpacity>
  );
}
