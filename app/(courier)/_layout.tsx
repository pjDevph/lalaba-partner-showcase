// app/(courier)/_layout.tsx
// Courier (delivery staff) tab navigator — Tasks · Map · Chat · History · Profile
// Mirrors the Washer stack: shared flat BottomTabBar, but with an indigo
// accent so the delivery-staff shell reads distinctly from Merchant (blue) and
// Washer (teal). Matches the "Courier staff dashboard" screen in the Partner
// App design board (Tasks · Chat · History · Profile).

import React from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../src/theme/tokens";
import { BottomTabBar, tabBarClearance, type BottomTabDef } from "../../src/components/BottomTabBar";
import { Ionicons } from "@expo/vector-icons";

// Courier brand sky — exact hex from the Partner App design board (frame 27)
const INDIGO = C.courier500;   // "#0284C7"

type IconProps = Readonly<{ color: string; size?: number }>;

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconTasks({ color, size = 22 }: IconProps) {
  return <Ionicons name="navigate-outline" size={size} color={color} />;
}

function IconMap({ color, size = 22 }: IconProps) {
  return <Ionicons name="map-outline" size={size} color={color} />;
}

function IconChat({ color, size = 22 }: IconProps) {
  return <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />;
}

function IconHistory({ color, size = 22 }: IconProps) {
  return <Ionicons name="time-outline" size={size} color={color} />;
}

function IconProfile({ color, size = 22 }: IconProps) {
  return <Ionicons name="person-outline" size={size} color={color} />;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const TABS: readonly BottomTabDef[] = [
  { name: "dashboard", label: "Tasks",   Icon: IconTasks },
  { name: "map",       label: "Map",     Icon: IconMap },
  { name: "chat",      label: "Chat",    Icon: IconChat },
  { name: "history",   label: "History", Icon: IconHistory },
  { name: "profile",   label: "Profile", Icon: IconProfile },
];

export default function CourierLayout() {
  const insets = useSafeAreaInsets();

  const sceneStyle = { paddingBottom: tabBarClearance(insets.bottom) };

  return (
    <Tabs
      // Sub-screens here are TAB routes hidden with href: null, not stack
      // pushes, so "back" is this navigator's backBehavior. The default
      // ("firstRoute") sent every back press to Tasks regardless of where you
      // came from — the same complaint staff raised about landing on POS.
      // "history" returns to the route you were actually on.
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle }}
      tabBar={(props) => (
        <BottomTabBar
          state={props.state}
          navigation={props.navigation}
          insets={insets}
          tabs={TABS}
          accentColor={INDIGO}
        />
      )}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Tasks" }} />
      {/* Map opts out of the shared bottom clearance: the map fills to the
          screen edge and its stop card floats over it, so padding here would
          leave a dead strip under the map instead. */}
      <Tabs.Screen name="map"       options={{ title: "Map", sceneStyle: { paddingBottom: 0 } }} />
      <Tabs.Screen name="chat"      options={{ title: "Chat" }} />
      <Tabs.Screen name="history"   options={{ title: "History" }} />
      <Tabs.Screen name="profile"   options={{ title: "Profile" }} />
      {/* task-detail.tsx — pickup / return leg, navigated to from a task card */}
      {/* Reached only from the header bell — deliberately not a tab, and not
          in TABS/SIDEBAR_ITEMS, so no permission gate hides its entry point. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="task-detail" options={{ href: null }} />
      {/* message-thread.tsx — one customer conversation, opened from Chat */}
      <Tabs.Screen name="message-thread" options={{ href: null }} />
      {/* legal.tsx — Terms / Privacy, opened from Profile */}
      <Tabs.Screen name="legal" options={{ href: null }} />
      {/* help.tsx — FAQ + support contacts, opened from Profile */}
      <Tabs.Screen name="help" options={{ href: null }} />
    </Tabs>
  );
}
