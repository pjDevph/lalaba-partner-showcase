// app/(washer)/_layout.tsx
// Home washer tab navigator — Home · Orders · Chat · Wallet · Settings.
// New provider shell (2026-08): Chat is promoted to a first-class tab (the
// customer↔washer inbox), money lives under Wallet, and the old Business hub
// becomes Settings (Storefront, Staff, Certification, Account). Earnings, the
// marketplace store, certification, verification, personal profile, fee
// balance, staff, and the chat thread are non-tab sub-screens reached from
// these tabs.

import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../src/theme/tokens";
import { BottomTabBar, tabBarClearance, type BottomTabDef } from "../../src/components/BottomTabBar";
import { Ionicons } from "@expo/vector-icons";
import { useWasherStore } from "../../src/stores/washerStore";
import { useWalletStore, isNotVisible } from "../../src/stores/walletStore";

// Washer brand teal — exact hex from the Partner App design board (frame 25)
const TEAL = C.washer500;   // "#168A7A"

type IconProps = Readonly<{ color: string; size?: number }>;

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome({ color, size = 22 }: IconProps) {
  return <Ionicons name="home-outline" size={size} color={color} />;
}
function IconOrders({ color, size = 22 }: IconProps) {
  return <Ionicons name="receipt-outline" size={size} color={color} />;
}
function IconChat({ color, size = 22 }: IconProps) {
  return <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />;
}
function IconWallet({ color, size = 22 }: IconProps) {
  return <Ionicons name="wallet-outline" size={size} color={color} />;
}
function IconSettings({ color, size = 22 }: IconProps) {
  return <Ionicons name="settings-outline" size={size} color={color} />;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function WasherLayout() {
  const insets = useSafeAreaInsets();

  // Fee-wallet balance drives the "top up" red dot on the Wallet tab. Fetched
  // here (parent of every tab) so the dot shows regardless of which tab loads.
  const branchId = useWasherStore((s) => s.profile?.branchId ?? null);
  const balanceCentavos = useWalletStore((s) => s.balanceCentavos);
  const activatedAt = useWalletStore((s) => s.activatedAt);
  const loadBalance = useWalletStore((s) => s.load);
  useEffect(() => {
    if (branchId) void loadBalance(branchId);
  }, [branchId, loadBalance]);
  const needsTopUp = isNotVisible(balanceCentavos, activatedAt);

  const TABS: readonly BottomTabDef[] = [
    { name: "dashboard", label: "Home",     Icon: IconHome },
    { name: "orders",    label: "Orders",   Icon: IconOrders },
    { name: "chat",      label: "Chat",     Icon: IconChat },
    { name: "wallet",    label: "Wallet",   Icon: IconWallet, badgeDot: needsTopUp },
    { name: "settings",  label: "Settings", Icon: IconSettings },
  ];

  const sceneStyle = { paddingBottom: tabBarClearance(insets.bottom) };

  return (
    <Tabs
      // Every sub-screen below is a TAB route hidden with href: null, not a
      // stack push — so "back" is the tab navigator's backBehavior, whose
      // default ("firstRoute") sent every back press to Home no matter where
      // you came from. "history" returns to the route you were actually on, so
      // Settings › Business profile › back lands on Settings.
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle }}
      tabBar={(props) => (
        <BottomTabBar
          state={props.state}
          navigation={props.navigation}
          insets={insets}
          tabs={TABS}
          accentColor={TEAL}
        />
      )}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="orders"    options={{ title: "Orders" }} />
      <Tabs.Screen name="chat"      options={{ title: "Chat" }} />
      <Tabs.Screen name="wallet"    options={{ title: "Wallet" }} />
      <Tabs.Screen name="settings"  options={{ title: "Settings" }} />

      {/* Non-tab sub-screens, reached from the tabs above */}
      {/* Reached only from the header bell — deliberately not a tab, and not
          in TABS/SIDEBAR_ITEMS, so no permission gate hides its entry point. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="fee-balance"    options={{ href: null }} />
      <Tabs.Screen name="staff"          options={{ href: null }} />
      {/* profile.tsx is now just a redirect to services — kept for old links. */}
      <Tabs.Screen name="profile"        options={{ href: null }} />
      <Tabs.Screen name="services"       options={{ href: null }} />
      <Tabs.Screen name="address"        options={{ href: null }} />
      <Tabs.Screen name="reports"        options={{ href: null }} />
      <Tabs.Screen name="help"           options={{ href: null }} />
      <Tabs.Screen name="legal"          options={{ href: null }} />
      <Tabs.Screen name="account"        options={{ href: null }} />
      <Tabs.Screen name="certification"  options={{ href: null }} />
      <Tabs.Screen name="verification"   options={{ href: null }} />
      <Tabs.Screen name="store"          options={{ href: null }} />
      <Tabs.Screen name="preview"        options={{ href: null }} />
      <Tabs.Screen name="message-thread" options={{ href: null }} />
      <Tabs.Screen name="support-thread" options={{ href: null }} />
      <Tabs.Screen name="support-new"    options={{ href: null }} />
      {/* Self-assigned pickup/return leg — the exact courier screens, reused
          in the washer's own shell. See ProviderOrders.tsx. */}
      <Tabs.Screen name="task-detail"    options={{ href: null }} />
      <Tabs.Screen name="courier-thread" options={{ href: null }} />
    </Tabs>
  );
}
