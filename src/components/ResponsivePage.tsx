// Lalaba Merchant — ResponsivePage
// Reusable page scaffold that gives every screen consistent, screen-aware margins.
//
// It handles the boilerplate each screen otherwise repeats:
//   SafeArea → keyboard avoidance → (optional) scroll → responsive horizontal
//   gutter → a centered content column capped at a readable max width.
//
// Drop a screen's body inside it and the margins adapt to phone/tablet/desktop.
//
//   <ResponsivePage>
//     {...screen content...}
//   </ResponsivePage>

import React from "react";
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ViewStyle,
  StyleProp,
} from "react-native";
import { SafeAreaView, Edge } from "react-native-safe-area-context";
import { useResponsive } from "../hooks/useResponsive";
import { C } from "../theme/tokens";

interface ResponsivePageProps {
  children: React.ReactNode;
  /** Scroll the content (default) or render it in a fixed flex container. */
  scroll?: boolean;
  /** Vertically center the content column (nice for short forms on tablets). */
  center?: boolean;
  /**
   * Maximize the content to fill the screen (GCash-style on tablets): adds
   * top/bottom margins equal to the gutter and stretches the column to fill
   * the remaining space. Removes the width cap unless `maxWidth` is given.
   */
  fill?: boolean;
  /** Override the content column's max width. Defaults to the responsive value. */
  maxWidth?: number;
  /** Page background. Defaults to the brand color used across auth screens. */
  backgroundColor?: string;
  /** Safe-area edges to apply. Defaults to the top edge only. */
  edges?: Edge[];
  /** Disable the KeyboardAvoidingView wrapper (e.g. screens without inputs). */
  keyboardAvoiding?: boolean;
  /** iOS offset for content sitting under a header (e.g. a stack header). */
  keyboardVerticalOffset?: number;
  /** Extra style for the centered content column. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra style for the scroll content container / outer flex container. */
  containerStyle?: StyleProp<ViewStyle>;
}

export function ResponsivePage({
  children,
  scroll = true,
  center = false,
  fill = false,
  maxWidth,
  backgroundColor = C.brand500,
  edges = ["top"],
  keyboardAvoiding = true,
  keyboardVerticalOffset = 0,
  contentStyle,
  containerStyle,
}: Readonly<ResponsivePageProps>) {
  const { gutter, maxContentWidth } = useResponsive();
  // In fill mode the column stretches edge-to-edge (minus gutter), so don't
  // cap its width unless the caller explicitly asks for one.
  const columnMaxWidth = maxWidth ?? (fill ? undefined : maxContentWidth);

  // Responsive gutter applied as horizontal padding; the inner column then
  // caps its width and centers itself, so margins grow on wider screens.
  // `fill` adds matching top/bottom margins so content is inset on all sides.
  const outerContainer: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: gutter,
    ...(fill ? { paddingVertical: gutter } : {}),
    ...(center ? { justifyContent: "center" } : {}),
  };

  const column: StyleProp<ViewStyle> = [
    { width: "100%", maxWidth: columnMaxWidth, alignSelf: "center" },
    fill && { flex: 1 },
    contentStyle,
  ];

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[outerContainer, containerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={column}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, outerContainer, containerStyle]}>
      <View style={column}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor }} edges={edges}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardVerticalOffset}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
