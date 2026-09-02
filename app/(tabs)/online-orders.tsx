// app/(tabs)/online-orders.tsx
// Merchant › Online Orders — provider view of the shared online-orders domain,
// keyed on the merchant's branch. Thin wrapper over <ProviderOrders> (brand-blue
// accent). This is where marketplace orders created by the Customer app
// (providerType MERCHANT) land, alongside the Phase-1 POS orders.

import React from "react";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { C } from "../../src/theme/tokens";
import { ProviderOrders } from "../../src/components/ProviderOrders";
import { BranchSelectorBar } from "../../src/components/BranchSelectorBar";

export default function MerchantOnlineOrders() {
  // The operational "current branch": the owner's selected branch (set by the
  // BranchSelectorBar / POS), then the device-locked branch (staff), then the
  // sole/first branch.
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const branches = useMerchantStore((s) => s.branches);
  const deviceBranchId = useAuthStore((s) => s.deviceBranchId ?? s.activeBranchId);

  const branchId = selectedBranchId ?? deviceBranchId ?? branches[0]?.id ?? null;

  // A paused branch is invisible to customers — the empty state says that
  // rather than promising orders that can never arrive.
  const branch = branches.find((b) => b.id === branchId);

  return (
    <ProviderOrders
      branchId={branchId}
      accent={{ base: C.brand500, bg: C.brand50, dark: C.brand700 }}
      acceptingOrders={branch ? branch.isOnline : undefined}
      title="Online Orders"
      subtitle="Marketplace pickups & deliveries"
      headerAccessory={<BranchSelectorBar />}
      selfCourierBasePath="/(tabs)"
      ordersRoute="/(tabs)/online-orders"
    />
  );
}
