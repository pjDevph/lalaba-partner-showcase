// app/(tabs)/settings.tsx
// Lalaba Merchant — Settings Screen (Inline Hub Architecture)
// Hub view with inline navigation to Hours, Staff, Activity
// Firestore-backed with auth store integration
import React, { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "../../src/stores/authStore";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BranchSelectorBar } from "../../src/components/BranchSelectorBar";
import { fetchMyStaff } from "../../src/services/graphql/staff";
import { useActiveStaffStore } from "../../src/stores/activeStaffStore";
import { can, type PermissionKey } from "../../src/types/permissions";
import { useAuthStore } from "../../src/stores/authStore";
import ServicesScreen from "./services";
import InventoryScreen from "./inventory";
import CostingScreen from "./costing";
import { COSTING_ENABLED } from "../../src/features/costing/costing";
import TasksScreen from "./tasks";
import { useMerchantStore } from "../../src/stores/merchantStore";
import type { Branch } from "../../src/stores/merchantStore";
import { useInventoryStore } from "../../src/stores/inventoryStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { useFontScale } from "../_layout";
import { C, SP } from "../../src/theme/tokens";
import { S } from "../../src/screens/settings/styles";
import { HeroHeader } from "../../src/components/ui";
import { AvatarMenu } from "../../src/screens/dashboard/AvatarMenu";

import {
  I, DAYS, DEFAULT_HOURS, CAT, isCourier, mapStaffMember,
  type OperatingHours, type MerchantType,
  type BranchConfig, type StaffMember, type ViewState,
} from "../../src/screens/settings/shared";
import { ToursScreenInline } from "../../src/screens/settings/ToursScreen";
import { HelpSupportScreenInline } from "../../src/screens/settings/HelpSupportScreen";
import { TransactionHistoryScreenInline } from "../../src/screens/settings/TransactionHistoryScreen";
import { DevicesScreenInline } from "../../src/screens/settings/DevicesScreen";
import { AccountScreenInline } from "../../src/screens/settings/AccountScreen";
import { gqlMyDevices } from "../../src/services/graphql/devices";
import { useDeepLinkStore } from "../../src/stores/deepLinkStore";
import { HoursScreenInline } from "../../src/screens/settings/HoursScreen";
import { ActivityLogsScreenInline } from "../../src/screens/settings/ActivityLogsScreen";
import { StaffScreenInline } from "../../src/screens/settings/StaffScreen";
import { BranchesScreenInline } from "../../src/screens/settings/BranchesScreen";
import { LegalScreenInline } from "../../src/screens/settings/LegalScreen";
import {
  VerificationScreenInline,
  businessInfoFields,
} from "../../src/screens/settings/VerificationScreen";
import {
  VerificationCard,
  VerificationCardError,
  VerificationCardSkeleton,
  MERCHANT_ACCENT,
} from "../../src/components/verification";
import { useVerificationSummary } from "../../src/features/verification/useVerificationSummary";
import { deriveProfileRowStatus } from "../../src/features/verification/status";
import { MERCHANT_GROUPS } from "../../src/features/verification/requirements";

