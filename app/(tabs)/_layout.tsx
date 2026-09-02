// app/(tabs)/_layout.tsx
// Portrait → custom notched bottom tab bar.
// Landscape → collapsible sidebar: 64px icon-rail (collapsed) / 220px icon+label (expanded).
// Uses LayoutAnimation (not Animated.Value) so width changes work on Android Fabric.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Tabs, usePathname } from "expo-router";
import {
  Platform, View,
  Dimensions, LayoutAnimation, UIManager,
} from "react-native";

// Enable LayoutAnimation on Android (required for the new architecture)
if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInventoryStore } from "../../src/stores/inventoryStore";
import { useUIStore } from "../../src/stores/uiStore";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useWalletStore, isNotVisible } from "../../src/stores/walletStore";
import { useActiveStaffStore } from "../../src/stores/activeStaffStore";
import { can, type PermissionKey, type PermissionMap } from "../../src/types/permissions";
import { COSTING_ENABLED } from "../../src/features/costing/costing";
import { C } from "../../src/theme/tokens";
import { BottomTabBar, tabBarClearance, type BottomTabDef } from "../../src/components/BottomTabBar";
import { AppSidebar, SIDEBAR_MINI, SIDEBAR_FULL, type SidebarItem, type NavGroup } from "../../src/components/AppSidebar";
import { AvatarMenu } from "../../src/screens/dashboard/AvatarMenu";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";

// ─── Icons ───────────────────────────────────────────────────────────────────

type IconProps = Readonly<{ color: string; size?: number }>;

function IconDashboard({ color, size = 22 }: IconProps) {
  return <Ionicons name="grid-outline" size={size} color={color} />;
}

function IconHome({ color, size = 22 }: IconProps) {
  return <Ionicons name="home-outline" size={size} color={color} />;
}

function IconWallet({ color, size = 22 }: IconProps) {
  return <Ionicons name="wallet-outline" size={size} color={color} />;
}

function IconPOS({ color, size = 22 }: IconProps) {
  return <MaterialCommunityIcons name="cash-register" size={size} color={color} />;
}

function IconOnlineOrders({ color, size = 22 }: IconProps) {
  return <Ionicons name="receipt-outline" size={size} color={color} />;
}

function IconServices({ color, size = 22 }: IconProps) {
  return <Ionicons name="pricetag-outline" size={size} color={color} />;
}

function IconCosting({ color, size = 22 }: IconProps) {
  return <FontAwesome5 name="dollar-sign" size={size} color={color} />;
}

function IconInventory({ color, size = 22 }: IconProps) {
  return <MaterialCommunityIcons name="cube-outline" size={size} color={color} />;
}

function IconReports({ color, size = 22 }: IconProps) {
  return <Ionicons name="bar-chart-outline" size={size} color={color} />;
}

function IconSettings({ color, size = 22 }: IconProps) {
  return <Ionicons name="settings-outline" size={size} color={color} />;
}

// ─── Nav definitions ──────────────────────────────────────────────────────────

const SIDEBAR_NAV: readonly SidebarItem[] = [
  // Main
  { name: "dashboard", label: "Dashboard",    Icon: IconDashboard, group: "main" },
  { name: "pos",       label: "POS Terminal", Icon: IconPOS,       group: "main" },
  { name: "services",  label: "Services",     Icon: IconServices,  group: "main" },
  // Operations
  // Phase 2: Costing feature deferred — restored via COSTING_ENABLED
  ...(COSTING_ENABLED ? [{ name: "costing", label: "Daily Costing", Icon: IconCosting, group: "operations" } as SidebarItem] : []),
  { name: "inventory", label: "Inventory",     Icon: IconInventory, group: "operations" },
  { name: "sales",     label: "Reports",       Icon: IconReports,   group: "operations" },
  // Account
  { name: "wallet",    label: "Wallet",        Icon: IconWallet,    group: "account" },
  { name: "settings",  label: "Settings",      Icon: IconSettings,  group: "account", badge: true },
];

