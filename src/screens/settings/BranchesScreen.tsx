// Branches management screen (list, add, edit, branding) — extracted from
// settings.tsx. The Add/Edit form sheets live in BranchFormSheets.tsx; the
// branding editor (logo / cover / description) in BranchBrandingEditor.tsx.
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import { HeroHeader } from "../../components/ui";
import { AddButton } from "../../components/ui/AddButton";
import { fetchMyBranches } from "../../services/graphql/branches";
import { showConfirm } from "../../lib/dialog";
import { notify } from "../../stores/notificationStore";
import { useDeepLinkStore } from "../../stores/deepLinkStore";
import { useMerchantStore } from "../../stores/merchantStore";
import type { Branch } from "../../stores/merchantStore";
import { AddBranchSheet, EditBranchSheet } from "./BranchFormSheets";
import { BranchBrandingEditor } from "./BranchBrandingEditor";
import { I } from "./shared";
import { S } from "./styles";

export function BranchesScreenInline({
  merchantId,
  branches,
  onRefresh,
  onBack,
}: Readonly<{
  merchantId: string | null;
  branches: Branch[];
  onRefresh: () => Promise<void>;
  onBack: () => void;
}>) {
  const archiveBranch    = useMerchantStore((s) => s.archiveBranch);
  const reactivateBranch = useMerchantStore((s) => s.reactivateBranch);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [refreshing,   setRefreshing]   = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [editTarget,   setEditTarget]   = useState<Branch | null>(null);
  const [brandTarget,  setBrandTarget]  = useState<Branch | null>(null);

  // The dashboard's "Edit profile" names a branch and expects its branding
  // editor open on arrival — the owner tapped a card, so asking them to find
  // the same branch again in a list would be a step backwards.
  const brandingBranchId = useDeepLinkStore((st) => st.brandingBranchId);
  const clearBrandingBranch = useDeepLinkStore((st) => st.setBrandingBranch);
  useEffect(() => {
    if (!brandingBranchId) return;
    const target = branches.find((b) => b.id === brandingBranchId);
    if (target) setBrandTarget(target);
    clearBrandingBranch(null);
  }, [brandingBranchId, branches, clearBrandingBranch]);

  // Archived branches fetched separately (store only holds active)
  const [archivedBranches, setArchivedBranches] = useState<Branch[]>([]);
  const [archivedLoading,  setArchivedLoading]  = useState(false);

  // The active-branches list below renders the `branches` prop as-is (no
  // isActive filter — the store is expected to already hold only active
  // ones). That store state can go stale between visits — e.g. arriving here
  // via a deep link from elsewhere in Settings without ever having re-fetched
  // — so always refresh on mount rather than trusting whatever was already
  // in the store.
  useEffect(() => {
    void onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadArchived = useCallback(async () => {
    if (!merchantId) return;
    setArchivedLoading(true);
    try {
      const all = await fetchMyBranches(true);
      setArchivedBranches(all.filter((b) => !b.isActive));
    } catch {
      setArchivedBranches([]);
    } finally {
      setArchivedLoading(false);
    }
  }, [merchantId]);

  // Load archived when section is expanded
  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh().catch(() => {});
    if (showArchived) await loadArchived();
    setRefreshing(false);
  };

  // ── Archive ───────────────────────────────────────────────────────────────
  const handleArchive = (b: Branch) => {
    showConfirm(
      "Archive Branch",
      `Archive "${b.name}"? It will no longer appear in the app but can be reactivated later.`,
      () => {
        void (async () => {
          try {
            await archiveBranch(b.id);
            await onRefresh();
            notify.success("Branch archived", `${b.name} has been archived.`);
          } catch {
            notify.error("Could not archive branch", "Please try again or contact support if the issue persists.");
          }
        })();
      },
      { confirmLabel: "Archive", destructive: true }
    );
  };

  // ── Reactivate ────────────────────────────────────────────────────────────
  const handleReactivate = async (b: Branch) => {
    try {
      await reactivateBranch(b.id);
      await onRefresh();
      await loadArchived();
      notify.success("Branch reactivated", `${b.name} has been reactivated.`);
    } catch {
      notify.error("Could not reactivate branch", "Please try again or contact support if the issue persists.");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <HeroHeader
        compact
        noWave
        title="Branches"
        subtitle="Manage your branch locations"
        onBack={onBack}
        right={
          <AddButton
            label="Add"
            variant="link"
            onPress={() => setShowAdd(true)}
          />
        }
      />

      <ScrollView
        style={S.branchesScroll}
        contentContainerStyle={S.branchesScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void handleRefresh(); }} />}
      >
        {/* ── Active branches ── */}
        {branches.length === 0 ? (
          <View style={S.branchEmpty}>
            <I.Building c={C.gray300} />
            <Text style={S.branchEmptyTitle}>No branches yet</Text>
            <Text style={S.branchEmptyText}>Tap &quot;Add&quot; to create your first branch location.</Text>
          </View>
        ) : (
          <View style={S.subCard}>
            {branches.map((branch, idx) => (
              <React.Fragment key={branch.id}>
                {idx > 0 && <View style={S.divider} />}
                <View style={S.branchRow}>
                  <View style={S.branchIconCircle}>
                    <I.Building c={C.brand500} />
                  </View>
                  <View style={S.branchRowBody}>
                    <Text style={S.branchRowName}>{branch.name}</Text>
                    {!!branch.address && (
                      <Text style={S.branchRowAddr} numberOfLines={1}>{branch.address}</Text>
                    )}
                    {!!branch.phone && (
                      <Text style={S.branchRowMeta}>{branch.phone}</Text>
                    )}
                    {!!branch.operatingHours && (
                      <Text style={S.branchRowMeta}>Hours configured</Text>
                    )}
                    {/* Pay Later is EDITED under Booking & Delivery Fees, on
                        the branch the header selector names. This line is the
                        read-only comparison the directory is for — the value
                        already ships with the branch list, so it costs no
                        extra request. */}
                    <Text style={S.branchRowMeta}>
                      {`Pay Later · ${branch.allowsPayAtHandover ? "On" : "Off"}`}
                    </Text>
                  </View>
                  {/* Branding + Edit + Archive actions */}
                  <View style={S.branchActions}>
                    <TouchableOpacity
                      onPress={() => setBrandTarget(branch)}
                      hitSlop={8}
                      activeOpacity={0.7}
                      style={S.branchActionBtn}
                    >
                      <Ionicons name="image-outline" size={18} color={C.brand500} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setEditTarget(branch)}
                      hitSlop={8}
                      activeOpacity={0.7}
                      style={S.branchActionBtn}
                    >
                      <I.Edit c={C.brand500} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleArchive(branch)}
                      hitSlop={8}
                      activeOpacity={0.7}
                      style={S.branchActionBtn}
                    >
                      <I.Archive c={C.gray400} />
                    </TouchableOpacity>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* ── Archived branches (collapsible) ── */}
        <TouchableOpacity
          style={S.archivedToggle}
          onPress={() => setShowArchived((v) => !v)}
          activeOpacity={0.75}
        >
          <Text style={S.branchArchivedToggleText}>Archived branches</Text>
          <Ionicons
            name={showArchived ? "chevron-up" : "chevron-down"}
            size={16}
            color={C.gray500}
          />
        </TouchableOpacity>

        {showArchived && (
          archivedLoading ? (
            <ActivityIndicator color={C.brand500} style={S.archivedSpinner} />
          ) : archivedBranches.length === 0 ? (
            <Text style={S.archivedEmptyText}>No archived branches.</Text>
          ) : (
            <View style={[S.subCard, S.archivedList]}>
              {archivedBranches.map((branch, idx) => (
                <React.Fragment key={branch.id}>
                  {idx > 0 && <View style={S.divider} />}
                  <View style={[S.branchRow, S.dim60]}>
                    <View style={S.branchIconCircle}>
                      <I.Building c={C.gray400} />
                    </View>
                    <View style={S.branchRowBody}>
                      <Text style={S.branchRowName}>{branch.name}</Text>
                      {!!branch.address && (
                        <Text style={S.branchRowAddr} numberOfLines={1}>{branch.address}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => { void handleReactivate(branch); }}
                      hitSlop={8}
                      activeOpacity={0.7}
                      style={[S.branchActionBtn, S.reactivateBtn]}
                    >
                      <Text style={S.reactivateBtnText}>Reactivate</Text>
                    </TouchableOpacity>
                  </View>
                </React.Fragment>
              ))}
            </View>
          )
        )}

        {branches.length > 0 && <Text style={S.auditEndOfList}>— End of results —</Text>}
      </ScrollView>

      {/* ── Add Branch sheet ── */}
      <AddBranchSheet
        visible={showAdd}
        merchantId={merchantId}
        onClose={() => setShowAdd(false)}
        onCreated={onRefresh}
      />

      {/* ── Edit Branch sheet ── */}
      <EditBranchSheet
        branch={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={onRefresh}
      />

      {/* ── Branding editor (logo / cover / description) ── */}
      <BranchBrandingEditor
        branch={brandTarget}
        onClose={() => setBrandTarget(null)}
        onSaved={() => { void onRefresh(); }}
      />
    </SafeAreaView>
  );
}
