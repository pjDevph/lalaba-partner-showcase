// Registered devices management screen — extracted from settings.tsx.
// Owner picks a branch, then manages the devices registered to THAT branch
// (req #4). Staff-registered devices arrive PENDING → owner Approves/Disapproves;
// once APPROVED the owner can Block or Remove them.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { TopBar } from "../../components/ui";
import { BranchPickerView } from "../../components/BranchPickerView";
import { showConfirm } from "../../lib/dialog";
import { useNotificationStore } from "../../stores/notificationStore";
import {
  gqlMyDevices, gqlDevicesByBranch,
  gqlApproveDevice, gqlDisapproveDevice, gqlBlockDevice, gqlUnblockDevice, gqlDeleteDevice,
  type RegisteredDevice, type DeviceStatus,
} from "../../services/graphql/devices";
import type { Branch } from "../../stores/merchantStore";
import { useDeepLinkStore } from "../../stores/deepLinkStore";
import { I } from "./shared";
import { S } from "./styles";

const STATUS_COLOR: Record<DeviceStatus, string> = {
  PENDING:  C.warning500,
  APPROVED: C.success500,
  BLOCKED:  C.error500,
};

// active = isActive; pending = staff request awaiting approval; blocked = the rest.
// function deviceStatus(device: RegisteredDevice): "approved" | "pending" | "blocked" {
//   if (device.isActive) return "approved";
//   return device.isPending ? "pending" : "blocked";
// }

// Legacy devices registered before branch scoping have branchId=null — count
// them toward every branch so they never silently disappear from either the
// picker's meta text or the filtered Level 2 list.
// function deviceInBranch(device: RegisteredDevice, branchId: string): boolean {
//   return !device.branchId || device.branchId === branchId;
// }

function DeviceCard({
  device, isOwnerDevice, onApprove, onDisapprove, onBlock, onUnblock, onRemove,
}: Readonly<{
  device: RegisteredDevice;
  isOwnerDevice: boolean;
  onApprove: () => void;
  onDisapprove: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onRemove: () => void;
}>) {
  const statusColor = STATUS_COLOR[device.status] ?? C.gray500;
  // const idPreview   = device.fcmToken.length > 24
  //   ? device.fcmToken.slice(0, 24) + "…"
  //   : device.fcmToken;
  const who = isOwnerDevice ? "Owner" : (device.staffName || "Staff");

  return (
    <View style={S.deviceCard}>
      {/* Info row */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._12 }}>
        <View style={[S.deviceCardIcon, { backgroundColor: statusColor + "18" }]}>
          <I.Smartphone c={statusColor} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={S.deviceCardName} numberOfLines={1}>
            {device.deviceModel || device.deviceName}
          </Text>
          <Text style={S.deviceCardId} numberOfLines={1}>
            Staff: <Text style={S.deviceCardIdVal}>{who}</Text>
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: SP._4 }}>
            <View style={S.platformPill}>
              <Text style={S.platformPillText}>{device.operatingSystem}</Text>
            </View>
            <View style={[S.platformPill, { backgroundColor: statusColor + "18", borderColor: statusColor + "40" }]}>
              <Text style={[S.platformPillText, { color: statusColor }]}>
                {device.status}
              </Text>
            </View>
          </View>
          {!!device.deviceModel && (
            <Text style={S.deviceCardId} numberOfLines={1}>
              Model: <Text style={S.deviceCardIdVal}>{device.deviceModel}</Text>
            </Text>
          )}
          {/* {status === "pending" && !!device.requestLocation && (
            <Text style={S.deviceCardId} numberOfLines={1}>
              Requested from:{" "}
              <Text style={S.deviceCardIdVal}>
                {device.requestLocation.label ??
                  `${device.requestLocation.latitude.toFixed(4)}, ${device.requestLocation.longitude.toFixed(4)}`}
              </Text>
            </Text>
          )} */}
        </View>
      </View>

      {/* Action row — depends on status */}
      <View style={S.deviceCardActions}>
        {device.status === "PENDING" && (
          <>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.success500, backgroundColor: C.success100 }]}
              onPress={onApprove} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.success700 }]}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.error500, backgroundColor: C.error100 }]}
              onPress={onDisapprove} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.error700 }]}>Disapprove</Text>
            </TouchableOpacity>
          </>
        )}
        {device.status === "APPROVED" && (
          <>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.warning500, backgroundColor: C.warning100 }]}
              onPress={onBlock} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.warning700 }]}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.error500, backgroundColor: C.error100 }]}
              onPress={onRemove} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.error700 }]}>Remove</Text>
            </TouchableOpacity>
          </>
        )}
        {device.status === "BLOCKED" && (
          <>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.success500, backgroundColor: C.success100 }]}
              onPress={onUnblock} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.success700 }]}>Unblock</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.deviceActionCompact, { borderColor: C.error500, backgroundColor: C.error100 }]}
              onPress={onRemove} activeOpacity={0.8}
            >
              <Text style={[S.deviceActionCompactText, { color: C.error700 }]}>Remove</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function deviceFriendlyError(err: any): string {
  const msg: string = err?.message ?? "";
  if (msg.includes("another account")) {
    return "This device is already registered to a different merchant account.";
  }
  if (msg.includes("E11000") || msg.includes("duplicate key") || msg.includes("already registered")) {
    return "This device is already registered.";
  }
  if (msg.includes("UNAUTHENTICATED") || msg.includes("Session expired") || msg.includes("invalid token")) {
    return "Your session expired. Please log out and back in, then try again.";
  }
  if (msg.includes("network") || msg.includes("Network") || msg.includes("fetch")) {
    return "Connection failed. Check your network and try again.";
  }
  return "Something went wrong. Please try again.";
}

