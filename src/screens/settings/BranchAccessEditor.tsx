// src/screens/settings/BranchAccessEditor.tsx
//
// The whole permission UI: four switches per branch.
//
// It replaced a 22-switch modal (16 permissions plus 6 group masters) that
// opened only AFTER a staff member had been created, which is why merchants
// described adding someone as a hassle. Owners do not think in
// `order_apply_discount`; they think "can this person work the counter?".
//
// Which backend permissions a group actually grants is decided server-side —
// this component never sees a permission name. That is deliberate: the app, the
// backend and the admin panel each used to keep their own copy of the grouping,
// and they had already drifted.
//
// Multi-branch is the other half of the tedium. Additional branches copy the
// first branch's access by default, because someone working two branches almost
// always does the same job at both; the owner only opens a branch when it
// differs. Shared by the invite sheet and the roster editor so a grant looks
// the same wherever it is made.

import React, { useState } from "react";
import { View, Text, Pressable, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SP, RADIUS } from "../../theme/tokens";
import {
  PERMISSION_GROUP_KEYS,
  PERMISSION_GROUP_LABELS,
  type PermissionGroupKey,
} from "../../types/permissions";
import { S } from "./styles";

/** branchId -> the groups granted there. */
export type BranchAccessDraft = Record<string, PermissionGroupKey[]>;

export interface BranchOption {
  id: string;
  name: string;
}

/** Grant every branch the same access as `sourceBranchId`. */
export function copyAccessAcross(
  draft: BranchAccessDraft,
  sourceBranchId: string,
  branchIds: string[],
): BranchAccessDraft {
  const source = draft[sourceBranchId] ?? [];
  const next: BranchAccessDraft = {};
  for (const id of branchIds) next[id] = [...source];
  return next;
}

/** Do all selected branches grant exactly the same thing? */
export function accessIsUniform(
  draft: BranchAccessDraft,
  branchIds: string[],
): boolean {
  if (branchIds.length < 2) return true;
  const first = [...(draft[branchIds[0]] ?? [])].sort().join(",");
  return branchIds.every(
    (id) => [...(draft[id] ?? [])].sort().join(",") === first,
  );
}

function GroupSwitch({
  group,
  granted,
  disabled,
  onChange,
}: {
  group: PermissionGroupKey;
  granted: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const meta = PERMISSION_GROUP_LABELS[group];
  return (
    <View style={S.permRow}>
      <View style={{ flex: 1, paddingRight: SP._12 }}>
        <Text style={S.permRowLabel}>{meta.label}</Text>
        <Text style={S.permRowDesc}>{meta.description}</Text>
      </View>
      <Switch
        value={granted}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: C.gray200, true: C.brand500 }}
        thumbColor={C.white}
      />
    </View>
  );
}

export function BranchAccessEditor({
  branches,
  selectedBranchIds,
  draft,
  onChange,
  disabled,
}: {
  /** Every branch the owner could assign. */
  branches: BranchOption[];
  /** The branches actually assigned, in the order they were added. */
  selectedBranchIds: string[];
  draft: BranchAccessDraft;
  onChange: (next: BranchAccessDraft) => void;
  disabled?: boolean;
}) {
  const [primaryId, ...others] = selectedBranchIds;
  // "Same access everywhere" is the default because it is nearly always true,
  // and because ticking four boxes per branch five times over is the exact
  // tedium this screen exists to remove.
  const [sameEverywhere, setSameEverywhere] = useState(() =>
    accessIsUniform(draft, selectedBranchIds),
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!primaryId) return null;

  const nameOf = (id: string) =>
    branches.find((b) => b.id === id)?.name ?? "Branch";

  const setGroups = (branchId: string, groups: PermissionGroupKey[]) => {
    const next = { ...draft, [branchId]: groups };
    onChange(
      sameEverywhere
        ? copyAccessAcross(next, branchId, selectedBranchIds)
        : next,
    );
  };

  const toggle = (branchId: string, group: PermissionGroupKey, on: boolean) => {
    const current = draft[branchId] ?? [];
    setGroups(
      branchId,
      on ? [...new Set([...current, group])] : current.filter((g) => g !== group),
    );
  };

  const renderGroups = (branchId: string) => (
    <View>
      {PERMISSION_GROUP_KEYS.map((group) => (
        <GroupSwitch
          key={group}
          group={group}
          granted={(draft[branchId] ?? []).includes(group)}
          disabled={disabled}
          onChange={(v) => toggle(branchId, group, v)}
        />
      ))}
    </View>
  );

  const onSameToggle = (v: boolean) => {
    setSameEverywhere(v);
    // Turning it on re-copies immediately, so what the owner sees and what
    // would be saved never disagree.
    if (v) onChange(copyAccessAcross(draft, primaryId, selectedBranchIds));
    else setExpanded(null);
  };

  return (
    <View>
      <Text style={S.permGroupLabel}>
        {others.length ? `Access at ${nameOf(primaryId)}` : "Access"}
      </Text>
      {renderGroups(primaryId)}

      {others.length > 0 && (
        <>
          <View style={[S.permRow, { marginTop: SP._12 }]}>
            <View style={{ flex: 1, paddingRight: SP._12 }}>
              <Text style={S.permRowLabel}>Same access at every branch</Text>
              <Text style={S.permRowDesc}>
                Turn off to set {others.length === 1 ? "the other branch" : "each branch"} separately.
              </Text>
            </View>
            <Switch
              value={sameEverywhere}
              onValueChange={onSameToggle}
              disabled={disabled}
              trackColor={{ false: C.gray200, true: C.brand500 }}
              thumbColor={C.white}
            />
          </View>

          {!sameEverywhere &&
            others.map((branchId) => {
              const isOpen = expanded === branchId;
              const count = (draft[branchId] ?? []).length;
              return (
                <View
                  key={branchId}
                  style={{
                    borderWidth: 1,
                    borderColor: C.gray200,
                    borderRadius: RADIUS.md,
                    marginTop: SP._8,
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    onPress={() => setExpanded(isOpen ? null : branchId)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      padding: SP._12,
                      backgroundColor: C.gray50,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={S.permRowLabel}>{nameOf(branchId)}</Text>
                      <Text style={S.permRowHint}>
                        {count === 0
                          ? "No access"
                          : `${count} of ${PERMISSION_GROUP_KEYS.length} granted`}
                      </Text>
                    </View>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={C.gray500}
                    />
                  </Pressable>
                  {isOpen && (
                    <View style={{ paddingHorizontal: SP._12 }}>
                      {renderGroups(branchId)}
                    </View>
                  )}
                </View>
              );
            })}
        </>
      )}
    </View>
  );
}

/** A courier's access is fixed — there is nothing to choose. */
export function CourierAccessNotice() {
  return (
    <View>
      <Text style={S.permGroupLabel}>Access</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: SP._8,
          padding: SP._12,
          backgroundColor: C.gray50,
          borderRadius: RADIUS.md,
        }}
      >
        <Ionicons name="bicycle-outline" size={18} color={C.gray600} />
        <View style={{ flex: 1 }}>
          <Text style={S.permRowLabel}>Pickup &amp; delivery</Text>
          <Text style={S.permRowDesc}>
            Couriers see only the pickups and deliveries assigned to them. They
            have no access to the counter, inventory, services or reports.
          </Text>
        </View>
      </View>
    </View>
  );
}
