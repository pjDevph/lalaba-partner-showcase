// app/(tabs)/pos.tsx
// Lalaba Merchant — Point of Sale (Redesigned)
// Hub screen with three sub-tabs: Terminal, Queue, Claim.
// Tabs, modals, banners and shared helpers live in src/screens/pos/*.

import React, { useCallback, useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, Pressable } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { gqlGetBranch } from "../../src/services/graphql/branches";
import type { POSOrder } from "../../src/types/pos.types";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useQueueStore } from "../../src/stores/queueStore";
import { useUIStore } from "../../src/stores/uiStore";
import { useQueueSubscription } from "../../src/hooks/useQueueSubscription";
import { useCan } from "../../src/hooks/usePermission";
import { BranchPickerView } from "../../src/components/BranchPickerView";
import { BranchSelectorBar } from "../../src/components/BranchSelectorBar";
import { Segments as SegmentBar } from "../../src/components/ui";
import { C } from "../../src/theme/tokens";
import { S } from "../../src/screens/pos/styles";
import { Icon, type POSTab } from "../../src/screens/pos/shared";
import { POSHeader } from "../../src/screens/pos/POSHeader";
import { TerminalTab } from "../../src/screens/pos/TerminalTab";
import { QueueTab } from "../../src/screens/pos/QueueTab";
import { ClaimTab } from "../../src/screens/pos/ClaimTab";
import { PendingQueueBanner, OfflineBanner } from "../../src/screens/pos/Banners";
import { AvatarMenu } from "../../src/screens/dashboard/AvatarMenu";

