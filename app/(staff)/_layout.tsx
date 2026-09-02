// app/(staff)/_layout.tsx
// Portrait → bottom BottomTabBar: POS · Profile, plus a floating Menu button
// that opens the same sidebar as a drawer overlay (Tasks/Activity/Inventory,
// also still reachable from Profile). Landscape → the same collapsible
// sidebar the owner stack uses, surfacing all 5 screens directly.

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Tabs } from "expo-router";
import { LayoutAnimation } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../../src/theme/tokens";
import { useUIStore } from "../../src/stores/uiStore";
import { useAuthStore } from "../../src/stores/authStore";
import { useActiveStaffStore } from "../../src/stores/activeStaffStore";
import { type PermissionMap } from "../../src/types/permissions";
import {
  canAccessStaffDestination,
  type StaffDestination,
} from "../../src/features/staff/staffNav";
import { useResponsive } from "../../src/hooks/useResponsive";
import { BottomTabBar, tabBarClearance, type BottomTabDef } from "../../src/components/BottomTabBar";
import { AppSidebar, SIDEBAR_MINI, SIDEBAR_FULL, type SidebarItem } from "../../src/components/AppSidebar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// Permission-gated staff nav: an item shows only when the staff holds at least
// one of the listed permissions. Items absent here (POS, Profile, Activity/order
// history) are always shown. Inventory covers the Products tab. This is what
// makes ticking a permission for a staff member add the screen to their nav.

// Both navigation surfaces here, the WORK list in More, and each screen's own
// route guard read the SAME definition — see features/staff/staffNav. They
// disagreed once already: the nav accepted any order permission while the route
// demanded canCreateOrder, so a partial grant showed a tab that then refused.
function navItemVisible(item: SidebarItem, perms: PermissionMap | null): boolean {
  return canAccessStaffDestination(perms, item.name as StaffDestination);
}

type IconProps = Readonly<{ color: string; size?: number }>;

function IconPOS({ color, size = 22 }: IconProps) {
  return <MaterialCommunityIcons name="cash-register" size={size} color={color} />;
}

function IconProfile({ color, size = 22 }: IconProps) {
  return <Ionicons name="person-outline" size={size} color={color} />;
}

function IconOrders({ color, size = 22 }: IconProps) {
  return <Ionicons name="receipt-outline" size={size} color={color} />;
}

function IconChat({ color, size = 22 }: IconProps) {
  return <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />;
}

function IconMore({ color, size = 22 }: IconProps) {
  return <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />;
}

// Phase 2: Tasks feature deferred, icon unused for now.
// function IconTasks({ color, size = 22 }: IconProps) {
//   return (
//     <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
//       <Path d="M9 11l3 3L22 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
//       <Path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
//     </Svg>
//   );
// }

function IconActivity({ color, size = 22 }: IconProps) {
  return <Ionicons name="pulse" size={size} color={color} />;
}

function IconInventory({ color, size = 22 }: IconProps) {
  return <MaterialCommunityIcons name="cube-outline" size={size} color={color} />;
}

function IconServices({ color, size = 22 }: IconProps) {
  return <Ionicons name="pricetag-outline" size={size} color={color} />;
}

function IconReports({ color, size = 22 }: IconProps) {
  return <Ionicons name="bar-chart-outline" size={size} color={color} />;
}

function IconProducts({ color, size = 22 }: IconProps) {
  return <Ionicons name="pricetags-outline" size={size} color={color} />;
}


