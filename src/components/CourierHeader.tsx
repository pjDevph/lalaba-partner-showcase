// src/components/CourierHeader.tsx
// The one header shell for every screen in the (courier) stack.
//
// Before this existed each tab rolled its own: title sizes ranged 15/700 to
// 24/800, subtitles 12 to 13, two screens pinned a bar while two let the title
// scroll away, and Chat styled its header inline (which is how the values drifted
// in the first place). Switching tabs visibly shifted the top of the screen.
//
// Screens now pass content, never chrome — padding, background, border and the
// safe-area inset all live here, so the treatment changes in one place.

import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP } from "../theme/tokens";

export type CourierHeaderProps = Readonly<{
  /** Screen title. Omit when passing `children` (the identity-led screens). */
  title?: string;
  subtitle?: string;
  /** Trailing content on the title row, e.g. a count or action. */
  right?: React.ReactNode;
  /** Replaces the title block entirely — used by Tasks/Profile for their
   *  avatar + name rows, so they share the shell without faking a title. */
  children?: React.ReactNode;
  /** Extra content below the title block, e.g. the on-duty status chips. */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}>;

export function CourierHeader({
  title,
  subtitle,
  right,
  children,
  footer,
  style,
}: CourierHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + SP._10 }, style]}>
      {/* `right` is honoured whether or not the caller supplies children.
          It used to live inside the `children ?? (...)` fallback, so a screen
          passing its own identity block AND a right-hand action silently lost
          the action — which is why the courier dashboard rendered a
          notification bell that never appeared. */}
      <View style={styles.titleRow}>
        {/* Wrapped so a caller's own block expands and pushes `right` to the
            edge — callers style their content, not its position in this bar. */}
        <View style={styles.titleCol}>
          {children ?? (
            <>
              {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
            </>
          )}
        </View>
        {right}
      </View>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
    paddingHorizontal: SP._16,
    paddingBottom: SP._12,
    gap: SP._8,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  titleCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  subtitle: { fontSize: 13, color: C.gray500, marginTop: 1 },
});
