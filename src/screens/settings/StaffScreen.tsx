// Staff management screen (+ StaffRow, BField, permission handlers) — extracted from settings.tsx.
import React, { useState, useEffect } from "react";
import type { AuthUser } from "../../stores/authStore";
import { errField } from "../../utils/userError";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Share, useWindowDimensions } from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { HeroHeader, TopBar } from "../../components/ui";
import { AddButton } from "../../components/ui/AddButton";
import { showAlert, showConfirm } from "../../lib/dialog";
import {
  gqlCreateStaff, gqlUpdateStaff, gqlArchiveStaff, gqlRestoreStaff, gqlGenerateStaffResetLink,
} from "../../services/graphql/staff";
import { gqlApproveDevice, gqlBlockDevice } from "../../services/graphql/devices";
import { logActivity, ActivityLog, type LogActor } from "../../utils/logActivity";
import { sendPasswordResetEmail } from "firebase/auth";
import { useCan } from "../../hooks/usePermission";
import { useNotificationStore } from "../../stores/notificationStore";
import { auth } from "../../config/firebase";
import { NAME_RE } from "../../lib/validation";
import type { Branch } from "../../stores/merchantStore";
import { I, ROLE_COLORS, isCourier, mapStaffMember, type StaffMember, type DeviceNotif } from "./shared";
import { S } from "./styles";
import {
  BranchAccessEditor,
  CourierAccessNotice,
  type BranchAccessDraft,
} from "./BranchAccessEditor";

type NewStaff = {
  firstName: string; lastName: string; phone: string; email: string;
  /** STAFF works the shop floor; COURIER only does pickups and deliveries. */
  accountType: "STAFF" | "COURIER";
  /** Every assigned branch is equal — there is no "primary". */
  branchAccessIds: string[];
  /** branchId -> granted groups. Couriers keep this empty. */
  access: BranchAccessDraft;
};
const EMPTY_NEW_STAFF: NewStaff = {
  firstName: "", lastName: "", phone: "", email: "",
  accountType: "STAFF", branchAccessIds: [], access: {},
};