const GROUP_LABELS: Record<NavGroup, string> = {
  main:       "MAIN",
  operations: "OPERATIONS",
  account:    "ACCOUNT",
};

// Permission-gated nav items: a sidebar entry only shows when the user holds at
// least one of the listed permissions. Items without an entry here (dashboard,
// POS, settings) are always shown. Owners resolve to all-true, so they see
// everything; staff see only the areas they're granted. Inventory covers the
// Products tab too, since Products lives inside the Inventory screen.
const NAV_PERMISSION_GATES: Readonly<Record<string, readonly PermissionKey[]>> = {
  services:  ["canViewServices", "canAddService", "canEditService", "canArchiveService"],
  inventory: ["canAddInventory", "canEditInventory", "canArchiveInventory", "canAddProduct", "canEditProduct", "canArchiveProduct"],
  sales:     ["canViewSalesReports", "canExportReports"],
};

// Mirrors useCan's source selection: a shared-terminal shift uses the active
// staff's effective map, otherwise the signed-in user's resolved map.
function navItemVisible(item: SidebarItem, perms: PermissionMap | null): boolean {
  const gate = NAV_PERMISSION_GATES[item.name];
  if (!gate) return true;
  return gate.some((k) => can(perms, k));
}

// Bottom tab items (portrait) — Home · Orders · POS · Wallet · Settings.
const PORTRAIT_TABS = (badge: number, needsTopUp: boolean): readonly BottomTabDef[] => [
  { name: "dashboard",     label: "Home",     Icon: IconHome },
  { name: "online-orders", label: "Orders",   Icon: IconOnlineOrders },
  { name: "pos",           label: "POS",      Icon: IconPOS },
  { name: "wallet",        label: "Wallet",   Icon: IconWallet, badgeDot: needsTopUp },
  { name: "settings",      label: "Settings", Icon: IconSettings, badgeCount: badge },
];