function HubRow({
  icon, iconBg = C.brand50, label, subtitle, badge, onPress, last = false, active = false,
}: Readonly<{
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  subtitle?: string;
  badge?: string | number;
  onPress: () => void;
  last?: boolean;
  active?: boolean;
}>) {
  const fs = useFontScale();
  return (
    <>
      <TouchableOpacity style={[S.hubNavCard, active && S.hubNavCardActive]} onPress={onPress} activeOpacity={0.7}>
        <View style={[S.hubIconCircle, { backgroundColor: iconBg }]}>{icon}</View>
        <View style={S.hubNavCardText}>
          <Text style={[S.hubNavCardLabel, { fontSize: 14 * fs }]}>{label}</Text>
          {subtitle ? <Text style={[S.hubNavCardSubtitle, { fontSize: 11 * fs }]} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {badge !== undefined && (
          <View style={S.hubBadge}>
            <Text style={S.hubBadgeText}>{badge}</Text>
          </View>
        )}
        <I.Chevron c={C.gray400} />
      </TouchableOpacity>
      {last === false && <View style={S.divider} />}
    </>
  );
}

// ─── Branch config helpers (shared by the settings hub + branch loading) ──────
function beToFeHours(beHours: any): OperatingHours {
  const result: Partial<OperatingHours> = {};
  for (const day of DAYS) {
    const d = beHours?.[day.toLowerCase()];
    const first = d?.timeSlots?.[0];
    result[day] = {
      isOpen:    d?.isOpen    ?? (day !== "Sunday"),
      openTime:  first?.open  ?? "08:00",
      closeTime: first?.close ?? "18:00",
      is24Hours: d?.is24Hours ?? false,
    };
  }
  return result as OperatingHours;
}

function branchToConfig(b: any): Partial<BranchConfig> {
  if (!b) return {};
  return {
    name:                b.name              ?? "",
    address:             b.address           ?? "",
    phone:               b.phone             ?? "",
    gcashNumber:         b.gcashNumber       ?? "",
    receiptHeader:       b.receiptHeader     ?? "",
    receiptFooter:       b.receiptFooter     ?? "",
    claimCodePrefix:     b.claimCodePrefix   ?? "LLB",
    slotDurationMinutes: b.slotDurationMinutes ?? 30,
    maxConcurrentOrders: b.maxConcurrentOrders ?? 5,
    operatingHours:      b.operatingHours ? beToFeHours(b.operatingHours) : DEFAULT_HOURS,
    merchantType:        (b.merchantType     ?? "LAUNDROMAT") as MerchantType,
  };
}


function loadBranchConfig(branchId: string): Partial<BranchConfig> {
  const branch = useMerchantStore.getState().branches.find((b) => b.id === branchId);
  return branchToConfig(branch);
}


async function loadSettingsData(_merchantId: string): Promise<StaffMember[]> {
  const members = await fetchMyStaff();
  return members.map(mapStaffMember);
}

// The individual sub-screens now live in src/screens/settings/*. This file owns
// the hub, the view router (renderSettingsView), and the top-level SettingsScreen.

interface SettingsViewProps {
  view: ViewState;
  config: BranchConfig;
  setConfig: React.Dispatch<React.SetStateAction<BranchConfig>>;
  merchantId: string | null;
  branchId: string | null;
  branches: Branch[];
  staffList: StaffMember[];
  setStaffList: React.Dispatch<React.SetStateAction<StaffMember[]>>;
  user: AuthUser | null;
  role: string | null;
  refreshBranches: (id: string) => Promise<void>;
  setView: (v: ViewState) => void;
  settingsBranchId: string | null;
}

function renderSettingsView(props: SettingsViewProps): React.ReactElement | null {
  const { view, config, setConfig, merchantId, branchId, branches, staffList, setStaffList, user, role, refreshBranches, setView, settingsBranchId } = props;

  if (view === "verification") {
    const target =
      branches.find((b) => b.id === (settingsBranchId ?? branchId)) ?? null;
    return (
      <VerificationScreenInline
        branch={target}
        onBack={() => setView("hub")}
        onEditBusinessInfo={() => setView("branches")}
      />
    );
  }

  if (view === "branches") {
    return (
      <BranchesScreenInline
        merchantId={merchantId}
        branches={branches}
        onRefresh={() => merchantId ? refreshBranches(merchantId) : Promise.resolve()}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "hours") {
    return (
      <HoursScreenInline
        config={config}
        setConfig={setConfig}
        branchId={settingsBranchId ?? branchId}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "staff") {
    return (
      <StaffScreenInline
        staffList={staffList}
        setStaffList={setStaffList}
        merchantId={merchantId}
        branches={branches}
        user={user}
        initialBranchId={null}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "activity") {
    return (
      <ActivityLogsScreenInline
        merchantId={merchantId}
        ownerRole={role}
        branchId={settingsBranchId}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "tours") {
    return <ToursScreenInline onBack={() => setView("hub")} />;
  }

  if (view === "help") {
    return (
      <HelpSupportScreenInline
        onBack={() => setView("hub")}
        onReportProblem={() => router.push("/(tabs)/support-new")}
      />
    );
  }

  if (view === "account") {
    return (
      <AccountScreenInline
        onBack={() => setView("hub")}
        onNavigateToBranches={() => setView("branches")}
        onNavigateToStaff={() => setView("staff")}
      />
    );
  }

  if (view === "devices") {
    return (
      <DevicesScreenInline
        merchantId={merchantId}
        branches={branches}
        onBack={() => setView("hub")}
      />
    );
  }

  if (view === "services") {
    const singleBranchId = branches.length === 1 ? branches[0]?.id : undefined;
    const autoBranchId = singleBranchId;
    return (
      <ServicesScreen
        onBack={() => setView("hub")}
        initialBranchId={autoBranchId ?? undefined}
      />
    );
  }

  if (view === "inventory") {
    return <InventoryScreen onBack={() => setView("hub")} />;
  }

  if (view === "costing") {
    const singleBranchId = branches.length === 1 ? branches[0]?.id : undefined;
    const autoBranchId = singleBranchId;
    return (
      <CostingScreen
        onBack={() => setView("hub")}
        initialBranchId={autoBranchId ?? undefined}
      />
    );
  }

  if (view === "tasks") {
    const singleBranchId = branches.length === 1 ? branches[0]?.id : undefined;
    const autoBranchId = singleBranchId;
    return (
      <TasksScreen
        onBack={() => setView("hub")}
        initialBranchId={autoBranchId ?? undefined}
      />
    );
  }

  if (view === "transactions") {
    return <TransactionHistoryScreenInline onBack={() => setView("hub")} />;
  }

  if (view === "privacy" || view === "terms") {
    return <LegalScreenInline kind={view} onBack={() => setView("hub")} />;
  }

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS HUB + INLINE VIEWS
// ══════════════════════════════════════════════════════════════════════════════
export default function SettingsScreen() {
  const merchantId       = useAuthStore((s) => s.merchantId);
  const branchId         = useAuthStore((s) => s.branchId);
  const user             = useAuthStore((s) => s.user);
  const avatarInitials   = (user?.displayName?.trim()?.[0] ?? "M").toUpperCase();
  const role             = useAuthStore((s) => s.role);
  // Permission-gated settings rows — same source selection as useCan. Owners
  // resolve to all-true, so they keep every row; a manager only sees the areas
  // they're granted (mirrors the sidebar gating).
  const shiftStaff           = useActiveStaffStore((s) => s.activeStaff);
  const effectivePermissions = useActiveStaffStore((s) => s.effectivePermissions);
  const resolvedPermissions  = useAuthStore((s) => s.resolvedPermissions);
  const permMap              = shiftStaff ? effectivePermissions : resolvedPermissions;
  const canAny = (keys: PermissionKey[]) => keys.some((k) => can(permMap, k));
  const canSeeServices  = canAny(["canViewServices", "canAddService", "canEditService", "canArchiveService"]);
  const canSeeInventory = canAny(["canAddInventory", "canEditInventory", "canArchiveInventory", "canAddProduct", "canEditProduct", "canArchiveProduct"]);
  const canSeeLogs      = canAny(["canViewActivityLogs"]);
  const merchant        = useMerchantStore((s) => s.profile);
  const branches        = useMerchantStore((s) => s.branches);
  const refreshBranches = useMerchantStore((s) => s.refreshBranches);
  const loadMerchant    = useMerchantStore((s) => s.loadMerchant);
  const merchantLoading = useMerchantStore((s) => s.isLoading);
  // The shared current branch — same field POS, Orders, Wallet, Services and
  // the dashboard read, so the hub summarises the branch the owner is actually
  // working in rather than whichever one happened to load first.
  const currentBranchId = useMerchantStore((s) => s.selectedBranchId);
  const lowStock        = useInventoryStore((s) => s.lowStock);
  const [view, setView] = useState<ViewState>("hub");
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;
  const [detailView, setDetailView] = useState<ViewState | "none">("none");
  const [config, setConfig] = useState<BranchConfig>({
    name: "", address: "", phone: "", gcashNumber: "",
    receiptHeader: "", receiptFooter: "", claimCodePrefix: "LLB",
    slotDurationMinutes: 30, maxConcurrentOrders: 5,
    operatingHours: DEFAULT_HOURS,
    merchantType: "LAUNDROMAT",
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [settingsBranchId, setSettingsBranchId] = useState<string | null>(null);
  // Pending device-approval count → badge on the "Registered Devices" hub row.
  const [pendingDeviceCount, setPendingDeviceCount] = useState(0);


  const setViewForDetail = useCallback((v: ViewState) => {
    setDetailView(v === "hub" ? "none" : v);
  }, []);

  const fetchAll = useCallback(async (opts?: { silent?: boolean }) => {
    if (!merchantId) { setLoading(false); return; }
    if (!opts?.silent) setLoading(true);
    try {
      const members = await loadSettingsData(merchantId);
      setStaffList(members);
      if (branchId) {
        const cfg = loadBranchConfig(branchId);
        if (Object.keys(cfg).length > 0) setConfig((p) => ({ ...p, ...cfg }));
      }
    } catch (e) {
      console.warn("[Settings] fetch:", e);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load settings." });
    }
    finally { if (!opts?.silent) setLoading(false); }
  }, [merchantId, branchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Owner only: count devices awaiting approval for the hub badge. Refetches
  // whenever the hub is shown (e.g. after approving in the Devices screen).
  useEffect(() => {
    if (!merchantId || view !== "hub") return;
    let cancelled = false;
    gqlMyDevices()
      .then((ds) => { if (!cancelled) setPendingDeviceCount(ds.filter((d) => d.status === "PENDING").length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [merchantId, view]);

  // A tapped "device pending approval" push sets this → open the Devices screen.
  // DevicesScreen reads/clears the target branch from the deep-link store.
  const deviceApprovalBranchId = useDeepLinkStore((s) => s.deviceApprovalBranchId);
  useEffect(() => {
    if (!deviceApprovalBranchId) return;
    if (isTabletLandscape) setDetailView("devices");
    else setView("devices");
  }, [deviceApprovalBranchId, isTabletLandscape]);

  // "Edit profile" on the dashboard names a branch and expects its branding
  // editor. Parking the intent is not enough on its own: BranchesScreen is what
  // consumes it, and it only mounts once this hub switches to the branches
  // view — so without this the tap landed on the hub and nothing opened.
  const brandingIntentBranchId = useDeepLinkStore((s) => s.brandingBranchId);
  useEffect(() => {
    if (!brandingIntentBranchId) return;
    if (isTabletLandscape) setDetailView("branches");
    else setView("branches");
    // Deliberately NOT cleared here — BranchesScreen clears it once it has
    // opened the editor. Clearing on navigation would race the mount.
  }, [brandingIntentBranchId, isTabletLandscape]);

  // A tapped staff-login row opens Activity Logs, where the sign-in is listed.
  // Cleared on consumption so returning to Settings later doesn't re-navigate.
  const settingsViewIntent = useDeepLinkStore((s) => s.settingsView);
  const clearSettingsViewIntent = useDeepLinkStore((s) => s.setSettingsView);
  useEffect(() => {
    if (!settingsViewIntent) return;
    if (isTabletLandscape) setDetailView(settingsViewIntent);
    else setView(settingsViewIntent);
    clearSettingsViewIntent(null);
  }, [
    settingsViewIntent,
    clearSettingsViewIntent,
    isTabletLandscape,
  ]);

  // A tapped KYC decision push names the branch it was about, so open that
  // branch's verification screen directly instead of the picker. Cleared on
  // consumption so returning to Settings later doesn't re-navigate.
  const verificationDeepLinkBranchId = useDeepLinkStore(
    (s) => s.verificationBranchId,
  );
  const clearVerificationDeepLink = useDeepLinkStore(
    (s) => s.setVerificationBranch,
  );
  useEffect(() => {
    if (!verificationDeepLinkBranchId) return;
    setSettingsBranchId(verificationDeepLinkBranchId);
    if (isTabletLandscape) setDetailView("verification");
    else setView("verification");
    clearVerificationDeepLink(null);
  }, [
    verificationDeepLinkBranchId,
    isTabletLandscape,
    clearVerificationDeepLink,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (merchantId) await refreshBranches(merchantId).catch(() => {});
    await fetchAll({ silent: true });
    setRefreshing(false);
  }, [fetchAll, refreshBranches, merchantId]);

  // Load branches if the store is cold (user opened Settings before Inventory/POS).
  const branchesLoadAttempted = React.useRef(false);
  useEffect(() => {
    if (branchesLoadAttempted.current || branches.length > 0 || !merchantId || merchantLoading) return;
    branchesLoadAttempted.current = true;
    loadMerchant(merchantId).catch(() => {});
  }, [branches.length, merchantId, merchantLoading, loadMerchant]);


  const displayName = user?.displayName ?? merchant?.businessName ?? "Merchant";

  const activeMembers = staffList.filter((s) => !s.isArchived && s.isActive);
  // Couriers share the staff roster but are counted separately — they're riders,
  // not shop team (Staff Management lists them under their own section).
  const activeStaff    = activeMembers.filter((s) => !isCourier(s));
  const activeCouriers = activeMembers.filter(isCourier);
  const courierMeta    = activeCouriers.length > 0
    ? ` · ${activeCouriers.length} courier${activeCouriers.length === 1 ? "" : "s"}`
    : "";

  // Extract inner ternary of branchesSubtitle
  const branchCountSuffix = branches.length === 1 ? "" : "es";
  const branchesSubtitle = branches.length > 0
    ? `${branches.length} active branch${branchCountSuffix}`
    : "Add your first branch";

  // ── Verification summary for the hub card ──
  // Scoped to the branch the merchant is currently working in; with several
  // branches the card summarises that one and the picker handles the rest.
  const verificationBranch =
    branches.find((b) => b.id === (settingsBranchId ?? currentBranchId ?? branchId))
    ?? branches[0]
    ?? null;


  // Every per-branch destination in Settings opens on THIS branch — the one
  // the header selector names. Falls back for staff/managers, who have no
  // selector and are pinned to their own branch.
  const targetBranch =
    branches.find((b) => b.id === (currentBranchId ?? branchId)) ?? branches[0] ?? null;

  // Roll-up across every branch. verifiedAt (not verificationStatus) is what
  // grants the badge, so it is what gets counted here too.
  const verifiedBranchCount = branches.filter((b) => !!b.verifiedAt).length;
  const verificationFootnote =
    branches.length > 1 && verificationBranch
      ? `Showing ${verificationBranch.name} — ${verifiedBranchCount} of ${branches.length} branches verified. Each branch verifies separately; switch branches from the selector at the top.`
      : null;

  const verificationProfileStatuses = React.useMemo(
    () => [
      {
        key: "business-information",
        status: deriveProfileRowStatus(businessInfoFields(verificationBranch)),
      },
    ],
    [verificationBranch],
  );

  const verification = useVerificationSummary({
    providerType: "MERCHANT_BRANCH",
    providerId: verificationBranch?.id,
    groups: MERCHANT_GROUPS,
    profileStatuses: verificationProfileStatuses,
    enabled: true,
  });

  // Verification acts on the branch the card names, which is the branch the
  // header selector names — one control, one answer, no picker in between.
  const openVerification = () => {
    if (verificationBranch) setSettingsBranchId(verificationBranch.id);
    if (isTabletLandscape) setDetailView("verification");
    else setView("verification");
  };

  // ── Business profile card data ── (counts live in this one line; type is in the header pill)
  const bizMeta   = `Owner · ${branches.length} ${branches.length === 1 ? "branch" : "branches"} · ${activeStaff.length} staff${courierMeta}`;

  // Hours, Booking, Activity and Verification are all per-branch, and they all
  // act on the branch named in the header selector. There used to be a second
  // picker in front of each of them; two selectors for one concept meant an
  // owner could be looking at branch A up top while editing branch B.
  const openHours = () => {
    if (role === "MERCHANT") {
      const b = targetBranch;
      if (b) {
        setSettingsBranchId(b.id);
        const cfg = loadBranchConfig(b.id);
        if (Object.keys(cfg).length > 0) setConfig((p) => ({ ...p, ...cfg }));
      }
    }
    if (isTabletLandscape) setDetailView("hours");
    else setView("hours");
  };

  const openBookingAvailability = () => {
    const b = role === "MERCHANT" ? targetBranch : branches[0];
    router.push({ pathname: "/(tabs)/booking-availability", params: b ? { branchId: b.id } : {} });
  };

  const openActivity = () => {
    if (role === "MERCHANT" && targetBranch) setSettingsBranchId(targetBranch.id);
    if (isTabletLandscape) setDetailView("activity");
    else setView("activity");
  };

  // ── Grouped hub sections (role-aware) ──
  // navTo: on tablet landscape, updates the detail panel; on mobile navigates full-screen
  const navTo = (v: ViewState) => {
    if (isTabletLandscape) setDetailView(v);
    else setView(v);
  };

  type HubRowDef = Readonly<{
    key: string; icon: React.ReactNode; iconBg: string;
    label: string; subtitle?: string; badge?: string | number; onPress: () => void;
  }>;
  const hubSections: Readonly<{ title: string; rows: HubRowDef[] }>[] = [
    {
      title: "BUSINESS SETUP",
      rows: [
        // Also rendered as a standalone card above the hub — the row exists so
        // the tablet master/detail panel has something to highlight.
        ...[{ key: "verification", icon: <I.Shield c={CAT.business.fg} />, iconBg: CAT.business.bg, label: "Business Verification", subtitle: branches.length > 1
            ? `${verifiedBranchCount} of ${branches.length} branches verified`
            : (verification.status === "VERIFIED" ? "Verified Merchant" : `${verification.progress.percent}% complete`), onPress: openVerification }],
        { key: "hours",     icon: <I.Clock c={CAT.business.fg} />,     iconBg: CAT.business.bg, label: "Operating Hours", subtitle: "Set open/close hours per day",              onPress: openHours },
        ...[{ key: "booking-availability", icon: <I.Clock c={CAT.business.fg} />, iconBg: CAT.business.bg, label: "Booking & Delivery Fees", subtitle: "Pause bookings · fees · Pay Later", onPress: openBookingAvailability }],
        ...(canSeeServices ? [{ key: "services",  icon: <I.Services c={CAT.business.fg} />,  iconBg: CAT.business.bg, label: "Services",        subtitle: "Manage your laundry services",              onPress: () => navTo("services") }] : []),
        ...(canSeeInventory ? [{ key: "inventory", icon: <I.Inventory c={CAT.business.fg} />, iconBg: CAT.business.bg, label: "Inventory",       subtitle: "Stock levels and supplies", badge: lowStock.length > 0 ? lowStock.length : undefined, onPress: () => navTo("inventory") }] : []),
        // Phase 2: Costing deferred — restored via COSTING_ENABLED
        ...(COSTING_ENABLED ? [{ key: "costing", icon: <I.Costing c={CAT.business.fg} />, iconBg: CAT.business.bg, label: "Costing", subtitle: "Utilities, overhead & cost per kilo", onPress: () => navTo("costing") }] : []),
        // Phase 2: Tasks feature deferred, hub row hidden for now.
        // { key: "tasks",     icon: <I.Tasks c={CAT.business.fg} />,     iconBg: CAT.business.bg, label: "Tasks",           subtitle: "Daily, weekly & monthly checklists",        onPress: () => navTo("tasks") },
        ...[{ key: "branches", icon: <I.Building c={CAT.business.fg} />, iconBg: CAT.business.bg, label: "Branches", subtitle: branchesSubtitle, badge: branches.length > 1 ? branches.length : undefined, onPress: () => navTo("branches") }],
      ],
    },
    {
      title: "TEAM & ACCESS",
      rows: [
        { key: "staff", icon: <I.Users c={CAT.team.fg} />, iconBg: CAT.team.bg, label: "Staff Management", subtitle: `${activeStaff.length} staff · 1 owner${courierMeta}`, badge: activeMembers.length > 0 ? activeMembers.length : undefined, onPress: () => navTo("staff") },
        // { key: "permissions", icon: <I.Lock c={CAT.team.fg} />, iconBg: CAT.team.bg, label: "Permissions", subtitle: "Role capability matrix", onPress: () => navTo("permissions") },
        ...[{ key: "devices", icon: <I.Smartphone c={CAT.team.fg} />, iconBg: CAT.team.bg, label: "Registered Devices", subtitle: pendingDeviceCount > 0 ? `${pendingDeviceCount} pending approval` : "Manage staff devices", badge: pendingDeviceCount > 0 ? pendingDeviceCount : undefined, onPress: () => navTo("devices") }],
      ],
    },
    {
      title: "SYSTEM & SUPPORT",
      rows: [
        { key: "transactions", icon: <I.Receipt c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "Transaction History", subtitle: "Search, filter & export orders", onPress: () => navTo("transactions") },
        ...(canSeeLogs ? [{ key: "activity", icon: <I.Log c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "Activity & Audit Logs", subtitle: "Who did what, when, and where", onPress: openActivity }] : []),
        // { key: "tours", icon: <I.BookOpen c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "App Tours", subtitle: "Guided walkthroughs for each tab", onPress: () => navTo("tours") },
        { key: "help", icon: <I.LifeBuoy c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "Help & Support", subtitle: "FAQs, contact support, and report an issue", onPress: () => navTo("help") },
        { key: "privacy", icon: <I.Shield c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "Privacy Policy", subtitle: "View Lalaba's privacy policy", onPress: () => navTo("privacy") },
        { key: "terms", icon: <I.FileText c={CAT.system.fg} />, iconBg: CAT.system.bg, label: "Terms of Service", subtitle: "View Lalaba's terms of service", onPress: () => navTo("terms") },
      ],
    },
    {
      title: "ACCOUNT",
      rows: [
        { key: "account", icon: <I.User c={CAT.account.fg} />, iconBg: CAT.account.bg, label: "Account", subtitle: user?.email ?? "", onPress: () => navTo("account") },
      ],
    },
  ];

  // Non-hub views are handled by renderSettingsView (mobile only; tablet uses detailView)
  if (view !== "hub" && !isTabletLandscape) {
    return renderSettingsView({
      view, config, setConfig, merchantId, branchId,
      branches, staffList, setStaffList, user, role,
      refreshBranches, setView,
      settingsBranchId,
    }) ?? null;
  }

  // ─── Render: Tablet Landscape (Master-Detail) ─────────────────────────────
  if (isTabletLandscape) {
    const detailProps: SettingsViewProps = {
      view: detailView as ViewState,
      config, setConfig, merchantId, branchId,
      branches, staffList, setStaffList, user, role,
      refreshBranches,
      setView: setViewForDetail,
      settingsBranchId,
      };

    return (
      <SafeAreaView style={[S.safe, { backgroundColor: C.brand600 }]} edges={["top"]}>
        {/* ── Compact workspace top bar ── */}
        <View style={S.compactTopBar}>
          <View style={S.compactTopBarLeft}>
            <Image source={require("../../assets/logo-mark1.png")} style={S.compactTopBarLogo} resizeMode="contain" />
            <Text style={S.compactTopBarBrand}>Lalaba Partner</Text>
          </View>
          <View style={S.compactTopBarRight}>
            <Text style={S.compactTopBarUser} numberOfLines={1}>{user?.displayName ?? ""}</Text>
          </View>
        </View>
        <View style={S.splitContainer}>
          {/* ── LEFT: settings section navigation (the global app sidebar stays
              visible to the left of this via the tabs layout) ── */}
          <View style={S.splitSidebar}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={S.splitSidebarScroll}>
              {/* Biz card */}
              <View style={[S.bizCard, { marginBottom: 4 }]}>
                <View style={S.bizAvatar}><I.Building c={C.white} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={S.bizName} numberOfLines={1}>{displayName}</Text>
                  <Text style={S.bizMeta} numberOfLines={1}>{bizMeta}</Text>
                </View>
              </View>

              {/* Section rows */}
              {hubSections.map((section) => (
                <View key={section.title}>
                  <Text style={[S.hubSectionLabel, { paddingHorizontal: 4 }]}>{section.title}</Text>
                  <View style={S.splitSidebarCard}>
                    {section.rows.map((r, i) => (
                      <HubRow
                        key={r.key}
                        icon={r.icon}
                        iconBg={r.iconBg}
                        label={r.label}
                        subtitle={r.subtitle}
                        badge={r.badge}
                        onPress={r.onPress}
                        active={r.key === detailView}
                        last={i === section.rows.length - 1}
                      />
                    ))}
                  </View>
                </View>
              ))}

              {/* Sign out moved to the Dashboard avatar menu */}
              <Text style={[S.versionText, { textAlign: "center" }]}>v4.2.1</Text>
            </ScrollView>
          </View>

          {/* ── RIGHT: detail panel ── */}
          <View style={S.splitDetail}>
            {detailView === "none" ? (
              <View style={S.splitEmptyState}>
                <I.Building c={C.gray200} />
                <Text style={S.splitEmptyTitle}>Select a section</Text>
                <Text style={S.splitEmptySub}>Choose a category from the sidebar</Text>
              </View>
            ) : (
              renderSettingsView(detailProps)
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: Mobile / Tablet Portrait (hub scroll) ────────────────────────
  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <HeroHeader
        compact
        noWave
        title="Settings"
        subtitle="Manage your business workspace"
        // In landscape the tabs layout renders a global top-right avatar; only
        // show the hub's own avatar in portrait to avoid a duplicate.
        right={isLandscape ? undefined : <AvatarMenu initials={avatarInitials} />}
      />
      {/* Settings is full of per-branch destinations (verification, hours,
          booking, devices). Renders for a multi-branch owner only. */}
      <BranchSelectorBar />
      <ScrollView
        style={{ flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" }}
        contentContainerStyle={[S.hubScroll, { alignItems: "stretch" }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} />}
      >
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
        {loading ? (
          <View style={S.loadBox}>
            <ActivityIndicator color={C.brand500} size="large" />
          </View>
        ) : (
          <>
            {/* ── Business profile card (compact) ── */}
            <View style={S.bizCard}>
              <View style={S.bizAvatar}>
                <I.Building c={C.white} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={S.bizName} numberOfLines={1}>{displayName}</Text>
                <Text style={S.bizMeta} numberOfLines={1}>{bizMeta}</Text>
              </View>
            </View>

            {/* Verification leads the hub: it's the only thing here that
                changes how customers see this business. The skeleton holds
                its place on a cold first load — this one waits on branches
                before it can even ask — so the sections below don't shift. */}
            {verification.loading && (
              <VerificationCardSkeleton accent={MERCHANT_ACCENT} />
            )}
            {verification.error && (
              <VerificationCardError
                title="Business Verification"
                accent={MERCHANT_ACCENT}
                onRetry={verification.reload}
              />
            )}
            {verification.status && (
              <VerificationCard
                title="Business Verification"
                description={
                  branches.length > 1 && verificationBranch
                    ? `Verify ${verificationBranch.name} to earn the Verified Merchant badge.`
                    : "Complete your business verification to receive the Verified Merchant badge."
                }
                status={verification.status}
                percent={verification.progress.percent}
                done={verification.progress.done}
                total={verification.progress.total}
                verified={verification.progress.verified}
                remaining={verification.progress.remaining}
                accent={MERCHANT_ACCENT}
                onPress={openVerification}
                footnote={verificationFootnote}
              />
            )}

            {/* ── Grouped section cards ── */}
            {hubSections.map((section) => (
              <View key={section.title}>
                <Text style={S.hubSectionLabel}>{section.title}</Text>
                <View style={S.hubCard}>
                  {section.rows.map((r, i) => (
                    <HubRow
                      key={r.key}
                      icon={r.icon}
                      iconBg={r.iconBg}
                      label={r.label}
                      subtitle={r.subtitle}
                      badge={r.badge}
                      onPress={r.onPress}
                      last={i === section.rows.length - 1}
                    />
                  ))}
                </View>
              </View>
            ))}

            {/* Version string */}
            <Text style={[S.versionText, { marginTop: SP._24, marginBottom: SP._8 }]}>Lalaba Merchant v4.2.1 · Build {new Date().toISOString().slice(0, 10)}</Text>
          </>
        )}
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// TIME INPUT — enforces HH:MM format, clamps to valid 24-h range on blur
// ══════════════════════════════════════════════════════════════════════════════
// ─── TimePicker — dropdown-style Hour / Minute / AM-PM selector ──────────────
// Value/onChange contract stays a 24-hour "HH:mm" string (the wire format the
// backend expects); only the display and the picker UI are 12-hour.
// ══════════════════════════════════════════════════════════════════════════════
// BRANCH SCREEN (REMOVED - not in inline spec)
// ══════════════════════════════════════════════════════════════════════════════
// Legacy BranchScreen component removed — Branch setup is handled via hub nav row
// ══════════════════════════════════════════════════════════════════════════════
// STAFF SCREEN (INLINE)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Styles ───────────────────────────────────────────────────────────────────