export function StaffScreenInline({
  staffList, setStaffList, merchantId, branches, user, initialBranchId, onBack,
}: Readonly<{
  staffList: StaffMember[];
  setStaffList: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  merchantId: string | null;
  branches: Branch[];
  user: AuthUser | null;
  initialBranchId?: string | null;
  onBack: () => void;
}>) {
  const { width: _sw, height: _sh } = useWindowDimensions();
  const isTablet = Math.min(_sw, _sh) >= 600;
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(initialBranchId ?? null);
  const [innerView, setInnerView] = useState<"branches" | "staff">(initialBranchId ? "staff" : "branches");
  const [showAdd, setShowAdd] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  // Error toast for the Add Staff sheet. Rendered *inside* that sheet's own
  // Modal rather than via notify() — the global toast is itself a Modal, and
  // iOS only presents one native modal at a time, so it would silently fail
  // to appear over the open sheet (see ConsumableModals for the same trap).
  const [addError, setAddError] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState<NewStaff>(EMPTY_NEW_STAFF);
  const [staffSuccess, setStaffSuccess] = useState<{ name: string; email: string; memberId: string; link: string; mode: "invite" | "password" } | null>(null);
  const [resendInviteCooldown, setResendInviteCooldown] = useState(0);
  const [inactiveConfirm, setInactiveConfirm] = useState<{ member: StaffMember; next: boolean } | null>(null);
  const [inactiveConfirmSaving, setInactiveConfirmSaving] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<StaffMember | null>(null);
  const [archiveConfirmSaving, setArchiveConfirmSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [permTarget, setPermTarget] = useState<StaffMember | null>(null);
  const [permDraft, setPermDraft] = useState<BranchAccessDraft>({});
  const [permSaving, setPermSaving] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [branchConfirm, setBranchConfirm] = useState<{
    member: StaffMember;
    branchId: string;
    branchName: string;
    assign: boolean;
  } | null>(null);
  const [branchConfirmSaving, setBranchConfirmSaving] = useState(false);
  const canManageStaff = useCan("canManageStaff");
  // Offline mock: devices auto-approve, so there are never pending requests.
  const deviceNotifs: DeviceNotif[] = [];
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);
  const ownerActor: LogActor = {
    id: user?.uid ?? "owner",
    name: user?.displayName ?? user?.email ?? "Owner",
    role: "OWNER",
  };

  // ── Resend invite cooldown ─────────────────────────────────────────────────
  useEffect(() => {
    if (resendInviteCooldown <= 0) return;
    const t = setTimeout(() => setResendInviteCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendInviteCooldown]);

  const handleResendInviteLink = async () => {
    if (!staffSuccess?.memberId || resendInviteCooldown > 0) return;
    try {
      // Re-send the email and refresh the manual-share link in parallel.
      const [link] = await Promise.all([
        gqlGenerateStaffResetLink(staffSuccess.memberId),
        sendPasswordResetEmail(auth, staffSuccess.email).catch(() => {}),
      ]);
      setStaffSuccess((p) => p ? { ...p, link } : null);
      setResendInviteCooldown(60);
    } catch {
      showAlert("Error", "Could not resend invite. Try again.");
    }
  };

  // ── Approve / Block device ─────────────────────────────────────────────────
  const handleApproveDevice = async (notif: DeviceNotif) => {
    setDeviceActionLoading(notif.id);
    try {
      await gqlApproveDevice(notif.id);
    } catch (e: unknown) {
      showAlert("Could not approve device", "Please try again.");
    } finally { setDeviceActionLoading(null); }
  };

  const handleBlockDevice = (notif: DeviceNotif) => {
    showConfirm(
      "Block Device",
      `Block ${notif.staffName}'s device? They won't be able to log in from it.`,
      () => {
        void (async () => {
          setDeviceActionLoading(notif.id);
          try {
            await gqlBlockDevice(notif.id);
          } catch (e: unknown) {
            showAlert("Could not block device", "Please try again.");
          } finally { setDeviceActionLoading(null); }
        })();
      },
      { confirmLabel: "Block", destructive: true }
    );
  };

  // Filter staff to the selected branch for display — anyone with ACCESS to this
  // branch (primary or secondary), so a staff assigned to multiple branches shows
  // under each one, not only their primary.
  const branchStaff = staffList.filter((s) => !selectedBranchId || s.branchAccessIds.includes(selectedBranchId));
  // Couriers come back from the same myStaff query as laundry staff, so they're
  // split out here and listed under their own heading — a rider is not part of
  // the branch's shop team.
  const activeMembers    = branchStaff.filter((s) => s.isArchived === false && s.isActive && !isCourier(s));
  const inactiveMembers  = branchStaff.filter((s) => s.isArchived === false && s.isActive === false && !isCourier(s));
  const activeCouriers   = branchStaff.filter((s) => s.isArchived === false && s.isActive && isCourier(s));
  const inactiveCouriers = branchStaff.filter((s) => s.isArchived === false && s.isActive === false && isCourier(s));
  const archivedMembers  = branchStaff.filter((s) => s.isArchived);
  const courierCount     = activeCouriers.length + inactiveCouriers.length;
  const staffCount       = activeMembers.length + inactiveMembers.length;
  // ── Add staff ──────────────────────────────────────────────────────────────
  // Both entry points seed the sheet with the branch the owner is already
  // looking at, so the common single-branch case needs no extra taps.
  const openAddSheet = () => {
    setNewStaff({
      ...EMPTY_NEW_STAFF,
      branchAccessIds: selectedBranchId ? [selectedBranchId] : [],
      access: selectedBranchId ? { [selectedBranchId]: [] } : {},
    });
    setShowAdd(true);
  };

  const canAddStaff =
    NAME_RE.test(newStaff.firstName.trim()) &&
    NAME_RE.test(newStaff.lastName.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaff.email.trim()) &&
    // The phone is genuinely required by the backend validator. It used to be
    // optional here and a fabricated "09000000000" was sent instead, which put
    // an unreachable number on a real person's record.
    /^09\d{9}$/.test(newStaff.phone.trim()) &&
    newStaff.branchAccessIds.length > 0;

  // Auto-dismiss the Add Staff error toast, mirroring the global toast timing.
  useEffect(() => {
    if (!addError) return;
    const t = setTimeout(() => setAddError(null), 5000);
    return () => clearTimeout(t);
  }, [addError]);

  const handleAdd = async () => {
    if (!canManageStaff) return;
    setAddError(null);
    if (!selectedBranchId) { setAddError("Please select a branch before adding staff."); return; }
    if (!newStaff.firstName.trim()) { setAddError("First name is required."); return; }
    if (!NAME_RE.test(newStaff.firstName.trim())) {
      setAddError("First name can only contain letters, spaces, hyphens, and apostrophes.");
      return;
    }
    if (!newStaff.lastName.trim())  { setAddError("Last name is required."); return; }
    if (!NAME_RE.test(newStaff.lastName.trim())) {
      setAddError("Last name can only contain letters, spaces, hyphens, and apostrophes.");
      return;
    }
    if (!newStaff.email.trim())     { setAddError("Email address is required."); return; }
    const phoneVal = newStaff.phone.trim();
    if (!/^09\d{9}$/.test(phoneVal)) {
      setAddError("Phone must be 11 digits starting with 09 (e.g. 09171234567).");
      return;
    }
    if (newStaff.branchAccessIds.length === 0) {
      setAddError("Assign at least one branch.");
      return;
    }
    if (!merchantId) return;
    setAddSaving(true);
    try {
      // Role, branches AND access in one call. Previously this sent no role
      // (so a merchant could never invite a courier) and no permissions (so the
      // owner had to reopen the member in a separate editor to grant any).
      const isCourierInvite = newStaff.accountType === "COURIER";
      const member = await gqlCreateStaff({
        firstName:   newStaff.firstName.trim(),
        lastName:    newStaff.lastName.trim(),
        email:       newStaff.email.trim(),
        phoneNumber: phoneVal,
        role:        newStaff.accountType,
        branchAccess: newStaff.branchAccessIds.map((branchId) => ({
          branchId,
          // A courier's capability is fixed and lives outside this catalogue,
          // so they get assignment without grants. The backend rejects any
          // non-empty group for one.
          groups: isCourierInvite ? [] : (newStaff.access[branchId] ?? []),
        })),
      });
      setStaffList((p) => [...p, mapStaffMember(member)]);
      await logActivity(merchantId, ownerActor, "CREATED", "STAFF", member.id, member.name, {});
      setNewStaff(EMPTY_NEW_STAFF);
      setShowAdd(false);
      const inviteEmail = newStaff.email.trim();
      // Fire-and-forget: send the password-setup email via Firebase so the staff
      // member actually receives it. generateStaffResetLink only returns the URL;
      // it does NOT dispatch an email on its own.
      sendPasswordResetEmail(auth, inviteEmail).catch(() => {});
      gqlGenerateStaffResetLink(member.id).then((link) => {
        setStaffSuccess({ name: member.name, email: inviteEmail, memberId: member.id, link, mode: "invite" });
      }).catch(() => {
        setStaffSuccess({ name: member.name, email: inviteEmail, memberId: member.id, link: "", mode: "invite" });
      });
    } catch (e: unknown) {
      const msg: string = errField(e, "message") ?? "";
      setAddError(
        msg.toLowerCase().includes("email")
          ? "This email is already registered to another account."
          : "Please check the details and try again."
      );
    } finally { setAddSaving(false); }
  };
  // ── Toggle active ──────────────────────────────────────────────────────────
  const confirmToggleActive = async () => {
    if (!inactiveConfirm || !canManageStaff) return;
    const { member, next } = inactiveConfirm;
    setInactiveConfirmSaving(true);
    try {
      await gqlUpdateStaff(member.id, { isActive: next });
      setStaffList((p) => p.map((s) => s.id === member.id ? { ...s, isActive: next } : s));
      setInactiveConfirm(null);
      useNotificationStore.getState().push({
        type: "success", title: next ? "Staff activated" : "Staff set inactive",
        message: `${member.name} is now ${next ? "active" : "inactive"}.`,
      });
    } catch (e: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not update staff status", message: "Please try again.",
      });
    } finally { setInactiveConfirmSaving(false); }
  };
  const handleToggleActive = (member: StaffMember) => {
    if (!canManageStaff) return;
    setInactiveConfirm({ member, next: !member.isActive });
  };
  // ── Archive (soft delete) ──────────────────────────────────────────────────
  const confirmArchive = async () => {
    if (!archiveConfirm || !merchantId || !canManageStaff) return;
    const member = archiveConfirm;
    setArchiveConfirmSaving(true);
    try {
      await gqlArchiveStaff(member.id);
      const now          = new Date();
      const hardDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      setStaffList((p) =>
        p.map((s) =>
          s.id === member.id
            ? { ...s, isArchived: true, isActive: false, archivedAt: now, hardDeleteAt }
            : s
        )
      );
      await ActivityLog.staffArchived(merchantId, ownerActor, member.id, member.name);
      setArchiveConfirm(null);
      useNotificationStore.getState().push({
        type: "success", title: "Staff archived", message: `${member.name} has been archived.`,
      });
    } catch (e: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not archive staff member", message: "Please try again.",
      });
    } finally { setArchiveConfirmSaving(false); }
  };

  const handleArchive = (member: StaffMember) => {
    if (!canManageStaff) return;
    setArchiveConfirm(member);
  };

  // ── Restore from archive ───────────────────────────────────────────────────
  const doRestore = async (member: StaffMember) => {
    if (!merchantId || !canManageStaff) return;
    try {
      await gqlRestoreStaff(member.id);
      setStaffList((p) =>
        p.map((s) =>
          s.id === member.id
            ? { ...s, isArchived: false, isActive: true, archivedAt: null, hardDeleteAt: null }
            : s
        )
      );
      await logActivity(merchantId, ownerActor, "RESTORED", "STAFF", member.id, member.name, {});
      useNotificationStore.getState().push({
        type: "success", title: "Staff restored", message: `${member.name} has been restored and is now active.`,
      });
    } catch (e: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not restore staff member", message: "Please try again.",
      });
    }
  };
  const handleRestore = (member: StaffMember) => {
    if (!canManageStaff) return;
    showConfirm(
      "Restore Staff Member",
      `Restore ${member.name}? They will be set to active and can log in again.`,
      () => { void doRestore(member); },
      { confirmLabel: "Restore" }
    );
  };
  // ── Branch assignment (toggle additional branch access on/off) ─────────────
  const handleBranchAssignment = (member: StaffMember, branchId: string, assign: boolean) => {
    if (!canManageStaff) return;
    // A staff must belong to at least one branch — block removing their last one.
    if (!assign && member.branchAccessIds.length <= 1) {
      showAlert("Cannot remove", "Staff must be assigned to at least one branch. Assign another branch first.");
      return;
    }
    const branchName = branches.find((b) => b.id === branchId)?.name ?? "this branch";
    setBranchConfirm({ member, branchId, branchName, assign });
  };
  const confirmBranchAssignment = async () => {
    if (!branchConfirm || !canManageStaff) return;
    const { member, branchId, assign, branchName } = branchConfirm;
    const next = assign
      ? [...new Set([...member.branchAccessIds, branchId])]
      : member.branchAccessIds.filter((id) => id !== branchId);
    setBranchConfirmSaving(true);
    try {
      await gqlUpdateStaff(member.id, { branchIds: next });
      setStaffList((p) =>
        p.map((s) => s.id === member.id ? { ...s, branchAccessIds: next, branchIds: next } : s)
      );
      setBranchConfirm(null);
      useNotificationStore.getState().push({
        type: "success", title: assign ? "Branch access granted" : "Branch access removed",
        message: `${member.name} ${assign ? "can now access" : "no longer has access to"} ${branchName}.`,
      });
    } catch (e: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not update branch access", message: "Please try again.",
      });
    } finally {
      setBranchConfirmSaving(false);
    }
  };
  // ── Resend password setup link ─────────────────────────────────────────────
  const handleResendLink = (member: StaffMember) => {
    if (!canManageStaff) return;
    gqlGenerateStaffResetLink(member.id)
      .then((link) => {
        showConfirm(
          "Link Ready",
          `A new setup link has been generated for ${member.name}. Share it now — it expires in 1 hour.`,
          () => { void Share.share({ message: link, title: "Password Setup Link" }); },
          { confirmLabel: "Share Link", cancelLabel: "Dismiss" }
        );
      })
      .catch(() => showAlert("Error", "Could not generate a reset link. Try again."));
  };
  // ── Open access editor ─────────────────────────────────────────────────────
  // No catalogue fetch and no reverse-mapping: the server already answered in
  // groups, which is the same vocabulary the owner grants in.
  const openPermissions = (member: StaffMember) => {
    if (!canManageStaff) return;
    setPermTarget(member);
    const draft: BranchAccessDraft = {};
    for (const branchId of member.branchAccessIds) {
      draft[branchId] =
        member.branchAccess.find((e) => e.branchId === branchId)?.groups ?? [];
    }
    setPermDraft(draft);
  };
  // ── Save access ────────────────────────────────────────────────────────────
  const savePermissions = async () => {
    if (!permTarget || !merchantId || !canManageStaff) return;
    setPermSaving(true);
    try {
      const branchAccess = permTarget.branchAccessIds.map((branchId) => ({
        branchId,
        groups: permDraft[branchId] ?? [],
      }));
      const saved = await gqlUpdateStaff(permTarget.id, { branchAccess });
      setStaffList((p) =>
        p.map((s) => (s.id === permTarget.id ? mapStaffMember(saved) : s))
      );
      await logActivity(merchantId, ownerActor, "PERMISSION_CHANGED", "STAFF", permTarget.id, permTarget.name, { branchAccess });
      setPermTarget(null);
      useNotificationStore.getState().push({ type: "success", title: "Permissions saved" });
    } catch (e: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not save permissions", message: "Please try again.",
      });
    } finally { setPermSaving(false); }
  };
  // ── Days remaining before hard delete ────────────────────────────────────
  const daysLeft = (hardDeleteAt: Date | null) => {
    if (!hardDeleteAt) return 30;
    const diff = hardDeleteAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  // One ACTIVE / INACTIVE card — rendered once per section (staff, couriers).
  const renderMemberGroup = (label: string, members: StaffMember[]) => {
    if (members.length === 0) return null;
    return (
      <>
        <Text style={S.subGroupLabel}>{label}</Text>
        <View style={S.subCard}>
          {members.map((member, i) => (
            <View key={member.id}>
              {i > 0 && <View style={S.divider} />}
              <StaffRow
                member={member}
                branches={branches}
                onToggleActive={handleToggleActive}
                onArchive={handleArchive}
                onPermissions={openPermissions}
                onBranchChange={handleBranchAssignment}
                onResendLink={handleResendLink}
                canManage={canManageStaff}
              />
            </View>
          ))}
        </View>
      </>
    );
  };

  // ── Level 1: Branch picker ────────────────────────────────────────────────
  const staffSearchResults = staffSearch.trim().length > 0
    ? staffList.filter((s) =>
        !s.isArchived &&
        (s.name.toLowerCase().includes(staffSearch.toLowerCase()) ||
         s.phone.includes(staffSearch) ||
         s.email.toLowerCase().includes(staffSearch.toLowerCase()))
      )
    : [];

  if (innerView === "branches") {
    return (
      <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
        <HeroHeader compact noWave title="Staff Management" subtitle="Select a branch to manage staff" onBack={onBack} />

        {/* Search bar */}
        <View style={S.staffSearchWrap}>
          <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
            <View style={S.staffSearchBar}>
              <I.Search />
              <TextInput
                style={S.staffSearchInput}
                placeholder="Search staff by name, phone or email…"
                placeholderTextColor={C.gray400}
                value={staffSearch}
                onChangeText={setStaffSearch}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
            </View>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ padding: SP._16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Search results ────────────────────────────────────────────── */}
          {staffSearch.trim().length > 0 ? (
            <>
              {(() => {
                const resultSuffix = staffSearchResults.length !== 1 ? "S" : "";
                const resultCountLabel = staffSearchResults.length > 0
                  ? `${staffSearchResults.length} RESULT${resultSuffix}`
                  : "NO RESULTS";
                return <Text style={S.subGroupLabel}>{resultCountLabel}</Text>;
              })()}
              {staffSearchResults.length === 0 ? (
                <View style={[S.staffEmpty, { marginTop: SP._12 }]}>
                  <Text style={S.staffEmptyTitle}>No staff found</Text>
                  <Text style={S.staffEmptyBody}>Try a different name, phone, or email.</Text>
                </View>
              ) : (
                <View style={S.subCard}>
                  {staffSearchResults.map((s, idx) => {
                    const staffBranchNames = branches
                      .filter((b) => s.branchAccessIds.includes(b.id))
                      .map((b) => b.name);
                    const firstBranchId = s.branchAccessIds[0] ?? null;
                    const roleColor = ROLE_COLORS[s.role] ?? C.gray600;
                    return (
                      <React.Fragment key={s.id}>
                        {idx > 0 && <View style={S.divider} />}
                        <TouchableOpacity
                          style={S.staffSearchResultRow}
                          onPress={() => {
                            if (firstBranchId) {
                              setStaffSearch("");
                              setSelectedBranchId(firstBranchId);
                              setInnerView("staff");
                            }
                          }}
                          activeOpacity={0.75}
                        >
                          <View style={[S.staffAvatar, { backgroundColor: C.brand100 }]}>
                            <Text style={[S.staffAvatarText, { color: C.brand700 }]}>
                              {s.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6 }}>
                              <Text style={S.staffName}>{s.name}</Text>
                              <View style={[S.staffRoleBadge, { backgroundColor: roleColor }]}>
                                <Text style={S.staffRoleText}>{s.role}</Text>
                              </View>
                            </View>
                            {staffBranchNames.length > 0 && (
                              <Text style={S.staffSearchResultBranch} numberOfLines={1}>
                                {staffBranchNames.join(", ")}
                              </Text>
                            )}
                            {Boolean(s.phone || s.email) && (
                              <Text style={S.staffPhone} numberOfLines={1}>
                                {s.phone || s.email}
                              </Text>
                            )}
                          </View>
                          <I.Chevron c={C.gray300} />
                        </TouchableOpacity>
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </>
          ) : (
            <>
          {/* ── Pending Device Approvals ──────────────────────────────────── */}
          {deviceNotifs.length > 0 && (
            <>
              <Text style={[S.subGroupLabel, { color: C.warning700 }]}>PENDING DEVICE APPROVALS</Text>
              <View style={[S.subCard, { marginBottom: SP._20 }]}>
                {deviceNotifs.map((notif, idx) => {
                  const isLoading = deviceActionLoading === notif.id;
                  const timeAgo = notif.createdAt
                    ? (() => {
                        const diff = Date.now() - notif.createdAt.getTime();
                        if (diff < 60000) return "just now";
                        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                        return `${Math.floor(diff / 86400000)}d ago`;
                      })()
                    : "";
                  return (
                    <View key={notif.id}>
                      {idx > 0 && <View style={S.divider} />}
                      <View style={S.deviceNotifRow}>
                        <View style={S.deviceNotifIcon}>
                          <I.Shield c={C.warning700} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={S.deviceNotifName}>{notif.staffName}</Text>
                          <Text style={S.deviceNotifMeta}>
                            {notif.deviceName}
                            {notif.platform ? ` · ${notif.platform}` : ""}
                            {timeAgo ? ` · ${timeAgo}` : ""}
                          </Text>
                          <Text style={S.deviceNotifId} numberOfLines={1}>
                            ID: {notif.deviceId.slice(0, 18)}…
                          </Text>
                        </View>
                        {isLoading ? (
                          <ActivityIndicator color={C.brand500} size="small" style={{ marginLeft: SP._8 }} />
                        ) : (
                          <View style={S.deviceNotifActions}>
                            <TouchableOpacity
                              style={[S.deviceActionBtn, { backgroundColor: C.success100, borderColor: "#6EE7B7" }]}
                              onPress={() => { void handleApproveDevice(notif); }}
                              activeOpacity={0.8}
                            >
                              <Text style={[S.deviceActionText, { color: C.success700 }]}>Approve</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[S.deviceActionBtn, { backgroundColor: "#FEF2F2", borderColor: "#FECACA" }]}
                              onPress={() => handleBlockDevice(notif)}
                              activeOpacity={0.8}
                            >
                              <Text style={[S.deviceActionText, { color: C.error500 }]}>Block</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
          <Text style={S.subGroupLabel}>SELECT A BRANCH</Text>
          {branches.length === 0 ? (
            <View style={[S.staffEmpty, { marginTop: SP._24 }]}>
              <View style={S.staffEmptyIcon}><I.Building c={C.gray300} s={36} /></View>
              <Text style={S.staffEmptyTitle}>No branches yet</Text>
              <Text style={S.staffEmptyBody}>Create a branch first before adding staff.</Text>
            </View>
          ) : (
            <View style={S.subCard}>
              {branches.map((b, idx) => {
                const members = staffList.filter((s) => s.branchAccessIds.includes(b.id) && !s.isArchived);
                const count = members.filter((s) => !isCourier(s)).length;
                const couriers = members.filter(isCourier).length;
                const active = members.filter((s) => s.isActive).length;
                return (
                  <React.Fragment key={b.id}>
                    {idx > 0 && <View style={S.divider} />}
                    <TouchableOpacity
                      style={S.staffBranchCard}
                      onPress={() => { setSelectedBranchId(b.id); setInnerView("staff"); }}
                      activeOpacity={0.75}
                    >
                      <View style={S.staffBranchCardIcon}>
                        <I.Building c={C.brand500} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={S.staffBranchCardName}>{b.name}</Text>
                        {!!b.address && (
                          <Text style={S.staffBranchCardAddr} numberOfLines={1}>{b.address}</Text>
                        )}
                        <Text style={S.staffBranchCardCount}>
                          {count} staff{couriers > 0 ? ` · ${couriers} courier${couriers === 1 ? "" : "s"}` : ""} · {active} active
                        </Text>
                      </View>
                      <I.Chevron c={C.gray300} />
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          )}
          {branches.length > 0 && <Text style={S.auditEndOfList}>— End of results —</Text>}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Level 2: Staff list for selected branch ───────────────────────────────
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar
        title={selectedBranch?.name ?? "Staff"}
        onBack={initialBranchId ? onBack : () => { setInnerView("branches"); setSelectedBranchId(null); }}
        blue
        right={
          <AddButton
            label="Add"
            variant="link"
            onPress={openAddSheet}
            disabled={!canManageStaff}
          />
        }
      />
      {/* ── Branch Access Confirmation Modal ───────────────────────────────── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={!!branchConfirm}
        transparent
        animationType={Platform.OS === "android" ? "none" : "fade"}
        onRequestClose={() => !branchConfirmSaving && setBranchConfirm(null)}
      >
        <View style={S.confirmOverlay}>
          <View style={S.confirmCard}>
            {branchConfirm && (() => {
              const { member, branchName, assign } = branchConfirm;
              return (
                <>
                  <Text style={S.confirmTitle}>
                    {assign ? "Grant branch access?" : "Remove branch access?"}
                  </Text>

                  <View style={S.confirmSection}>
                    <Text style={S.confirmSectionLabel}>
                      {assign ? `${member.name} will be able to access:` : `${member.name} will lose access to:`}
                    </Text>
                    <View style={S.confirmBranchPill}>
                      <Text style={[S.confirmBranchPillText, !assign && { color: C.error500 }]}>
                        {branchName}
                      </Text>
                    </View>
                  </View>

                  {!assign && (
                    <Text style={S.confirmNote}>
                      They will keep access to their other assigned branches.
                    </Text>
                  )}

                  <View style={S.confirmActions}>
                    <TouchableOpacity
                      style={S.confirmCancelBtn}
                      onPress={() => setBranchConfirm(null)}
                      disabled={branchConfirmSaving}
                      activeOpacity={0.7}
                    >
                      <Text style={S.confirmCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[S.confirmActionBtn, !assign && S.confirmActionBtnDestructive]}
                      onPress={() => { void confirmBranchAssignment(); }}
                      disabled={branchConfirmSaving}
                      activeOpacity={0.8}
                    >
                      {branchConfirmSaving
                        ? <ActivityIndicator size="small" color={C.white} />
                        : <Text style={S.confirmActionText}>
                            {assign ? "Grant access" : "Remove access"}
                          </Text>
                      }
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── Permissions Editor Modal ────────────────────────────────────────── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={!!permTarget}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPermTarget(null)}
      >
        <SafeAreaView style={S.subSafe} edges={["top", "bottom"]}>
          <View style={S.subHeader}>
            <TouchableOpacity style={S.backBtn} onPress={() => setPermTarget(null)} activeOpacity={0.7} hitSlop={8}>
              <I.Back />
              <Text style={S.backText}>Staff</Text>
            </TouchableOpacity>
            <View style={S.subHeaderCenter}>
              <Text style={S.subTitle}>Permissions</Text>
              {permTarget ? <Text style={S.subSubtitle}>{permTarget.name} · {permTarget.role}</Text> : null}
            </View>
            <TouchableOpacity
              style={[S.saveBtn, (permSaving || !canManageStaff) && { opacity: 0.6 }]}
              onPress={() => { void savePermissions(); }}
              disabled={permSaving || !canManageStaff}
              activeOpacity={0.8}
            >
              {(permSaving)
                ? <ActivityIndicator color={C.white} size="small" />
                : <Text style={S.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }} contentContainerStyle={S.subScroll} showsVerticalScrollIndicator={false}>
            {permTarget && (
              <>
                {permTarget.role === "COURIER" ? (
                  <CourierAccessNotice />
                ) : (
                  <>
                    <View style={S.permInfoBanner}>
                      <I.Info c={C.brand600} />
                      <Text style={S.permInfoText}>
                        Access is set per branch. {permTarget.name} can be given
                        different responsibilities at each branch they work.
                      </Text>
                    </View>
                    <BranchAccessEditor
                      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                      selectedBranchIds={permTarget.branchAccessIds}
                      draft={permDraft}
                      onChange={setPermDraft}
                      disabled={permSaving}
                    />
                  </>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      {/* ── Add Staff Sheet ─────────────────────────────────────────────────── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={showAdd}
        // Android's transparent Modal briefly shows an opaque black window
        // before the JS content paints when animationType="fade" — the native
        // fade-in and the JS mount aren't synced. "none" skips that flash;
        // iOS doesn't have this bug, so it keeps the nicer fade transition.
        animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
        transparent={isTablet}
        presentationStyle={isTablet ? "overFullScreen" : "pageSheet"}
        onRequestClose={() => { setAddError(null); setShowAdd(false); }}
      >
        <View style={isTablet ? S.sheetTabletOverlay : { flex: 1 }}>
        <SafeAreaView style={[{ flex: 1, backgroundColor: C.white }, isTablet && S.sheetTabletCard]} edges={isTablet ? [] : ["top", "bottom"]}>
          {/* Error toast — inside the sheet so it isn't blocked by the
              one-native-modal-at-a-time limit. */}
          {addError && (
            <View pointerEvents="none" style={{ position: "absolute", top: SP._12, left: SP._16, right: SP._16, zIndex: 10, alignItems: "center" }}>
              <View style={{ backgroundColor: C.error500, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, maxWidth: 420, width: "100%" }}>
                <Text style={{ color: C.white, fontSize: 14, fontWeight: "600" }}>{addError}</Text>
              </View>
            </View>
          )}
          <View style={S.sheetHeader}>
            <Text style={S.sheetTitle}>Add Team Member</Text>
            <TouchableOpacity onPress={() => { setAddError(null); setShowAdd(false); }} hitSlop={12} style={S.sheetCloseBtn} activeOpacity={0.7}>
              <I.X c={C.gray500} s={18} />
            </TouchableOpacity>
          </View>
          {/* KeyboardAvoidingView — this Modal opens its own Android window and
              does NOT inherit the Activity's windowSoftInputMode="adjustResize",
              so without "height" here the sheet doesn't shrink for the keyboard
              and fields below the fold become unreachable even in a ScrollView. */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={S.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: "row", gap: SP._10 }}>
              <View style={{ flex: 1 }}>
                <BField label="First Name *" value={newStaff.firstName} onChange={(v) => setNewStaff((p) => ({ ...p, firstName: v }))} placeholder="Juan" />
                {newStaff.firstName.trim().length > 0 && !NAME_RE.test(newStaff.firstName.trim()) && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: -SP._4, marginBottom: SP._4, paddingHorizontal: SP._16 }}>
                    <Ionicons name="close-circle" size={13} color={C.error500} />
                    <Text style={{ fontSize: 12, color: C.error500, fontWeight: "600", flexShrink: 1 }}>Letters only</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <BField label="Last Name *" value={newStaff.lastName} onChange={(v) => setNewStaff((p) => ({ ...p, lastName: v }))} placeholder="dela Cruz" />
                {newStaff.lastName.trim().length > 0 && !NAME_RE.test(newStaff.lastName.trim()) && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: -SP._4, marginBottom: SP._4, paddingHorizontal: SP._16 }}>
                    <Ionicons name="close-circle" size={13} color={C.error500} />
                    <Text style={{ fontSize: 12, color: C.error500, fontWeight: "600", flexShrink: 1 }}>Letters only</Text>
                  </View>
                )}
              </View>
            </View>

            <BField label="Email *" value={newStaff.email} onChange={(v) => setNewStaff((p) => ({ ...p, email: v }))} placeholder="juan@email.com" keyboardType="email-address" />
            {newStaff.email.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: -SP._8, marginBottom: SP._4, paddingHorizontal: SP._16 }}>
                {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStaff.email.trim()) ? (
                  <>
                    <Ionicons name="checkmark-circle" size={13} color={C.success500} />
                    <Text style={{ fontSize: 12, color: C.success500, fontWeight: "600" }}>Valid email</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={13} color={C.error500} />
                    <Text style={{ fontSize: 12, color: C.error500, fontWeight: "600" }}>Enter a valid email (e.g. juan@email.com)</Text>
                  </>
                )}
              </View>
            )}
            <BField label="Phone" value={newStaff.phone} onChange={(v) => setNewStaff((p) => ({ ...p, phone: v }))} placeholder="09171234567" keyboardType="phone-pad" maxLength={11} />
            {newStaff.phone.trim().length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: -SP._8, marginBottom: SP._4, paddingHorizontal: SP._16 }}>
                {/^09\d{9}$/.test(newStaff.phone.trim()) ? (
                  <>
                    <Ionicons name="checkmark-circle" size={13} color={C.success500} />
                    <Text style={{ fontSize: 12, color: C.success500, fontWeight: "600" }}>Valid phone number</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={13} color={C.error500} />
                    <Text style={{ fontSize: 12, color: C.error500, fontWeight: "600" }}>Must be 11 digits starting with 09 (e.g. 09171234567)</Text>
                  </>
                )}
              </View>
            )}

            {/* ── Account type ──────────────────────────────────────────── */}
            {/* Two types, and only two. Manager and Cashier never existed
                server-side — the backend has only ever accepted STAFF or
                COURIER — so offering them was a promise the API could not
                keep. */}
            <Text style={S.permGroupLabel}>Account type</Text>
            <View style={{ flexDirection: "row", gap: SP._8, marginBottom: SP._12 }}>
              {(["STAFF", "COURIER"] as const).map((type) => {
                const active = newStaff.accountType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setNewStaff((p) => ({ ...p, accountType: type }))}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: SP._8,
                      paddingVertical: SP._12,
                      paddingHorizontal: SP._12,
                      borderRadius: RADIUS.md,
                      borderWidth: 1.5,
                      borderColor: active ? C.brand500 : C.gray200,
                      backgroundColor: active ? C.brand50 : C.white,
                    }}
                  >
                    <Ionicons
                      name={type === "STAFF" ? "person-outline" : "bicycle-outline"}
                      size={18}
                      color={active ? C.brand600 : C.gray500}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: active ? C.brand700 : C.gray800 }}>
                        {type === "STAFF" ? "Staff" : "Courier"}
                      </Text>
                      <Text style={{ fontSize: 11, color: C.gray500 }}>
                        {type === "STAFF" ? "Works the shop" : "Pickup & delivery"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Branches ──────────────────────────────────────────────── */}
            <Text style={S.permGroupLabel}>
              {branches.length > 1 ? "Branches" : "Branch"}
            </Text>
            {branches.map((b) => {
              const on = newStaff.branchAccessIds.includes(b.id);
              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => setNewStaff((p) => {
                    const ids = on
                      ? p.branchAccessIds.filter((id) => id !== b.id)
                      : [...p.branchAccessIds, b.id];
                    // A newly added branch copies the first branch's access,
                    // because someone working two branches almost always does
                    // the same job at both. The editor below lets them differ.
                    const access = { ...p.access };
                    if (!on) access[b.id] = access[ids[0]] ?? [];
                    else delete access[b.id];
                    return { ...p, branchAccessIds: ids, access };
                  })}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: SP._10,
                    paddingVertical: SP._10,
                    paddingHorizontal: SP._12,
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: on ? C.brand500 : C.gray200,
                    backgroundColor: on ? C.brand50 : C.white,
                    marginBottom: SP._6,
                  }}
                >
                  <Ionicons
                    name={on ? "checkbox" : "square-outline"}
                    size={20}
                    color={on ? C.brand500 : C.gray400}
                  />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: C.gray800 }}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* ── Access ────────────────────────────────────────────────── */}
            <View style={{ marginBottom: SP._12 }}>
              {newStaff.accountType === "COURIER" ? (
                <CourierAccessNotice />
              ) : (
                <BranchAccessEditor
                  branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                  selectedBranchIds={newStaff.branchAccessIds}
                  draft={newStaff.access}
                  onChange={(access) => setNewStaff((p) => ({ ...p, access }))}
                  disabled={addSaving}
                />
              )}
            </View>

            <View style={{ backgroundColor: C.brand50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.brand100, padding: SP._12, marginBottom: SP._16, flexDirection: "row", alignItems: "flex-start", gap: SP._8 }}>
              <Ionicons name="mail-outline" size={18} color={C.brand700} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: C.brand700, lineHeight: 18 }}>
                An invite link will be sent to the staff member's email so they can set their own password and log in.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                S.addStaffConfirmBtn,
                (!canAddStaff || !canManageStaff || addSaving) && { backgroundColor: C.gray300, shadowOpacity: 0, elevation: 0 },
                addSaving && { opacity: 0.7 },
              ]}
              onPress={() => void handleAdd()}
              disabled={!canAddStaff || !canManageStaff || addSaving}
              activeOpacity={0.85}
            >
              {addSaving
                ? <ActivityIndicator color={C.white} />
                : <Text style={[S.addStaffConfirmText, (!canAddStaff || !canManageStaff) && { color: C.gray500 }]}>
                    {canAddStaff ? "Send Invite" : "Complete required fields"}
                  </Text>
              }
            </TouchableOpacity>
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        </View>
      </Modal>
      {/* ── Staff Added Success Modal ─────────────────────────────────────── */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={!!staffSuccess} transparent animationType={Platform.OS === "android" ? "none" : "fade"} onRequestClose={() => setStaffSuccess(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: C.white, borderRadius: RADIUS.xl, padding: SP._24, width: "100%", maxWidth: 480 }}>
            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: SP._16 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.success100, alignItems: "center", justifyContent: "center", marginBottom: SP._10 }}>
                <Ionicons name="mail-outline" size={24} color={C.success700} />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.gray900 }}>Invite Sent!</Text>
              <Text style={{ fontSize: 14, color: C.gray500, marginTop: 4, textAlign: "center" }}>
                {staffSuccess?.name} has been added.
              </Text>
              <Text style={{ fontSize: 13, color: C.gray400, marginTop: 2, textAlign: "center" }}>
                Invite sent to{" "}
                <Text style={{ fontWeight: "600", color: C.gray700 }}>{staffSuccess?.email}</Text>
              </Text>
            </View>

            {/* Invite link box */}
            <Text style={{ fontSize: 11, fontWeight: "700", color: C.gray500, marginBottom: SP._6, letterSpacing: 0.6, textTransform: "uppercase" }}>
              Invite Link
            </Text>
            {staffSuccess?.link ? (
              <View style={{ backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, padding: SP._12, marginBottom: SP._4 }}>
                <Text style={{ fontSize: 11, color: C.gray600, lineHeight: 16 }} numberOfLines={2} ellipsizeMode="middle">
                  {staffSuccess.link}
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: C.warning100, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.warning300, padding: SP._12, marginBottom: SP._4 }}>
                <Text style={{ fontSize: 12, color: C.gray600 }}>Could not generate link.</Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: C.gray400, marginBottom: SP._12, textAlign: "center" }}>
              Link expires in 1 hour.
            </Text>

            {/* Share / Copy / Resend actions */}
            {!!staffSuccess?.link && (
              <View style={{ flexDirection: "row", gap: SP._10, marginBottom: SP._10 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: C.brand500, borderRadius: RADIUS.md, paddingVertical: SP._14, alignItems: "center" }}
                  onPress={() => { void Share.share({ message: staffSuccess?.link ?? "", title: "Staff Invite Link" }); }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: C.white, fontWeight: "700", fontSize: 14 }}>Share Link</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, borderRadius: RADIUS.md, paddingVertical: SP._14, alignItems: "center", borderWidth: 1.5, borderColor: C.brand500 }}
                  onPress={() => { void Share.share({ message: staffSuccess?.link ?? "" }); }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: C.brand500, fontWeight: "700", fontSize: 14 }}>Copy Link</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Resend invite link */}
            <TouchableOpacity
              style={{ borderRadius: RADIUS.md, paddingVertical: SP._12, alignItems: "center", borderWidth: 1, borderColor: resendInviteCooldown > 0 ? C.gray200 : C.brand200, backgroundColor: resendInviteCooldown > 0 ? C.gray50 : C.brand50, marginBottom: SP._8 }}
              onPress={() => void handleResendInviteLink()}
              disabled={resendInviteCooldown > 0}
              activeOpacity={0.75}
            >
              <Text style={{ color: resendInviteCooldown > 0 ? C.gray400 : C.brand600, fontWeight: "600", fontSize: 13 }}>
                {resendInviteCooldown > 0 ? `Resend Link in ${resendInviteCooldown}s` : "Resend Invite Link"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ borderRadius: RADIUS.md, paddingVertical: SP._14, alignItems: "center", borderWidth: 1, borderColor: C.gray200 }}
              onPress={() => { setStaffSuccess(null); setResendInviteCooldown(0); }}
              activeOpacity={0.85}
            >
              <Text style={{ color: C.gray700, fontWeight: "600", fontSize: 15 }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* ── Set Inactive / Set Active Confirmation ───────────────────────── */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={!!inactiveConfirm} transparent animationType={Platform.OS === "android" ? "none" : "fade"} onRequestClose={() => !inactiveConfirmSaving && setInactiveConfirm(null)}>
        <View style={S.confirmOverlay}>
          <View style={S.confirmCard}>
            {inactiveConfirm && (
              <>
                <Text style={S.confirmTitle}>{inactiveConfirm.next ? "Set Active?" : "Set Inactive?"}</Text>
                <Text style={[S.confirmNote, { marginTop: 8 }]}>
                  {inactiveConfirm.next
                    ? `${inactiveConfirm.member.name} will be able to log in again.`
                    : `${inactiveConfirm.member.name} will not be able to log in. You can reactivate them at any time.`}
                </Text>
                <View style={S.confirmActions}>
                  <TouchableOpacity style={S.confirmCancelBtn} onPress={() => setInactiveConfirm(null)} disabled={inactiveConfirmSaving} activeOpacity={0.7}>
                    <Text style={S.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.confirmActionBtn, !inactiveConfirm.next && S.confirmActionBtnDestructive]}
                    onPress={() => { void confirmToggleActive(); }}
                    disabled={inactiveConfirmSaving}
                    activeOpacity={0.8}
                  >
                    {(() => {
                      const toggleLabel = inactiveConfirm.next ? "Set Active" : "Set Inactive";
                      return inactiveConfirmSaving
                        ? <ActivityIndicator size="small" color={C.white} />
                        : <Text style={S.confirmActionText}>{toggleLabel}</Text>;
                    })()}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      {/* ── Archive Confirmation ─────────────────────────────────────────── */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={!!archiveConfirm} transparent animationType={Platform.OS === "android" ? "none" : "fade"} onRequestClose={() => !archiveConfirmSaving && setArchiveConfirm(null)}>
        <View style={S.confirmOverlay}>
          <View style={S.confirmCard}>
            {archiveConfirm && (
              <>
                <Text style={S.confirmTitle}>Archive {archiveConfirm.name}?</Text>
                <Text style={[S.confirmNote, { marginTop: 8 }]}>
                  They will be hidden from the team list and cannot log in. Their record will be permanently deleted after 30 days — you can restore them before then.
                </Text>
                <View style={S.confirmActions}>
                  <TouchableOpacity style={S.confirmCancelBtn} onPress={() => setArchiveConfirm(null)} disabled={archiveConfirmSaving} activeOpacity={0.7}>
                    <Text style={S.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.confirmActionBtn, S.confirmActionBtnDestructive]} onPress={() => { void confirmArchive(); }} disabled={archiveConfirmSaving} activeOpacity={0.8}>
                    {archiveConfirmSaving
                      ? <ActivityIndicator size="small" color={C.white} />
                      : <Text style={S.confirmActionText}>Archive</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <ScrollView style={{ flex: 1, backgroundColor: C.gray50, maxWidth: 880, width: "100%", alignSelf: "center" }} contentContainerStyle={S.subScroll} showsVerticalScrollIndicator={false}>
        {/* Summary chips */}
        <View style={S.staffSummaryRow}>
          <View style={S.staffChip}>
            <Text style={S.staffChipNum}>{staffCount}</Text>
            <Text style={S.staffChipLabel}>Staff</Text>
          </View>
          <View style={[S.staffChip, { backgroundColor: C.courier100 }]}>
            <Text style={[S.staffChipNum, { color: C.courier700 }]}>{courierCount}</Text>
            <Text style={[S.staffChipLabel, { color: C.courier700 }]}>Couriers</Text>
          </View>
          <View style={[S.staffChip, { backgroundColor: C.success100 }]}>
            <Text style={[S.staffChipNum, { color: C.success700 }]}>{activeMembers.length + activeCouriers.length}</Text>
            <Text style={[S.staffChipLabel, { color: C.success700 }]}>Active</Text>
          </View>
          {archivedMembers.length > 0 && (
            <View style={[S.staffChip, { backgroundColor: C.warning100 }]}>
              <Text style={[S.staffChipNum, { color: C.warning700 }]}>{archivedMembers.length}</Text>
              <Text style={[S.staffChipLabel, { color: C.warning700 }]}>Archived</Text>
            </View>
          )}
        </View>
        {/* Add staff CTA */}
        <AddButton
          label="Add Team Member"
          variant="cta"
          style={{ marginBottom: SP._20 }}
          onPress={openAddSheet}
          disabled={!canManageStaff}
        />
        {branchStaff.filter((s) => s.isArchived === false).length === 0 ? (
          <View style={S.staffEmpty}>
            <View style={S.staffEmptyIcon}><I.Users c={C.gray300} s={36} /></View>
            <Text style={S.staffEmptyTitle}>No staff yet</Text>
            <Text style={S.staffEmptyBody}>Add your first team member. They can tap their name at the POS terminal to start their shift.</Text>
          </View>
        ) : (
          <>
            {/* ── Staff ─────────────────────────────────────────────────────── */}
            {staffCount > 0 && (
              <>
                <Text style={S.staffSectionTitle}>Staff ({staffCount})</Text>
                {renderMemberGroup("ACTIVE", activeMembers)}
                {renderMemberGroup("INACTIVE", inactiveMembers)}
              </>
            )}
            {/* ── Couriers — provisioned here, but they work the delivery app ── */}
            {courierCount > 0 && (
              <>
                <View style={S.staffSectionHeaderRow}>
                  <Text style={[S.staffSectionTitle, { marginTop: 0 }]}>Couriers ({courierCount})</Text>
                  <Ionicons name="bicycle-outline" size={18} color={C.courier700} />
                </View>
                <Text style={S.staffSectionHint}>
                  Riders handling pickups and deliveries. They log in to the courier app, not the POS.
                </Text>
                {renderMemberGroup("ACTIVE", activeCouriers)}
                {renderMemberGroup("INACTIVE", inactiveCouriers)}
              </>
            )}
          </>
        )}
        {/* Archived section (collapsible) */}
        {archivedMembers.length > 0 && (
          <>
            <TouchableOpacity
              style={S.archivedToggleRow}
              onPress={() => setShowArchived((v) => !v)}
              activeOpacity={0.8}
            >
              <I.Archive c={C.gray500} />
              <Text style={S.archivedToggleText}>
                {showArchived ? "Hide" : "Show"} Archived ({archivedMembers.length})
              </Text>
              <I.Chevron c={C.gray400} />
            </TouchableOpacity>
            {showArchived && (
              <View style={[S.subCard, { marginTop: SP._8 }]}>
                {archivedMembers.map((member, i) => (
                  <View key={member.id}>
                    {i > 0 && <View style={S.divider} />}
                    <View style={S.archivedRow}>
                      <View style={[S.staffAvatar, { backgroundColor: C.gray300 }]}>
                        <Text style={S.staffAvatarText}>{(member.name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6 }}>
                          <Text style={[S.staffName, { color: C.gray500 }]}>{member.name}</Text>
                          {isCourier(member) && (
                            <View style={[S.staffRoleBadge, { backgroundColor: C.courier700 }]}>
                              <Text style={S.staffRoleText}>COURIER</Text>
                            </View>
                          )}
                        </View>
                        <Text style={S.archivedNote}>
                          Permanent deletion in {daysLeft(member.hardDeleteAt)} day{daysLeft(member.hardDeleteAt) === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[S.restoreBtn, !canManageStaff && { opacity: 0.4 }]}
                        onPress={() => handleRestore(member)}
                        disabled={!canManageStaff}
                        activeOpacity={0.8}
                      >
                        <Text style={S.restoreBtnText}>Restore</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {branchStaff.filter((s) => s.isArchived === false).length > 0 && (
          <Text style={S.auditEndOfList}>— End of results —</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Staff row component ────────────────────────────────────────────────────────
function StaffRow({
  member, branches, onToggleActive, onArchive, onPermissions, onBranchChange, onResendLink, canManage,
}: Readonly<{
  member: StaffMember;
  branches: Branch[];
  onToggleActive: (m: StaffMember) => void;
  onArchive: (m: StaffMember) => void;
  onPermissions: (m: StaffMember) => void;
  onBranchChange: (m: StaffMember, branchId: string, assign: boolean) => void;
  onResendLink: (m: StaffMember) => void;
  canManage: boolean;
}>) {
  const [expanded, setExpanded] = useState(false);
  const isMultiBranch = branches.length > 1;
  const memberSince = member.createdAt
    ? `Member since ${member.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
    : null;
  return (
    <View>
      <TouchableOpacity
        style={S.staffRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View style={[S.staffAvatar, { backgroundColor: ROLE_COLORS[member.role] ?? C.brand500 }]}>
          <Text style={S.staffAvatarText}>{(member.name || "?").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={S.staffName}>{member.name}</Text>
            <View style={[S.staffRoleBadge, { backgroundColor: ROLE_COLORS[member.role] ?? C.brand500 }]}>
              <Text style={S.staffRoleText}>{member.role}</Text>
            </View>
          </View>
          {!!member.email && <Text style={S.staffPhone}>{member.email}</Text>}
          {!member.email && !!member.phone && <Text style={S.staffPhone}>{member.phone}</Text>}
          {!!memberSince && <Text style={[S.staffPhone, { color: C.gray400, fontSize: 11 }]}>{memberSince}</Text>}
          {!member.email && !member.phone && !memberSince && <Text style={S.staffPhone}>No contact info</Text>}
        </View>
        <View style={[S.staffStatusDot, { backgroundColor: member.isActive ? C.success500 : C.gray300 }]} />
        <I.Chevron c={C.gray300} />
      </TouchableOpacity>
      {expanded && (
        <View style={S.staffExpanded}>
          {/* Assigned branches — multi-branch merchants only. Every branch is a
              simple toggle; there is no primary/home branch. */}
          {isMultiBranch && (
            <View style={S.staffBranchSection}>
              <Text style={S.staffBranchLabel}>Assigned Branches</Text>
              {branches.map((br) => {
                const assigned = member.branchAccessIds.includes(br.id);
                const branchRowDisabled = !canManage;
                return (
                  <TouchableOpacity
                    key={br.id}
                    style={[S.staffBranchRow, !canManage && { opacity: 0.45 }]}
                    onPress={() => !branchRowDisabled && onBranchChange(member, br.id, !assigned)}
                    disabled={branchRowDisabled}
                    activeOpacity={0.75}
                  >
                    <View style={[S.branchToggleBox, assigned && S.branchToggleBoxChecked]}>
                      {assigned && <Ionicons name="checkmark" size={10} color={C.white} />}
                    </View>
                    <Text style={S.staffBranchName}>{br.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Compact action pill row. Couriers get no Permissions pill — the
              merchant permission set gates POS/inventory work they never do. */}
          <View style={S.staffActionRow}>
            {!isCourier(member) && (
              <TouchableOpacity
                style={[S.staffActionPill, !canManage && { opacity: 0.4 }]}
                onPress={() => onPermissions(member)}
                disabled={!canManage}
                activeOpacity={0.8}
              >
                <I.Lock c={C.brand600} />
                <Text style={[S.staffActionPillText, { color: C.brand600 }]}>Permissions</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[S.staffActionPill, !canManage && { opacity: 0.4 }]}
              onPress={() => onResendLink(member)}
              disabled={!canManage}
              activeOpacity={0.8}
            >
              <Text style={S.staffActionPillText}>Resend Link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.staffActionPill, !canManage && { opacity: 0.4 }]}
              onPress={() => onToggleActive(member)}
              disabled={!canManage}
              activeOpacity={0.8}
            >
              <Text style={S.staffActionPillText}>{member.isActive ? "Set Inactive" : "Set Active"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.staffActionPill, { borderColor: C.error100 }, !canManage && { opacity: 0.4 }]}
              onPress={() => onArchive(member)}
              disabled={!canManage}
              activeOpacity={0.8}
            >
              <I.Archive c={C.error500} />
              <Text style={[S.staffActionPillText, { color: C.error500 }]}>Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS SCREEN (INLINE) — read-only, append-only audit trail
// ══════════════════════════════════════════════════════════════════════════════
// ─── Reusable: Branch form field ──────────────────────────────────────────────
function BField({
  label, value, onChange, placeholder, keyboardType, multiline, hint, secureTextEntry, maxLength, autoCapitalize,
}: Readonly<{
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean; hint?: string; secureTextEntry?: boolean; maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}>) {
  const [focused, setFocused] = useState(false);
  // Numeric keyboards don't block letters/symbols (hardware keyboard, paste) — filter here.
  const handleChange = (v: string) => {
    if (keyboardType === "phone-pad" || keyboardType === "number-pad") onChange(v.replace(/\D/g, ""));
    else if (keyboardType === "decimal-pad" || keyboardType === "numeric") onChange(v.replace(/[^\d.]/g, ""));
    else onChange(v);
  };
  return (
    <View style={{ paddingVertical: SP._12 }}>
      <Text style={S.fieldLabel}>
        {label.endsWith(" *") ? label.slice(0, -2) : label}
        {label.endsWith(" *") && <Text style={{ color: C.error500, fontWeight: "700" }}> *</Text>}
      </Text>
      <TextInput
        style={[
          S.bFieldInput,
          focused && S.bFieldInputFocused,
          multiline && { height: 72, textAlignVertical: "top", paddingTop: SP._12 },
        ]}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? (keyboardType === "email-address" ? "none" : "sentences")}
        maxLength={maxLength}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {hint ? <Text style={S.fieldHint}>{hint}</Text> : null}
    </View>
  );
}
