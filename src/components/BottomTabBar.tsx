// src/components/BottomTabBar.tsx
// Flat bottom-tab bar shared by every role stack (Merchant, Staff, Washer,
// Courier). Replaces the previous floating "pill" bar and its raised bubble.
//
// Deliberately static: the active tab is indicated by colour alone — no motion,
// no raised bubble, no notch. That removes the spring animation and the SVG
// path recomputation the pill bar needed (RN can't natively animate an SVG `d`,
// so it re-rendered a new path every frame while switching tabs).
//
// The bar is anchored to the bottom edge and spans the full width, so unlike
// the floating pill it needs no side margins and its clearance is just its own
// height plus the safe-area inset.

import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import { C } from "../theme/tokens";

export type TabIconProps = Readonly<{ color: string; size?: number }>;

export type BottomTabDef = Readonly<{
  name: string;
  label: string;
  Icon: (p: TabIconProps) => React.JSX.Element;
  badgeCount?: number;
  /** A plain red attention dot (no number), e.g. "action needed". */
  badgeDot?: boolean;
}>;

type NavState = { index: number; routes: { key: string; name: string }[] };
// Structural, not imported from @react-navigation, so this component stays
// usable outside a navigator (tests, storybook). `type` is the literal this
// component actually emits rather than `string` — widening it is what forced
// every call site to cast `props.navigation as any`.
type Navigation = {
  emit: (e: {
    type: "tabPress";
    target: string;
    canPreventDefault: true;
  }) => { defaultPrevented: boolean };
  navigate: (name: string) => void;
};

export type BottomTabBarProps = Readonly<{
  state: NavState;
  navigation: Navigation;
  insets: { bottom: number; left: number; right: number };
  tabs: readonly BottomTabDef[];
  accentColor?: string;
}>;

const BAR_HEIGHT     = 62;   // content row; the safe-area inset is added below it
const ICON_SIZE      = 24;   // identical active/inactive — a size change reads as motion
const LABEL_SIZE     = 11;
const LABEL_GAP      = 3;
const INACTIVE_COLOR = C.gray400;

/**
 * Vertical space the bar occupies — callers use this for scene paddingBottom so
 * content isn't hidden behind it.
 */
export const tabBarClearance = (insetBottom: number) => BAR_HEIGHT + insetBottom;

export function BottomTabBar({
  state,
  navigation,
  insets,
  tabs,
  accentColor = C.brand500,
}: BottomTabBarProps) {
  const focusedName = state.routes[state.index]?.name;
  const sidePad = Math.max(insets.left, insets.right);

  return (
    <View
      style={[
        S.bar,
        {
          paddingBottom: insets.bottom,
          paddingLeft: sidePad,
          paddingRight: sidePad,
        },
      ]}
    >
      {tabs.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const isFocused = focusedName === tab.name;
        const color = isFocused ? accentColor : INACTIVE_COLOR;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={S.item}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
          >
            <View style={S.iconWrap}>
              <tab.Icon color={color} size={ICON_SIZE} />
              {!!tab.badgeCount && tab.badgeCount > 0 && (
                <View style={S.badge}>
                  <Text style={S.badgeText}>{tab.badgeCount > 99 ? "99+" : tab.badgeCount}</Text>
                </View>
              )}
              {tab.badgeDot && !tab.badgeCount && <View style={S.dot} />}
            </View>
            <Text
              numberOfLines={1}
              style={[S.label, { color, fontWeight: isFocused ? "700" : "500" }]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const S = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.gray200,
  },
  item: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: LABEL_GAP,
  },
  iconWrap: { width: ICON_SIZE, height: ICON_SIZE, alignItems: "center", justifyContent: "center" },
  label: { fontSize: LABEL_SIZE, includeFontPadding: false },

  badge: {
    position: "absolute",
    top: -5,
    left: ICON_SIZE / 2 + 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: C.error500,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: C.white },
  dot: {
    position: "absolute",
    top: -2,
    left: ICON_SIZE / 2 + 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.error500,
  },
});