export function DevicesScreenInline({
  merchantId, branches, onBack,
}: Readonly<{
  merchantId: string | null;
  branches: Branch[];
  onBack: () => void;
}>) {
  const [devices,      setDevices]      = useState<RegisteredDevice[]>([]);
  // All merchant devices — used only to show per-branch pending counts in the
  // branch picker (req: show which branch has pending devices).
  const [allDevices,   setAllDevices]   = useState<RegisteredDevice[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  // Free-text filter for the branch's device list (matches device name & username).
  const [query,        setQuery]        = useState("");
  // Always pick a branch first — devices are managed per-branch (req #4).
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  const showBanner = useCallback((msg: string, type: "success" | "error") => {
    useNotificationStore.getState().push({ type, title: msg });
  }, []);

  const loadDevices = useCallback(async () => {
    if (!merchantId || !selectedBranch) return;
    try {
      setDevices(await gqlDevicesByBranch(selectedBranch.id));
    } catch (err: unknown) {
      showBanner(deviceFriendlyError(err), "error");
    } finally {
      setLoading(false);
    }
  }, [merchantId, selectedBranch, showBanner]);

  const loadAll = useCallback(async () => {
    if (!merchantId) return;
    try { setAllDevices(await gqlMyDevices()); } catch { /* meta only — ignore */ }
  }, [merchantId]);

  useEffect(() => {
    if (selectedBranch) { setLoading(true); setQuery(""); void loadDevices(); }
  }, [selectedBranch, loadDevices]);
  useEffect(() => { void loadAll(); }, [loadAll]);

  // Pending device count per branch, for the picker badges.
  const pendingByBranch = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of allDevices) {
      if (d.status === "PENDING" && d.branchId) m[d.branchId] = (m[d.branchId] ?? 0) + 1;
    }
    return m;
  }, [allDevices]);

  // Auto-open a branch when this screen opens (once per mount):
  //   1. a branch from a tapped "device pending approval" push (deep link), or
  //   2. the single branch that has pending devices (owner tapped the hub badge).
  // Otherwise stay on the branch picker.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current || selectedBranch) return;
    const deepLink = useDeepLinkStore.getState().deviceApprovalBranchId;
    const pendingBranchIds = Object.keys(pendingByBranch);
    const targetId = deepLink || (pendingBranchIds.length === 1 ? pendingBranchIds[0] : null);
    if (!targetId) return;
    const b = branches.find((br) => br.id === targetId);
    if (b) {
      autoOpenedRef.current = true;
      setSelectedBranch(b);
      if (deepLink) useDeepLinkStore.getState().setDeviceApprovalBranch(null);
    }
  }, [pendingByBranch, branches, selectedBranch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
    setRefreshing(false);
  };

  const runAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
      await loadDevices();
      await loadAll();
    } catch (err: unknown) {
      showBanner(deviceFriendlyError(err), "error");
    }
  };

  const handleDisapprove = (device: RegisteredDevice) => {
    showConfirm(
      "Disapprove Device",
      `Reject ${device.staffName || "this staff"}'s device registration? They'll need to register again.`,
      () => { void runAction(() => gqlDisapproveDevice(device.id)); },
      { confirmLabel: "Disapprove", destructive: true }
    );
  };

  const handleRemove = (device: RegisteredDevice) => {
    // const isPendingRequest = deviceStatus(device) === "pending";
    showConfirm(
      "Remove Device",
      `Remove "${device.deviceModel || device.deviceName}"? The staff will be signed out and must register again. This cannot be undone.`,
      () => { void runAction(() => gqlDeleteDevice(device.id)); },
      { confirmLabel: "Remove", destructive: true }
    );
  };

  const handleBlock = (device: RegisteredDevice) => {
    showConfirm(
      "Block Device",
      `Block ${device.staffName || "this staff"}'s device? They'll be signed out and can't log in from it until unblocked.`,
      () => { void runAction(() => gqlBlockDevice(device.id)); },
      { confirmLabel: "Block", destructive: true }
    );
  };

  // ── Level 1: Branch picker ────────────────────────────────────────────────
  if (selectedBranch === null) {
    return (
      <BranchPickerView
        title="Registered Devices"
        subtitle="Select a branch to manage devices"
        blueHeader
        branches={branches}
        onBack={onBack}
        onSelect={(branchId) => {
          const b = branches.find((br) => br.id === branchId);
          if (b) setSelectedBranch(b);
        }}
        getMetaText={(b) => {
          const n = pendingByBranch[b.id] ?? 0;
          return n > 0 ? `${n} pending approval` : "Tap to manage devices";
        }}
        getBadgeCount={(b) => pendingByBranch[b.id] ?? 0}
      />
    );
  }

  // ── Level 2: Device list for the selected branch ──────────────────────────
  // Filter the branch's devices by device name / model and username (staff name).
  const q = query.trim().toLowerCase();
  const matchesQuery = (d: RegisteredDevice) =>
    !q ||
    (d.deviceName  || "").toLowerCase().includes(q) ||
    (d.deviceModel || "").toLowerCase().includes(q) ||
    (d.staffName   || "").toLowerCase().includes(q);
  const filtered = devices.filter(matchesQuery);

  const pending  = filtered.filter((d) => d.status === "PENDING");
  const approved = filtered.filter((d) => d.status === "APPROVED");
  const blocked  = filtered.filter((d) => d.status === "BLOCKED");
  const hasResults = pending.length + approved.length + blocked.length > 0;

  const isOwner = (d: RegisteredDevice) => !!merchantId && d.staffUid === merchantId;

  const renderSection = (title: string, list: RegisteredDevice[], badgeColor: string, badgeTextColor: string) =>
    list.length > 0 && (
      <View style={{ gap: SP._8, marginTop: SP._8 }}>
        <View style={S.sectionHeader}>
          <Text style={S.sectionTitle}>{title}</Text>
          <View style={[S.sectionCountBadge, { backgroundColor: badgeColor }]}>
            <Text style={[S.sectionCountText, { color: badgeTextColor }]}>{list.length}</Text>
          </View>
        </View>
        {list.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            isOwnerDevice={isOwner(device)}
            onApprove={() => runAction(() => gqlApproveDevice(device.id))}
            onDisapprove={() => handleDisapprove(device)}
            onBlock={() => handleBlock(device)}
            onUnblock={() => runAction(() => gqlUnblockDevice(device.id))}
            onRemove={() => handleRemove(device)}
          />
        ))}
      </View>
    );

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar
        title={selectedBranch.name}
        onBack={() => (branches.length > 1 ? setSelectedBranch(null) : onBack())}
        blue
      />

      {/* Search — filter this branch's devices by device name or username */}
      {!loading && devices.length > 0 && (
        <View style={S.auditStickyHeader}>
          <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
            <View style={S.auditSearchWrap}>
              <I.Search c={C.gray400} />
              <TextInput
                style={S.auditSearchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search device name or username…"
                placeholderTextColor={C.gray400}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")} hitSlop={8} activeOpacity={0.7}>
                  <I.X c={C.gray400} s={14} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Inline feedback banner */}
      {/* {!!banner && (
        <View style={[S.deviceBanner, banner.type === "error" ? S.deviceBannerError : S.deviceBannerSuccess]}>
          <Text style={[S.deviceBannerText, banner.type === "error" ? S.deviceBannerTextError : S.deviceBannerTextSuccess]}>
            {banner.msg}
          </Text>
        </View>
      )} */}

      {loading ? (
        <View style={S.loadBox}><ActivityIndicator color={C.brand500} size="large" /></View>
      ) : devices.length === 0 ? (
        <View style={S.emptyDevices}>
          <View style={S.emptyDevicesIconWrap}>
            <I.Smartphone c={C.gray300} />
          </View>
          <Text style={S.emptyDevicesTitle}>No devices yet</Text>
          <Text style={S.emptyDevicesBody}>
            Your staff can register their device by logging in and selecting this branch.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: C.gray50, maxWidth: 880, width: "100%", alignSelf: "center" }}
          contentContainerStyle={{ paddingHorizontal: SP._16, paddingTop: SP._16, paddingBottom: 48, gap: SP._8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void handleRefresh(); }} />}
          showsVerticalScrollIndicator={false}
        >
          {!hasResults ? (
            <View style={S.emptyDevices}>
              <View style={S.emptyDevicesIconWrap}>
                <I.Smartphone c={C.gray300} />
              </View>
              <Text style={S.emptyDevicesTitle}>No matches</Text>
              <Text style={S.emptyDevicesBody}>No devices match “{query.trim()}”.</Text>
            </View>
          ) : (
            <>
              {renderSection("PENDING APPROVAL", pending, C.warning100, C.warning700)}
              {renderSection("APPROVED DEVICES", approved, C.success100, C.success700)}
              {renderSection("BLOCKED DEVICES", blocked, C.error100, C.error700)}
              <Text style={S.auditEndOfList}>— End of results —</Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
