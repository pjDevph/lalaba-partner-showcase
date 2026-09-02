// src/components/LoadingOverlay.tsx
// Full-screen blocking loading overlay. Used during sign-in / registration so
// the user gets clear feedback and can't double-submit while the request +
// navigation are in flight.
//
// Implemented as an absolute-fill View, NOT a <Modal>. A native <Modal> opens a
// separate Dialog window that re-evaluates device orientation when it appears
// and again when it dismisses — in landscape that reads as the screen flipping
// (to portrait) while the overlay is up, then back once it hides. An in-app View
// never triggers that, so the orientation stays put. zIndex + elevation keep it
// above sibling content regardless of render order.

import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { C } from "../theme/tokens";

export function LoadingOverlay({
  visible,
  label,
}: Readonly<{ visible: boolean; label?: string }>) {
  if (!visible) return null;
  return (
    // pointerEvents defaults to "auto" — the backdrop swallows taps so the form
    // underneath can't be interacted with (prevents double-submit) while busy.
    <View style={s.backdrop}>
      <View style={s.card}>
        <ActivityIndicator size="large" color={C.brand500} />
        {!!label && <Text style={s.label}>{label}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.35)",
    alignItems: "center",
    justifyContent: "center",
    // Sit above everything else on the screen (cards elevation:3, sticky bar
    // elevation:8, etc.) on both iOS (zIndex) and Android (elevation).
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: "center",
    gap: 14,
    minWidth: 170,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  label: { fontSize: 14, fontWeight: "600", color: C.gray700 },
});
