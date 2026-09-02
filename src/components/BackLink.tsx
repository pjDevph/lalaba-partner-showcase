// src/components/BackLink.tsx
// A "‹ Label" back affordance for sub-screens that are pushed on top of a tab.
//
// The (washer) stack is a Tabs navigator with headerShown: false, so the
// non-tab routes registered with `href: null` (profile, staff, earnings,
// fee-balance, …) get NO chrome of their own. Anything that doesn't draw its
// own control is a dead end on iOS, where there is no hardware back — the only
// way out is the tab bar. Screens were each hand-rolling this, so some simply
// never got one.
//
// Falls back to `fallback` when there is nothing to pop (deep link, reload).

import React from "react";
import { Text, TouchableOpacity, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { C, SP } from "../theme/tokens";

export function BackLink({
  label = "Back",
  fallback,
  color = C.washer500,
  style,
}: Readonly<{
  label?: string;
  /** Where to go when the stack is empty. */
  fallback: Href;
  color?: string;
  style?: ViewStyle;
}>) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      hitSlop={8}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={[{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginBottom: SP._8 }, style]}
    >
      <Ionicons name="chevron-back" size={20} color={color} />
      <Text style={{ fontSize: 15, fontWeight: "600", color }}>{label}</Text>
    </TouchableOpacity>
  );
}
