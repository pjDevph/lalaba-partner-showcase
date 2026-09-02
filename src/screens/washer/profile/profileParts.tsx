// src/screens/washer/profile/profileParts.tsx
// Small presentational pieces shared by the washer profile screen.

import React from "react";
import { View, Text } from "react-native";
import { COMP } from "../../../theme/tokens";
import { profileStyles as styles } from "./profile.styles";

// ─── Section wrappers ─────────────────────────────────────────────────────────

export function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export function FieldLabel({ label }: Readonly<{ label: string }>) {
  return <Text style={COMP.fieldLabel}>{label}</Text>;
}
