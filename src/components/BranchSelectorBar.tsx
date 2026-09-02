// src/components/BranchSelectorBar.tsx
// A compact "current branch" pill shown at the top of the Orders, Wallet, and
// POS tabs. Tapping it opens the shared BranchPickerView to switch the branch
// these tabs are scoped to. It drives merchantStore.selectedBranchId — the one
// operational "current branch" that POS/Orders/Wallet/Services all read — so a
// switch here re-scopes every tab consistently.
//
// It renders ONLY for an owner who operates more than one branch and is not
// pinned to a device/active branch. A single-branch merchant or a device-pinned
// staff member sees nothing — the tab just uses their one branch.

import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";
import { useAuthStore } from "../stores/authStore";
import { useMerchantStore } from "../stores/merchantStore";
import { BranchPickerView } from "./BranchPickerView";

export function BranchSelectorBar() {
  const role             = useAuthStore((s) => s.role);
  const deviceBranchId   = useAuthStore((s) => s.deviceBranchId);
  const activeBranchId   = useAuthStore((s) => s.activeBranchId);
  const branches         = useMerchantStore((s) => s.branches);
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const selectBranch     = useMerchantStore((s) => s.selectBranch);

  const [open, setOpen] = useState(false);

  // Only owners with more than one branch, not pinned to a single device/active
  // branch, get to switch. Everyone else is implicitly scoped to their branch.
  const canSwitch = role === "MERCHANT" && branches.length > 1 && !deviceBranchId && !activeBranchId;
  if (!canSwitch) return null;

  const currentId = selectedBranchId ?? branches[0]?.id ?? null;
  const current = branches.find((b) => b.id === currentId) ?? branches[0];

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.pill} onPress={() => setOpen(true)} activeOpacity={0.75}>
        <Ionicons name="business-outline" size={15} color={C.brand600} />
        <Text style={styles.name} numberOfLines={1}>{current?.name ?? "Select branch"}</Text>
        <Ionicons name="chevron-down" size={15} color={C.brand600} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <BranchPickerView
          title="Switch branch"
          subtitle="Choose the branch to view"
          branches={branches}
          blueHeader
          onBack={() => setOpen(false)}
          getMetaText={(b) => b.address ?? ""}
          onSelect={(branchId) => { selectBranch(branchId); setOpen(false); }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: SP._16, paddingTop: SP._12 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    alignSelf: "flex-start",
    backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand100,
    borderRadius: RADIUS.full, paddingHorizontal: SP._14, paddingVertical: SP._8,
    maxWidth: "100%",
  },
  name: { flexShrink: 1, fontSize: 14, fontWeight: "800", color: C.brand700 },
});