export default function POSScreen() {
  const canCreateOrder = useCan("canCreateOrder");
  // Tabs are always visible for every role — permission only disables the CTAs
  // inside them, it never hides a whole tab. This only picks the initial landing tab.
  const [tab, setTab] = useState<POSTab>(() => (canCreateOrder ? "terminal" : "queue"));
  const [pendingReleaseOrder, setPendingReleaseOrder] = useState<POSOrder | null>(null);
  const { width: _w, height: _h } = useWindowDimensions();
  const isLandscape = _w > _h;
  const insets = useSafeAreaInsets();

  const role            = useAuthStore((s) => s.role);
  const user            = useAuthStore((s) => s.user);
  const avatarInitials  = (user?.displayName?.trim()?.[0] ?? "M").toUpperCase();
  const authBranchName  = useAuthStore((s) => s.activeBranchName);
  const activeBranchId  = useAuthStore((s) => s.activeBranchId);
  const syncBranchNames = useAuthStore((s) => s.syncBranchNames);
  const branches        = useMerchantStore((s) => s.branches);
  const merchantLoading = useMerchantStore((s) => s.isLoading);
  const loadMerchant    = useMerchantStore((s) => s.loadMerchant);
  const merchantId      = useAuthStore((s) => s.merchantId);
  const selectBranch    = useMerchantStore((s) => s.selectBranch);
  const branchMemberships = useAuthStore((s) => s.branchMemberships);
  const setActiveBranch   = useAuthStore((s) => s.setActiveBranch);
  const deviceBranchId    = useAuthStore((s) => s.deviceBranchId);
  const isMerchant = role === "MERCHANT";

  // A staff assigned to more than one branch can switch between the branches
  // they have access to via a dropdown in the header — UNLESS this device is
  // locked to a single branch by its registration (reqs #2/#3), in which case
  // only that branch is shown and no switcher is offered.
  const isMultiBranchStaff = !isMerchant && !deviceBranchId && branchMemberships.length > 1;
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");

  // Staff: branch names are null after sign-in (me query only returns branchIds).
  // Fetch names for every branch the staff can access so the header shows the
  // active one and the multi-branch dropdown lists them all by name.
  useEffect(() => {
    if (isMerchant) return;
    const missing = branchMemberships.filter((m) => !m.branchName);
    if (missing.length === 0) return;
    void Promise.all(
      missing.map((m) =>
        gqlGetBranch(m.branchId)
          .then((b) => ({ id: b.id, name: b.name }))
          // Branch not found (stale ID) — placeholder so we don't retry forever.
          .catch(() => ({ id: m.branchId, name: "My Branch" })),
      ),
    ).then((named) => syncBranchNames(named));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMerchant, branchMemberships.length]);

  const [branchView, setBranchView] = useState<"picker" | "pos">(
    isMerchant ? "picker" : "pos"
  );


  // Reset to branch picker on each tab focus (MERCHANT only).
  // If branches aren't loaded yet, trigger a fetch so the picker isn't stuck empty.
  useFocusEffect(
    useCallback(() => {
      if (!isMerchant) return;
      setBranchView("picker");
      if (branches.length === 0 && !merchantLoading && merchantId) {
        void loadMerchant(merchantId);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMerchant, merchantId])
  );

  // Auto-select the only branch so single-branch merchants skip the picker.
  useEffect(() => {
    if (!isMerchant || branchView !== "picker") return;
    if (branches.length === 1 && !merchantLoading) {
      selectBranch(branches[0].id);
      setBranchView("pos");
    }
  }, [branches, merchantLoading, isMerchant, branchView, selectBranch]);

  // Full-screen POS (portrait-only manual toggle — hides the bottom tab bar).
  // Landscape uses the global sidebar from _layout.tsx, so fullscreen is never
  // auto-enabled there. Restore bar on blur so other tabs keep their nav.
  const posFullScreen    = useUIStore((s) => s.posFullScreen);
  const setPosFullScreen = useUIStore((s) => s.setPosFullScreen);
  useEffect(() => {
    if (isLandscape && posFullScreen) setPosFullScreen(false);
  }, [isLandscape, posFullScreen, setPosFullScreen]);
  useFocusEffect(
    useCallback(() => {
      return () => setPosFullScreen(false);
    }, [setPosFullScreen])
  );

  const { refresh: refreshQueue } = useQueueSubscription();
  const orders = useQueueStore((s) => s.orders);
  const queueLoading = useQueueStore((s) => s.isLoading);

  // The queue fetch is single-shot and only re-fires on navigation focus /
  // branch change — switching the INTERNAL tab does neither. Refresh whenever
  // the user opens Queue or Claim so a just-created order is actually there.
  const goToTab = useCallback((next: POSTab) => {
    setTab(next);
    if (next === "queue" || next === "claim") refreshQueue();
  }, [refreshQueue]);
  const queueCount = orders.filter((o) => o.status === "CREATED" || o.status === "PROCESSING").length;

  const _branches         = useMerchantStore((s) => s.branches);
  const _selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  // Merchants scope by merchantStore.selectedBranchId; staff scope by
  // authStore.activeBranchId (merchantStore.selectedBranchId can go stale
  // for staff — e.g. reverted to the first branch by a loadMerchant() call
  // racing a relogin — so it isn't safe to prefer it via `??` for staff).
  const effectiveBranchId = isMerchant ? _selectedBranchId : activeBranchId;
  const branch = _branches.find((b) => b.id === effectiveBranchId) ?? null;
  const displayBranchName = branch?.name ?? authBranchName;

  const readyCount = orders.filter((o) => o.status === "READY_FOR_PICKUP").length;

  const TABS: { key: POSTab; label: string; badge?: number }[] = [
    { key: "terminal", label: "Terminal" },
    { key: "queue",    label: "Queue", badge: queueCount || undefined },
    { key: "claim",    label: "Claim", badge: readyCount || undefined },
  ];

  // ── Branch picker (MERCHANT only) ────────────────────────────────────────────
  if (isMerchant && branchView === "picker") {
    if (merchantLoading) {
      return (
        <SafeAreaView style={S.safe} edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.gray200, backgroundColor: C.white }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon.ChevronLeft c={C.brand500} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.gray900, marginLeft: 8 }}>Point of Sale</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ActivityIndicator size="large" color={C.brand500} />
            <Text style={{ fontSize: 13, color: C.gray500 }}>Loading branches…</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (branches.length === 0) {
      return (
        <SafeAreaView style={S.safe} edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.gray200, backgroundColor: C.white }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon.ChevronLeft c={C.brand500} />
            </TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.gray900, marginLeft: 8 }}>Point of Sale</Text>
          </View>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray700, textAlign: "center" }}>No branches found</Text>
            <Text style={{ fontSize: 13, color: C.gray400, textAlign: "center" }}>Add a branch in Settings, or tap below to retry.</Text>
            <TouchableOpacity
              style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: C.brand500, borderRadius: 10 }}
              onPress={() => merchantId && void loadMerchant(merchantId)}
              activeOpacity={0.8}
            >
              <Text style={{ color: C.white, fontWeight: "700", fontSize: 14 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <BranchPickerView
        title="Point of Sale"
        subtitle="Select a branch"
        blueHeader
        branches={branches}
        onBack={() => router.back()}
        onSelect={(branchId) => { selectBranch(branchId); setBranchView("pos"); }}
        right={!isLandscape ? <AvatarMenu initials={avatarInitials}  /> : undefined}
      />
    );
  }

  return (
    <SafeAreaView style={S.safe} edges={[]}>
      {/* Dark status-bar glyphs: the header behind them is white now. */}
      <StatusBar style="dark" />
      {/* Unified header across Terminal / Queue / Claim. */}
      <POSHeader
        insetsTop={insets.top}
        title={tab === "terminal" ? "Point of Sale" : tab === "queue" ? "Queue" : "Claim"}
        branchName={displayBranchName ?? null}
        showBranchDropdown={isMultiBranchStaff}
        onOpenBranchMenu={() => { setBranchSearch(""); setBranchMenuOpen(true); }}
        showFullscreen={!isLandscape}
        posFullScreen={posFullScreen}
        onToggleFullscreen={() => setPosFullScreen(!posFullScreen)}
        showAvatar={!isLandscape && isMerchant}
        showBell={!isMerchant}
        avatarInitials={avatarInitials}
      />

      {/* Owner branch switcher — same pill as Orders/Wallet (multi-branch owners
          only; staff use the header dropdown above). */}
      <BranchSelectorBar />

      {/* Network status */}
      <OfflineBanner />

      {/* Offline queue status */}
      <PendingQueueBanner />

      {/* Mode tabs — always visible; global sidebar handles app navigation */}
      <View style={S.segWrap}>
        <SegmentBar
          options={TABS.map((t) => ({ value: t.key, label: t.label, badge: t.badge }))}
          value={tab}
          onChange={goToTab}
        />
      </View>

      {tab === "terminal" && <TerminalTab onGoToQueue={() => goToTab("queue")} />}
      {tab === "queue"    && (
        <QueueTab
          orders={orders}
          onReleaseOrder={(o) => { setPendingReleaseOrder(o); goToTab("claim"); }}
          onRefresh={refreshQueue}
          refreshing={queueLoading}
        />
      )}
      {tab === "claim"    && (
        <ClaimTab
          orders={orders}
          pendingReleaseOrder={pendingReleaseOrder}
          onPendingReleaseHandled={() => setPendingReleaseOrder(null)}
          onRefresh={refreshQueue}
          refreshing={queueLoading}
        />
      )}

      {/* Branch switcher — merchants list every branch; staff list only their assigned ones. */}
      <Modal
        visible={branchMenuOpen}
        transparent
        animationType="fade"
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setBranchMenuOpen(false)}
      >
        <Pressable style={S.branchMenuBackdrop} onPress={() => setBranchMenuOpen(false)}>
          <Pressable style={S.branchMenuCard} onPress={() => {}}>
            <Text style={S.branchMenuTitle}>Switch Branch</Text>
            <View style={S.branchMenuSearchWrap}>
              <Icon.Search c={C.gray400} />
              <TextInput
                style={S.branchMenuSearchInput}
                placeholder="Search branch…"
                placeholderTextColor={C.gray400}
                value={branchSearch}
                onChangeText={setBranchSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
            {(() => {
              const q = branchSearch.trim().toLowerCase();
              const items = isMerchant
                ? branches.map((b) => ({ id: b.id, name: b.name }))
                : branchMemberships.map((m) => ({ id: m.branchId, name: m.branchName ?? "My Branch" }));
              const activeMenuBranchId = isMerchant ? _selectedBranchId : activeBranchId;
              const list = items.filter((it) => it.name.toLowerCase().includes(q));
              if (list.length === 0) {
                return <Text style={S.branchMenuEmpty}>No branches found</Text>;
              }
              return list.map((it) => {
                const isActive = it.id === activeMenuBranchId;
                return (
                  <TouchableOpacity
                    key={it.id}
                    style={[S.branchMenuRow, isActive && S.branchMenuRowActive]}
                    onPress={() => {
                      // Merchants only ever scope by merchantStore.selectedBranchId.
                      // Staff also need authStore.activeBranchId updated so every
                      // consumer re-scopes: POS tabs read `selectedBranchId ?? activeBranchId`,
                      // the Services/Inventory screens follow activeBranchId.
                      if (!isMerchant) setActiveBranch(it.id);
                      selectBranch(it.id);
                      setBranchMenuOpen(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.branchMenuRowText, isActive && S.branchMenuRowTextActive]} numberOfLines={1}>
                      {it.name}
                    </Text>
                    {isActive && <Icon.Check c={C.brand600} s={16} />}
                  </TouchableOpacity>
                );
              });
            })()}
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}