export default function StaffLayout() {
  const insets = useSafeAreaInsets();
  const posFullScreen = useUIStore((s) => s.posFullScreen);

  const { isLandscape } = useResponsive();

  const [sidebarOpen, setSidebarOpen] = useState(true); // start expanded so labels are visible
  // Portrait-only: the sidebar shown as a dismissible drawer overlay, opened
  // from the floating Menu button so Tasks/Activity/Inventory are one tap
  // away without cramming a 3rd–5th icon into the bottom BottomTabBar.

  // Collapse when rotating to portrait
  useEffect(() => { if (!isLandscape) setSidebarOpen(false); }, [isLandscape]);

  const toggleSidebar = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSidebarOpen((v) => !v);
  }, []);

  const sidebarW = sidebarOpen ? SIDEBAR_FULL : SIDEBAR_MINI;

  // Bottom tabs, filtered the same way the sidebar is. Orders is the only
  // gated one: POS and Profile are every staff member's baseline.
  // Four destinations: sell, manage, communicate, everything else.
  //
  // "More" rather than "Profile" because the tab holds Inventory, Services,
  // Products and Activity as well as the account — filing tools under a
  // person's profile is the kind of naming that makes people stop looking.
  const ALL_TABS: readonly BottomTabDef[] = useMemo(() => [
    { name: "pos",           label: "POS",    Icon: IconPOS },
    { name: "online-orders", label: "Orders", Icon: IconOrders },
    { name: "chat",          label: "Chat",   Icon: IconChat },
    { name: "profile",       label: "More",   Icon: IconMore },
  ], []);

  const SIDEBAR_NAV: readonly SidebarItem[] = useMemo(() => [
    { name: "pos",           label: "POS",     Icon: IconPOS,     group: "main" },
    { name: "online-orders", label: "Orders",  Icon: IconOrders,  group: "main" },
    { name: "chat",          label: "Messages", Icon: IconChat,    group: "main" },
    { name: "profile",       label: "Profile", Icon: IconProfile, group: "main" },
    // Phase 2: Tasks feature deferred, sidebar entry hidden for now.
    // { name: "tasks",     label: "Tasks",     Icon: IconTasks,     group: "main", badge: true },
    { name: "activity",  label: "Activity",  Icon: IconActivity,  group: "main" },
    { name: "services",  label: "Services",  Icon: IconServices,  group: "main" },
    { name: "inventory", label: "Inventory", Icon: IconInventory, group: "main" },
    { name: "products",  label: "Products",  Icon: IconProducts,  group: "main" },
    { name: "sales",     label: "Reports",   Icon: IconReports,   group: "main" },
  ], []);

  // Filter the nav to the screens this staff member is permitted to see.
  // Same source selection as useCan: active shift → effective map, otherwise
  // the signed-in staff's resolved map.
  const shiftStaff           = useActiveStaffStore((s) => s.activeStaff);
  const effectivePermissions = useActiveStaffStore((s) => s.effectivePermissions);
  const resolvedPermissions  = useAuthStore((s) => s.resolvedPermissions);
  const permMap              = shiftStaff ? effectivePermissions : resolvedPermissions;
  const visibleNav           = useMemo(
    () => SIDEBAR_NAV.filter((item) => navItemVisible(item, permMap)),
    [SIDEBAR_NAV, permMap],
  );
  const TABS = useMemo(
    () => ALL_TABS.filter((t) => navItemVisible({ name: t.name } as SidebarItem, permMap)),
    [ALL_TABS, permMap],
  );

  const sceneStyle = {
    paddingBottom: posFullScreen || isLandscape ? 0 : tabBarClearance(insets.bottom),
    paddingLeft:   isLandscape ? sidebarW : 0,
  };

  return (
    <Tabs
      // Back returns to the tab you came FROM, not to POS.
      //
      // React Navigation defaults to "firstRoute", which is the Android
      // convention — back from any tab lands on the first one. It reads wrong
      // here because a staff member moves between POS, Orders and Chat
      // constantly during a shift, so "back" meaning "jump to POS" throws away
      // where they were rather than undoing one step.
      backBehavior="history"
      screenOptions={{ headerShown: false, sceneStyle }}
      tabBar={(props) => {
        if (posFullScreen) return null;
        if (isLandscape) {
          return (
            <AppSidebar
              state={props.state}
              navigation={props.navigation}
              badge={0}
              isOpen={sidebarOpen}
              onToggle={toggleSidebar}
              navItems={visibleNav}
            />
          );
        }
        // Portrait: the bottom bar is the ONLY navigation. The floating
        // hamburger that used to sit here opened a drawer duplicating it, so a
        // staff member had three ways to move around — bar, drawer, and the
        // links inside Profile — with no rule about which held what. "More"
        // now owns everything the drawer did, permission-gated.
        //
        // The landscape sidebar above stays: a tablet has the width for it, and
        // it is the only navigation there rather than a third one.
        return (
          <BottomTabBar
            state={props.state}
            navigation={props.navigation}
            insets={insets}
            tabs={TABS}
            accentColor={C.brand500}
          />
        );
      }}
    >
      <Tabs.Screen name="pos"      options={{ title: "POS" }} />
      {/* Registered always; the tab BAR is filtered by permission above, and
          the screen itself refuses to render without the grant. */}
      <Tabs.Screen name="online-orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="chat"           options={{ title: "Chat" }} />
      <Tabs.Screen name="message-thread" options={{ href: null }} />
      <Tabs.Screen name="profile"  options={{ title: "Profile" }} />
      {/* Hidden from the default tab list — reachable via the landscape sidebar or from Profile */}
      {/* Reached only from the header bell — deliberately not a tab, and not
          in TABS/SIDEBAR_ITEMS, so no permission gate hides its entry point. */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="tasks"     options={{ href: null }} />
      <Tabs.Screen name="activity"  options={{ href: null }} />
      <Tabs.Screen name="services"  options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="products"  options={{ href: null }} />
      <Tabs.Screen name="sales"     options={{ href: null }} />
    </Tabs>
  );
}
