// src/components/AppSidebar.tsx
// Shared collapsible landscape sidebar: 64px icon-rail (collapsed) / 220px
// icon+label (expanded). Nav items are prop-driven so owner and staff stacks
// can each pass their own route list/icons/grouping.
// Uses LayoutAnimation (not Animated.Value) so width changes work on Android Fabric.

import React, { useCallback } from "react";
import {
  Pressable, TouchableOpacity, Text, View, StyleSheet, Image, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import { C } from "../theme/tokens";
import { Ionicons } from "@expo/vector-icons";

// ─── Sidebar constants ────────────────────────────────────────────────────────

export const SIDEBAR_MINI = 64;   // icon-only rail
export const SIDEBAR_FULL = 220;  // icon + label

// ─── Icons (shared chrome only — nav item icons are passed in via props) ──────

type IconProps = Readonly<{ color: string; size?: number }>;

function IconChevronLeft({ size = 16, color = "rgba(255,255,255,0.5)" }: { readonly size?: number; readonly color?: string }) {
  return <Ionicons name="chevron-back" size={size} color={color} />;
}

// ─── Sidebar colour theme ─────────────────────────────────────────────────────

const SB = {
  bg:          "#0077A8",          // dark tint of brand #00AEEF (same hue, L≈33%)
  border:      "rgba(255,255,255,0.08)",
  iconOff:     "rgba(255,255,255,0.55)",
  iconOn:      "#fff",
  lblOff:      "rgba(255,255,255,0.80)",
  lblOn:       "#fff",
  groupLbl:    "rgba(255,255,255,0.42)",
  rowActive:   "rgba(255,255,255,0.13)",
  strip:       "#fff",
  chevron:     "rgba(255,255,255,0.45)",
};

// ─── Nav definitions ──────────────────────────────────────────────────────────

export type NavGroup = string;
export type SidebarItem = Readonly<{
  name: string;
  label: string;
  Icon: (p: IconProps) => React.JSX.Element;
  group: NavGroup;
  badge?: boolean;
}>;

export type NavProps = Readonly<{
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    // "tabPress" is the only event emitted here; `string` was too wide and
    // forced every call site to cast `props.navigation as any`.
    emit: (e: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  badge: number;
}>;

const LOGO_MARK = require("../../assets/logo-mark.png");

export type AppSidebarProps = NavProps & {
  isOpen: boolean;
  onToggle: () => void;
  navItems: readonly SidebarItem[];
  groupLabels?: Partial<Record<NavGroup, string>>;
};

export function AppSidebar({
  state, navigation, badge, isOpen, onToggle, navItems, groupLabels = {},
}: AppSidebarProps) {
  const insets     = useSafeAreaInsets();
  const branchName = useAuthStore((s) => s.activeBranchName);

  const focusedName = state.routes[state.index]?.name;

  const handleNavPress = useCallback((routeKey: string, routeName: string, isFocused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) navigation.navigate(routeName);
  }, [navigation]);

  let lastGroup: NavGroup | null = null;

  const sidebarW = isOpen ? SIDEBAR_FULL : SIDEBAR_MINI;

  return (
    <View style={[S.sidebar, { width: sidebarW, paddingTop: insets.top }]}>

      {/* ── Header ──
          Mini: entire header row is tappable → expands sidebar.
          Full: logo + title on left, chevron button on right.
          This avoids layout-overflow in mini mode where a separate toggle
          button won't fit alongside the logo in 64px. */}
      {isOpen ? (
        <View style={S.sidebarHeader}>
          <Image source={LOGO_MARK} style={S.logoMark} resizeMode="contain" />
          <View style={S.headerText}>
            <Text style={S.headerAppName} numberOfLines={1}>Lalaba Partner</Text>
            <View style={S.headerBranchRow}>
              <View style={S.onlineDot} />
              <Text style={S.headerBranch} numberOfLines={1}>{branchName ?? "Main Branch"}</Text>
            </View>
          </View>
          <Pressable onPress={onToggle} hitSlop={10} style={S.toggleBtn}>
            <IconChevronLeft size={16} color={SB.chevron} />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={onToggle} style={S.sidebarHeaderMini}>
          <Image source={LOGO_MARK} style={S.logoMark} resizeMode="contain" />
        </Pressable>
      )}

      {/* ── Nav items (scrollable so long menus / short landscape heights don't clip) ── */}
      <ScrollView
        style={S.navScroll}
        contentContainerStyle={[S.navScrollContent, { paddingBottom: Math.max(insets.bottom, 12) }]}
        showsVerticalScrollIndicator={false}
      >
        {navItems.map((item) => {
          const route      = state.routes.find((r) => r.name === item.name);
          const isFocused  = focusedName === item.name;
          const iconColor  = isFocused ? SB.iconOn : SB.iconOff;
          const labelColor = isFocused ? SB.lblOn  : SB.lblOff;
          const groupLabel = groupLabels[item.group];
          const showGroup  = isOpen && !!groupLabel && item.group !== lastGroup;
          if (item.group !== lastGroup) lastGroup = item.group;

          return (
            <React.Fragment key={item.name}>
              {showGroup && (
                <Text style={S.groupLabel}>{groupLabel}</Text>
              )}
              <TouchableOpacity
                onPress={() =>
                  route
                    ? handleNavPress(route.key, item.name, isFocused)
                    : navigation.navigate(item.name)
                }
                activeOpacity={0.65}
                style={[
                  S.navItem,
                  !isOpen && S.navItemMini,
                  isFocused && S.navItemActive,
                ]}
              >
                {/* Active indicator strip — only in open mode */}
                {isOpen && (
                  <View style={[S.activeStrip, isFocused && S.activeStripVisible]} />
                )}

                <View style={S.navIconWrap}>
                  <item.Icon color={iconColor} size={18} />
                  {/* Badge dot in mini mode */}
                  {!isOpen && item.badge && badge > 0 && <View style={S.badgeDot} />}
                </View>

                {isOpen && (
                  <>
                    <Text
                      numberOfLines={1}
                      style={[S.navItemLabel, { color: labelColor, fontWeight: isFocused ? "700" : "500" }]}
                    >
                      {item.label}
                    </Text>
                    {/* Badge chip in open mode */}
                    {item.badge && badge > 0 && (
                      <View style={S.badgeChip}>
                        <Text style={S.badgeText}>{badge > 99 ? "99+" : badge}</Text>
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // ── Sidebar shell ──
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: SB.bg,
    borderRightWidth: 0,
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
    flexDirection: "column",
  },

  // ── Header ──
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    height: 64,
    paddingLeft: 14,
    paddingRight: 6,
    borderBottomWidth: 1,
    borderBottomColor: SB.border,
    gap: 8,
  },
  sidebarHeaderMini: {
    alignItems: "center",
    justifyContent: "center",
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: SB.border,
  },
  logoMark: {
    width: 30,
    height: 30,
    tintColor: "#fff",
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  toggleBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    flexShrink: 0,
  },
  headerAppName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.2,
  },
  headerBranchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
  },
  headerBranch: {
    fontSize: 11,
    color: "rgba(255,255,255,0.60)",
    fontWeight: "500",
  },

  // ── Nav list ──
  navScroll: {
    flex: 1,
  },
  navScrollContent: {
    paddingTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  groupLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: SB.groupLbl,
    letterSpacing: 1.0,
    marginTop: 18,
    marginBottom: 2,
    paddingLeft: 14,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 10,
    paddingRight: 10,
    marginBottom: 2,
  },
  // Mini mode: center the icon, no paddingRight needed
  navItemMini: {
    justifyContent: "center",
    paddingRight: 0,
  },
  navItemActive: {
    backgroundColor: SB.rowActive,
  },
  activeStrip: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: "transparent",
    marginRight: 10,
    flexShrink: 0,
  },
  activeStripVisible: {
    backgroundColor: SB.strip,
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navItemLabel: {
    flex: 1,
    fontSize: 13,
    letterSpacing: -0.2,
    marginLeft: 10,
  },

  // ── Badge ──
  badgeDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.error500,
    borderWidth: 1.5,
    borderColor: C.white,
  },
  badgeChip: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: C.error500,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  badgeText: {
    color: C.white,
    fontSize: 9,
    fontWeight: "700",
  },
});