// ─── Root layout ──────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // Screen dimensions — stable across keyboard open/close
  const [dims, setDims] = useState(() => Dimensions.get("screen"));
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => setDims(screen));
    return () => sub.remove();
  }, []);
  const landscape = dims.width > dims.height;

  const lowStock           = useInventoryStore((s) => s.lowStock);
  const badge              = lowStock.length;
  const posFullScreen      = useUIStore((s) => s.posFullScreen);
  const user               = useAuthStore((s) => s.user);

  // Wallet tab red dot — the resolved branch's fee wallet is below minimum.
  const branches           = useMerchantStore((s) => s.branches);
  const selectedBranchId   = useMerchantStore((s) => s.selectedBranchId);
  const deviceBranchId     = useAuthStore((s) => s.deviceBranchId);
  const activeBranchId     = useAuthStore((s) => s.activeBranchId);
  const walletBranchId     = selectedBranchId ?? deviceBranchId ?? activeBranchId ?? branches[0]?.id ?? null;
  const balanceCentavos    = useWalletStore((s) => s.balanceCentavos);
  const activatedAt        = useWalletStore((s) => s.activatedAt);
  const loadWallet         = useWalletStore((s) => s.load);
  useEffect(() => { if (walletBranchId) void loadWallet(walletBranchId); }, [walletBranchId, loadWallet]);
  const needsTopUp         = isNotVisible(balanceCentavos, activatedAt);

  // Permission-driven nav: filter the sidebar to the areas this identity can
  // access. Same source selection as useCan — active shift → effective map,
  // otherwise the signed-in user's resolved map.
  const activeStaff          = useActiveStaffStore((s) => s.activeStaff);
  const effectivePermissions = useActiveStaffStore((s) => s.effectivePermissions);
  const resolvedPermissions  = useAuthStore((s) => s.resolvedPermissions);
  const permMap              = activeStaff ? effectivePermissions : resolvedPermissions;
  const visibleNav           = useMemo(
    () => SIDEBAR_NAV.filter((item) => navItemVisible(item, permMap)),
    [permMap],
  );
  // Initial shown in the global landscape avatar (top-right, all screens).
  const avatarInitials     = (user?.displayName?.trim()?.[0] ?? "M").toUpperCase();
  // Reports renders its own inline avatar next to Export, so skip the global one there.
  const pathname           = usePathname();
  const onReports          = pathname.endsWith("/sales");

  const [sidebarOpen, setSidebarOpen] = useState(true); // start expanded so labels are visible

  // Collapse when rotating to portrait
  useEffect(() => { if (!landscape) setSidebarOpen(false); }, [landscape]);

  const toggleSidebar = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSidebarOpen((v) => !v);
  }, []);

  const sidebarW = sidebarOpen ? SIDEBAR_FULL : SIDEBAR_MINI;

  const sceneStyle = {
    paddingBottom: posFullScreen || landscape ? 0 : tabBarClearance(insets.bottom),
    paddingLeft:   landscape ? sidebarW : 0,
  };

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      // Sub-screens here are TAB routes hidden with href: null, not stack
      // pushes, so "back" is this navigator's backBehavior. The default
      // ("firstRoute") sent every back press to Dashboard regardless of where you
      // came from — the same complaint staff raised about landing on POS.
      // "history" returns to the route you were actually on.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        // Every landscape screen (Settings included) reserves room for the
        // persistent sidebar — see the tabBar below.
        sceneStyle,
      }}
      tabBar={(props) => {
        if (posFullScreen) return null;
        if (landscape) {
          // Persistent sidebar on every landscape tab, Settings included.
          return (
            <AppSidebar
              state={props.state}
              navigation={props.navigation}
              badge={badge}
              isOpen={sidebarOpen}
              onToggle={toggleSidebar}
              navItems={visibleNav}
              groupLabels={GROUP_LABELS}
            />
          );
        }
        return (
          <BottomTabBar
            state={props.state}
            navigation={props.navigation}
            insets={insets}
            tabs={PORTRAIT_TABS(badge, needsTopUp)}
            accentColor={C.brand500}
          />
        );
      }}
    >
      <Tabs.Screen name="dashboard"     options={{ title: "Home" }} />
      <Tabs.Screen name="online-orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="pos"           options={{ title: "POS" }} />
      <Tabs.Screen name="wallet"        options={{ title: "Wallet" }} />
      <Tabs.Screen name="settings"      options={{ title: "Settings" }} />
      {/* Reached only from the header bell — deliberately not a tab, and not
          in TABS/SIDEBAR_ITEMS, so no permission gate hides its entry point. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="services"       options={{ href: null }} />
      <Tabs.Screen name="booking-availability" options={{ href: null }} />
      <Tabs.Screen name="inventory"      options={{ href: null }} />
      <Tabs.Screen name="sales"          options={{ href: null }} />
      <Tabs.Screen name="tasks"          options={{ href: null }} />
      <Tabs.Screen name="costing"        options={{ href: null }} />
      <Tabs.Screen name="chat"           options={{ href: null }} />
      <Tabs.Screen name="message-thread" options={{ href: null }} />
      <Tabs.Screen name="support-thread" options={{ href: null }} />
      <Tabs.Screen name="support-new"    options={{ href: null }} />
      {/* Self-assigned pickup/return leg — the exact courier screens, reused
          in the merchant's own shell. See ProviderOrders.tsx. */}
      <Tabs.Screen name="task-detail"    options={{ href: null }} />
      <Tabs.Screen name="courier-thread" options={{ href: null }} />
      <Tabs.Screen name="preview"        options={{ href: null }} />
    </Tabs>

    {/* Global account avatar — top-right on every landscape screen (POS Terminal,
        Reports, Inventory, …). Hidden in POS full-screen and in portrait (where
        the Dashboard header carries it). box-none so only the avatar is tappable. */}
    {landscape && !posFullScreen && !onReports && (
      <View
        style={{ position: "absolute", top: insets.top + 8, right: 12, zIndex: 30 }}
        pointerEvents="box-none"
      >
        <AvatarMenu initials={avatarInitials} solid />
      </View>
    )}
    </View>
  );
}

