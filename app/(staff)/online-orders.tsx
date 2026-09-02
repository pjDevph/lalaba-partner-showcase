// app/(staff)/online-orders.tsx
// Staff › Online Orders — the same <ProviderOrders> the owner sees, mounted in
// the STAFF stack.
//
// A separate route rather than sending staff to /(tabs)/online-orders: (tabs)
// is the OWNER's workspace, and dropping a staff member into it to reach one
// screen puts them one navigation away from wallet, payouts, branch config and
// staff management. The screen is shared; the stack boundary is not.
//
// Visible only to a staff member holding Orders on the branch they are working.
// The tab is hidden without it and this screen refuses to render — but neither
// is the real gate: the backend re-checks the branch grant on every call, so a
// stale deep link gets a rejection rather than data.

import React from "react";
import { View, Text } from "react-native";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { C, SP } from "../../src/theme/tokens";
import { ProviderOrders } from "../../src/components/ProviderOrders";
import { useEffectivePermissions } from "../../src/hooks/usePermission";
import { StaffNotificationBell } from "../../src/components/staff/StaffNotificationBell";
import { canAccessStaffDestination } from "../../src/features/staff/staffNav";

export default function StaffOnlineOrders() {
  // Staff are pinned to their approved device's branch — never the owner's
  // selectedBranchId, which can drift for a staff session.
  const branchId = useAuthStore((s) => s.deviceBranchId ?? s.activeBranchId);
  const branches = useMerchantStore((s) => s.branches);
  // The SAME check the tab and sidebar use, so a visible entry point always
  // works. These disagreed once: the nav accepted any order permission, this
  // demanded canCreateOrder.
  const perms = useEffectivePermissions();
  const canViewOrders = canAccessStaffDestination(perms, "online-orders");

  if (!canViewOrders) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SP._24, backgroundColor: C.white }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray800, marginBottom: 6 }}>
          Orders access not granted
        </Text>
        <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 }}>
          Ask the owner to give you Orders access for this branch.
        </Text>
      </View>
    );
  }

  const branch = branches.find((b) => b.id === branchId);

  return (
    <ProviderOrders
      branchId={branchId}
      accent={{ base: C.brand500, bg: C.brand50, dark: C.brand700 }}
      acceptingOrders={branch ? branch.isOnline : undefined}
      title="Online Orders"
      subtitle="Marketplace pickups & deliveries"
      headerRight={<StaffNotificationBell />}
      selfCourierBasePath="/(staff)"
      ordersRoute="/(staff)/online-orders"
    />
  );
}
