// app/(tabs)/inventory.tsx
// Lalaba Merchant — Inventory Management
// Level 1: Branch picker (skipped if single branch or STAFF with assigned branch)
// Level 2: Products list + logs for the selected branch

import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useAuthStore } from "../../src/stores/authStore";
import type { Branch } from "../../src/stores/merchantStore";
import { C } from "../../src/theme/tokens";
import { TopBar } from "../../src/components/ui";
import { BranchPickerView } from "../../src/components/BranchPickerView";
import { InventoryContent } from "../../src/screens/inventory/InventoryContent";

export default function InventoryScreen({ onBack: onBackProp, initialTab }: { readonly onBack?: () => void; readonly initialTab?: "inventory" | "products" } = {}) {
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();
  const _role = useAuthStore((s) => s.role);
  const goBack = onBackProp ?? (() => {
    if (fromSettings === "1") return router.replace("/(tabs)/settings");
    // Go back to wherever they came from. Staff used to be sent to POS
    // unconditionally, which was right when POS was their only tab — they now
    // reach this from More, and being thrown to POS loses their place.
    if (router.canGoBack()) return router.back();
    // No history (deep link, or a tab press that never pushed): land on the
    // screen that owns this one for each role.
    return router.replace(_role === "MERCHANT" ? "/(tabs)/settings" : "/(staff)/profile");
  });

  const branches         = useMerchantStore((s) => s.branches);
  const merchantLoading  = useMerchantStore((s) => s.isLoading);
  const loadMerchant     = useMerchantStore((s) => s.loadMerchant);
  const activeBranchId   = useAuthStore((s) => s.activeBranchId);
  const activeBranchName = useAuthStore((s) => s.activeBranchName);
  const merchantId       = useAuthStore((s) => s.merchantId);
  const role             = useAuthStore((s) => s.role);

  // Staff users have activeBranchId from their branchIds but merchantStore.branches
  // is empty (they don't own branches). Build a stub so the detail view can load.
  // Only branch.id and branch.name are used downstream; both come from the auth store.
  const staffBranchStub: Branch | null = (role !== "MERCHANT" && activeBranchId)
    ? { id: activeBranchId, uid: "", name: activeBranchName ?? "", address: "", phone: "", isActive: true, isOnline: false } as Branch
    : null;

  // Ensure branches are loaded when this screen is focused.
  // One attempt per focus only — ref prevents an infinite retry if the fetch fails.
  const loadAttempted = useRef(false);
  useFocusEffect(
    useCallback(() => {
      loadAttempted.current = false;
      return () => { loadAttempted.current = false; };
    }, [])
  );
  useEffect(() => {
    if (loadAttempted.current || branches.length > 0 || !merchantId || merchantLoading) return;
    loadAttempted.current = true;
    loadMerchant(merchantId).catch(() => {});
  }, [branches.length, merchantId, merchantLoading, loadMerchant]);

  // Auto-select: STAFF stub, or STAFF/merchant with an assigned branch, or single-branch merchant.
  const initialBranch = (() => {
    if (staffBranchStub) return staffBranchStub;
    if (activeBranchId) return branches.find((b) => b.id === activeBranchId) ?? null;
    if (branches.length === 1) return branches[0];
    return null;
  })();

  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(initialBranch);

  // Sync if branches load after mount (e.g. cold start with cached branches)
  useEffect(() => {
    if (selectedBranch) return;
    if (staffBranchStub) { setSelectedBranch(staffBranchStub); return; }
    if (activeBranchId) {
      const b = branches.find((br) => br.id === activeBranchId);
      if (b) { setSelectedBranch(b); return; }
    }
    if (branches.length === 1) setSelectedBranch(branches[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.length, activeBranchId, activeBranchName]);

  // Staff: follow the branch selected in the POS header switcher so inventory
  // and products re-scope to the newly active branch. (Merchants use the picker.)
  useEffect(() => {
    if (role === "MERCHANT" || !activeBranchId) return;
    setSelectedBranch((prev) =>
      prev && prev.id === activeBranchId
        ? prev
        : ({ id: activeBranchId, uid: "", name: activeBranchName ?? "", address: "", phone: "", isActive: true, isOnline: false } as Branch),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, activeBranchId, activeBranchName]);

  // While merchant data is still loading, show a spinner so the branch picker
  // doesn't flash "No branches found" before the API response arrives.
  if (!selectedBranch && merchantLoading && branches.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={["top"]}>
        <TopBar blue large titleSize={19} title="Inventory" onBack={goBack} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.brand500} />
        </View>
      </SafeAreaView>
    );
  }

  // Level 1: branch picker — always pass onBack so iOS users have a nav button.
  if (!selectedBranch) {
    return (
      <BranchPickerView
        title="Inventory"
        blueHeader
        subtitle="Select a branch to view stock"
        branches={branches}
        onBack={goBack}
        onSelect={(id) => {
          const b = branches.find((br) => br.id === id);
          if (b) setSelectedBranch(b);
        }}
        getMetaText={() => ""}
      />
    );
  }

  // Level 2: inventory for selected branch.
  // Multi-branch merchants go back to picker; everyone else gets router.back().
  const canGoBack = !activeBranchId && branches.length > 1;

  return (
    <InventoryContent
      branch={selectedBranch}
      onBack={canGoBack ? () => setSelectedBranch(null) : goBack}
      initialTab={initialTab}
    />
  );
}
