// Activity / audit logs screen (+ audit row builders) — extracted from settings.tsx.
import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { TopBar } from "../../components/ui";
import { CustomDateRangeModal, formatRangeLabel } from "../../components/CustomDateRangeModal";
import { gqlMyActivityLogs, type GqlActivityLog } from "../../services/graphql/activityLogs";
import { useMerchantStore } from "../../stores/merchantStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { formatTime12 } from "./timeHelpers";
import { I } from "./shared";
import { S } from "./styles";

type ModuleFilter = "ALL" | "pos_orders" | "services" | "staff" | "branches" | "inventory" | "products" | "tasks" | "devices";
type DateRangeFilter = "ALL" | "TODAY" | "24H" | "7D" | "30D" | "CUSTOM";
const MODULE_FILTERS: { key: ModuleFilter; label: string }[] = [
  { key: "ALL",        label: "All modules" },
  { key: "pos_orders", label: "Orders" },
  { key: "services",   label: "Services" },
  { key: "staff",      label: "Staff" },
  { key: "branches",   label: "Branches" },
  { key: "inventory",  label: "Inventory" },
  { key: "products",   label: "Products" },
  { key: "tasks",      label: "Tasks" },
  { key: "devices",    label: "Devices" },
];
const DATE_RANGE_FILTERS: { key: DateRangeFilter; label: string }[] = [
  { key: "ALL",    label: "All time" },
  { key: "TODAY",  label: "Today" },
  { key: "24H",    label: "Last 24 hours" },
  { key: "7D",     label: "Last 7 days" },
  { key: "30D",    label: "Last 30 days" },
  { key: "CUSTOM", label: "Custom range…" },
];
function dateRangeFilterToFrom(key: DateRangeFilter): string | undefined {
  const now = new Date();
  switch (key) {
    case "TODAY": { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString(); }
    case "24H":   return new Date(now.getTime() - 24 * 3600000).toISOString();
    case "7D":    return new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
    case "30D":   return new Date(now.getTime() - 30 * 24 * 3600000).toISOString();
    default:      return undefined;
  }
}
const LOGS_PAGE_SIZE = 10;
interface LogItem {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  entity: string;
  entityName: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
  branchId: string | null;
}
type LogSeverity = "NORMAL" | "IMPORTANT" | "CRITICAL";
// Keyed by the raw GraphQL mutation name (ActivityLog.action) — see resolver
// method names across pos_orders/staff/services/branches/inventory/etc.
const SEVERITY_MAP: Record<string, LogSeverity> = {
  cancelOrder:        "CRITICAL",
  voidOrder:          "CRITICAL",
  archiveStaff:       "CRITICAL",
  deactivateUser:     "CRITICAL",
  deactivateDevice:   "CRITICAL",
  deleteDevice:       "CRITICAL",
  deleteService:      "CRITICAL",
  deleteTask:         "CRITICAL",
  deletePermission:   "CRITICAL",
  deleteRole:         "CRITICAL",
  archiveService:     "IMPORTANT",
  archiveBranch:      "IMPORTANT",
  archiveProduct:     "IMPORTANT",
  archiveInventory:   "IMPORTANT",
  damageInventory:    "IMPORTANT",
  updateStaff:        "IMPORTANT",
  updateOrderDetails: "IMPORTANT",
  processPayment:     "IMPORTANT",
  updatePermission:   "IMPORTANT",
  updateRole:         "IMPORTANT",
};
const SEVERITY_COLORS: Record<LogSeverity, string> = {
  NORMAL:    C.brand500,
  IMPORTANT: C.warning600,
  CRITICAL:  C.error500,
};
const SEVERITY_BG: Record<LogSeverity, string> = {
  NORMAL:    C.brand50,
  IMPORTANT: C.warning100,
  CRITICAL:  "#FEE2E2",
};
// Friendly names for the raw BE module strings (see RESOLVER_MODULE_MAP on
// the backend) — shown nowhere raw, only through moduleLabel().
const MODULE_LABELS: Record<string, string> = {
  pos_orders:       "Orders",
  services:         "Services",
  staff:            "Staff",
  branches:         "Branches",
  inventory:        "Inventory",
  tasks:            "Tasks",
  devices:          "Devices",
  products:         "Products",
  users:            "Users",
  permissions:      "Permissions",
  roles:            "Roles",
  analytics:        "Analytics",
  pos_transactions: "Transactions",
};
function humanizeCamel(s: string): string {
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
// Audit log metadata carries the raw BE branch-hours shape (lowercase day
// keys, timeSlots array) rather than the FE's OperatingHours type — format it
// into readable lines instead of dumping the JSON blob.
const AUDIT_DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
function formatOperatingHoursMeta(hours: Record<string, any>): string {
  return AUDIT_DAY_ORDER
    .filter((d) => hours[d])
    .map((d) => {
      const day = hours[d];
      const label = d.charAt(0).toUpperCase() + d.slice(1);
      if (!day.isOpen) return `${label}: Closed`;
      if (day.is24Hours) return `${label}: 24 Hours`;
      const slots = Array.isArray(day.timeSlots) && day.timeSlots.length > 0
        ? day.timeSlots.map((s: any) => `${formatTime12(s.open)} – ${formatTime12(s.close)}`).join(", ")
        : "—";
      return `${label}: ${slots}`;
    })
    .join("\n");
}
function moduleLabel(m: string): string {
  return MODULE_LABELS[m] ?? humanizeCamel(m);
}
// Friendly names for the raw GraphQL mutation names (ActivityLog.action).
const ACTION_LABELS: Record<string, string> = {
  // Orders
  createOrder:            "Order created",
  updateOrderDetails:     "Order details updated",
  markOrderInProgress:    "Order marked in progress",
  markOrderReady:         "Order marked ready",
  rescheduleOrder:        "Order rescheduled",
  processPayment:         "Payment received",
  processPickup:          "Order picked up",
  cancelOrder:            "Order cancelled",
  voidOrder:              "Order voided",
  addOrderItems:          "Items added to order",
  // Staff
  createStaff:            "Staff added",
  updateStaff:            "Staff updated",
  archiveStaff:           "Staff removed",
  restoreStaff:           "Staff restored",
  generateStaffResetLink: "Password reset link sent",
  // Services
  createService:          "Service created",
  updateService:          "Service updated",
  archiveService:         "Service archived",
  restoreService:         "Service restored",
  deleteService:          "Service deleted",
  // Branches
  createBranch:           "Branch created",
  updateBranch:           "Branch updated",
  archiveBranch:          "Branch archived",
  restoreBranch:          "Branch reactivated",
  // Inventory
  createInventory:        "Inventory item added",
  updateInventory:        "Inventory item updated",
  restockInventory:       "Inventory restocked",
  adjustInventory:        "Inventory adjusted",
  damageInventory:        "Inventory marked damaged",
  archiveInventory:       "Inventory item archived",
  restoreInventory:       "Inventory item restored",
  // Tasks
  createTask:             "Task created",
  updateTask:             "Task updated",
  deleteTask:             "Task deleted",
  completeTask:           "Task completed",
  // Devices
  registerDevice:         "Device registered",
  updateDevice:           "Device updated",
  deactivateDevice:       "Device deactivated",
  reactivateDevice:       "Device reactivated",
  deleteDevice:           "Device removed",
  // Products
  createProduct:          "Product created",
  updateProduct:          "Product updated",
  archiveProduct:         "Product archived",
  restoreProduct:         "Product restored",
  // Users
  registerUser:           "User registered",
  deactivateUser:         "User deactivated",
  reactivateUser:         "User reactivated",
  // Permissions & roles
  createPermission:       "Permission created",
  updatePermission:       "Permission updated",
  deletePermission:       "Permission deleted",
  createRole:             "Role created",
  updateRole:             "Role updated",
  deleteRole:             "Role deleted",
};
// Friendly names for inventory schema enums (ActivityLog.metadata is raw BE input).
const INVENTORY_CATEGORY_LABELS: Record<string, string> = {
  powdered_detergent: "Powdered Detergent",
  liquid_detergent:   "Liquid Detergent",
  fabric_conditioner: "Fabric Conditioner",
  bleach:             "Bleach",
  oxybleach:          "Oxygen Bleach",
  stain_remover:      "Stain Remover",
  dryer_sheet:        "Dryer Sheet",
  other:              "Other",
};
const INVENTORY_UNIT_LABELS: Record<string, string> = {
  g:      "Grams",
  kg:     "Kilograms",
  ml:     "Milliliters",
  L:      "Liters",
  sachet: "Sachet",
  pieces: "Pieces",
  pack:   "Pack",
  box:    "Box",
  scoop:  "Scoop",
};
function formatPeso(n: number): string {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const CANCEL_REASON_LABELS: Record<string, string> = {
  CUSTOMER_REQUEST:  "Customer requested cancellation",
  ITEM_UNAVAILABLE:  "Item unavailable",
  DUPLICATE_ORDER:   "Duplicate order",
  PAYMENT_ISSUE:     "Payment issue",
  WRONG_ORDER:       "Wrong items entered",
  CUSTOMER_NO_SHOW:  "Customer no-show",
  OTHER:             "Other",
};
function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanizeCamel(action);
}
// Raw ObjectIds are meaningless to a merchant reading an audit trail, so every
// id-shaped metadata key is dropped from the detail modal — at the top level and
// inside nested objects/arrays alike. The capital "I" in `Id$` matters: a
// case-insensitive test would also swallow legitimate keys ending in "id"
// ("paid", "void"). branchId is exempt — it resolves to a branch *name*.
const ID_KEY_RE = /^_?ids?$|Ids?$/;
function isIdKey(k: string): boolean {
  return k !== "branchId" && k !== "branchIds" && ID_KEY_RE.test(k);
}
function auditSubtitle(item: LogItem): string {
  const m = item.metadata;
  const name = item.entityName;
  if (item.action === "cancelOrder") {
    const r = CANCEL_REASON_LABELS[String(m.reason ?? "")] ?? String(m.reason ?? "");
    return name && r ? `${name} · ${r}` : name || r;
  }
  return name;
}

type AuditRow =
  | { type: "header"; date: string }
  | { type: "item"; item: LogItem };

function buildAuditRows(logs: LogItem[]): AuditRow[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const rows: AuditRow[] = [];
  let lastDate = "";
  for (const log of logs) {
    const d = new Date(log.timestamp); d.setHours(0, 0, 0, 0);
    let dateKey: string;
    if (d.getTime() === today.getTime())     dateKey = "Today";
    else if (d.getTime() === yesterday.getTime()) dateKey = "Yesterday";
    else dateKey = log.timestamp.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (dateKey !== lastDate) { rows.push({ type: "header", date: dateKey }); lastDate = dateKey; }
    rows.push({ type: "item", item: log });
  }
  return rows;
}

export function ActivityLogsScreenInline({
  merchantId, ownerRole, branchId, onBack,
}: Readonly<{
  merchantId: string | null;
  ownerRole: string | null;
  branchId?: string | null;
  onBack: () => void;
}>) {
  // No branch picker in front of this screen any more — the Settings header
  // selector picked the branch, so name it here.
  const branchName = useMerchantStore(
    (st) => st.branches.find((b) => b.id === branchId)?.name ?? null,
  );

  const [logs, setLogs]                 = useState<LogItem[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(false);
  const [loadingMore, setLoadingMore]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("ALL");
  const [dateRange, setDateRange]       = useState<DateRangeFilter>("ALL");
  const [customLogRange, setCustomLogRange] = useState<{ from: Date; to: Date } | null>(null);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [dateRangePickerOpen, setDateRangePickerOpen] = useState(false);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [search, setSearch]             = useState("");
  const [selected, setSelected]         = useState<LogItem | null>(null);

  // Memoized so relative ranges (24H/7D/30D) don't produce a fresh `new Date()`
  // ISO string on every render — logDateFrom feeds the fetch effect's deps, so
  // an unstable value loops fetch → setState → re-render → fetch until the
  // backend throttler rejects with 429s.
  const [logDateFrom, logDateTo] = useMemo(() => {
    if (dateRange === "CUSTOM" && customLogRange) {
      return [customLogRange.from.toISOString(), customLogRange.to.toISOString()];
    }
    return [dateRangeFilterToFrom(dateRange), undefined];
  }, [dateRange, customLogRange]);

  const allBranches = useMerchantStore((s) => s.branches);
  const branchNameById = useMemo(
    () => new Map(allBranches.map((b) => [b.id, b.name])),
    [allBranches],
  );

  const canView = ownerRole === "OWNER" || ownerRole === "MERCHANT";

  const mapLog = (d: GqlActivityLog): LogItem => ({
    id:         d._id,
    actorName:  d.actorName  ?? "Unknown",
    actorRole:  "",
    action:     d.action     ?? "",
    entity:     d.module ?? "",
    entityName: d.targetName ?? "",
    metadata:   d.metadata   ? (() => { try { return JSON.parse(d.metadata!); } catch { return {}; } })() : {},
    timestamp:  d.createdAt  ? new Date(d.createdAt) : new Date(),
    branchId:   null,
  });

  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, total: t } = await gqlMyActivityLogs({
          limit: LOGS_PAGE_SIZE,
          offset: 0,
          module: moduleFilter !== "ALL" ? moduleFilter : undefined,
          dateFrom: logDateFrom,
          dateTo: logDateTo,
        });
        if (cancelled) return;
        setLogs(data.map(mapLog));
        setTotal(t);
      } catch (e) {
        if (cancelled) return;
        console.warn("[ActivityLogs] fetch failed:", e);
        setLogs([]);
        setTotal(0);
        useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load activity logs." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [merchantId, moduleFilter, dateRange, logDateFrom, logDateTo]);

  const loadMoreLogs = async () => {
    if (!merchantId || loadingMore || logs.length >= total) return;
    setLoadingMore(true);
    try {
      const { data, total: t } = await gqlMyActivityLogs({
        limit: LOGS_PAGE_SIZE,
        offset: logs.length,
        module: moduleFilter !== "ALL" ? moduleFilter : undefined,
        dateFrom: logDateFrom,
        dateTo: logDateTo,
      });
      setLogs((prev) => [...prev, ...data.map(mapLog)]);
      setTotal(t);
    } catch (e) {
      console.warn("[ActivityLogs] load more failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const onRefresh = async () => {
    if (!merchantId) return;
    setRefreshing(true);
    try {
      const { data, total: t } = await gqlMyActivityLogs({
        limit: LOGS_PAGE_SIZE,
        offset: 0,
        module: moduleFilter !== "ALL" ? moduleFilter : undefined,
        dateFrom: logDateFrom,
        dateTo: logDateTo,
      });
      setLogs(data.map(mapLog));
      setTotal(t);
    } catch (e) {
      console.warn("[ActivityLogs] refresh failed:", e);
    } finally {
      setRefreshing(false);
    }
  };

  const fmtTime = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000)    return "just now";
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const fmtFull = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const needle = search.trim().toLowerCase();
  const filtered = logs.filter((l) => {
    if (branchId && l.branchId && l.branchId !== branchId) return false;
    if (needle) {
      const label = auditActionLabel(l.action).toLowerCase();
      return (
        l.entityName.toLowerCase().includes(needle) ||
        l.actorName.toLowerCase().includes(needle) ||
        label.includes(needle)
      );
    }
    return true;
  });

  const rows = buildAuditRows(filtered);

  return (
    <SafeAreaView style={[S.safe, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar title="Activity & Audit Logs" subtitle={branchName ?? undefined} onBack={onBack} blue />

      {canView ? (
        <>
          {/* Search + chips sticky header */}
          <View style={S.auditStickyHeader}>
            <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
              <View style={S.auditSearchWrap}>
                <I.Search c={C.gray400} />
                <TextInput
                  style={S.auditSearchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search order, staff, action…"
                  placeholderTextColor={C.gray400}
                  autoCapitalize="none"
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
                    <I.X c={C.gray400} s={14} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Filter dropdowns */}
              <View style={{ flexDirection: "row", gap: SP._8, paddingHorizontal: SP._16, paddingBottom: SP._10, paddingTop: SP._4 }}>
                <TouchableOpacity
                  style={S.auditDropdownBtn}
                  onPress={() => setModulePickerOpen(true)}
                  activeOpacity={0.75}
                >
                  <Text style={S.auditDropdownBtnText} numberOfLines={1}>
                    {MODULE_FILTERS.find((f) => f.key === moduleFilter)?.label}
                  </Text>
                  <View style={{ transform: [{ rotate: "90deg" }] }}>
                    <I.Chevron c={C.gray400} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={S.auditDropdownBtn}
                  onPress={() => setDateRangePickerOpen(true)}
                  activeOpacity={0.75}
                >
                  <Text style={S.auditDropdownBtnText} numberOfLines={1}>
                    {dateRange === "CUSTOM" && customLogRange
                      ? formatRangeLabel(customLogRange.from, customLogRange.to)
                      : DATE_RANGE_FILTERS.find((f) => f.key === dateRange)?.label}
                  </Text>
                  <View style={{ transform: [{ rotate: "90deg" }] }}>
                    <I.Chevron c={C.gray400} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {loading ? (
            <View style={S.loadBox}><ActivityIndicator color={C.brand500} /></View>
          ) : rows.length === 0 ? (
            <View style={S.logsNoAccess}>
              <Text style={S.logsNoAccessText}>
                {search ? `No results for "${search}"` : "No activity logs for this filter."}
              </Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(row, i) => row.type === "header" ? `hdr-${row.date}` : row.item.id + String(i)}
              style={{ backgroundColor: C.gray50, maxWidth: 880, width: "100%", alignSelf: "center" }}
              contentContainerStyle={{ padding: SP._16, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void onRefresh(); }} tintColor={C.brand500} colors={[C.brand500]} />}
              ListFooterComponent={
                !search && logs.length < total ? (
                  <TouchableOpacity
                    style={S.auditLoadMoreBtn}
                    onPress={loadMoreLogs}
                    disabled={loadingMore}
                    activeOpacity={0.75}
                  >
                    {loadingMore ? (
                      <ActivityIndicator color={C.brand500} size="small" />
                    ) : (
                      <Text style={S.auditLoadMoreText}>Load more ({total - logs.length} more)</Text>
                    )}
                  </TouchableOpacity>
                ) : !search && logs.length > 0 ? (
                  <Text style={S.auditEndOfList}>— End of results —</Text>
                ) : null
              }
              renderItem={({ item: row }) => {
                if (row.type === "header") {
                  return <Text style={S.auditDateHeader}>{row.date}</Text>;
                }
                const { item } = row;
                const severity: LogSeverity = SEVERITY_MAP[item.action] ?? "NORMAL";
                const dotColor  = SEVERITY_COLORS[severity];
                const badgeBg   = SEVERITY_BG[severity];
                const actionLabel = auditActionLabel(item.action);
                const subtitle    = auditSubtitle(item);
                return (
                  <TouchableOpacity
                    style={S.auditCard}
                    onPress={() => setSelected(item)}
                    activeOpacity={0.75}
                  >
                    <View style={[S.auditDot, { backgroundColor: dotColor }]} />
                    <View style={{ flex: 1 }}>
                      <View style={S.auditCardTop}>
                        <Text style={S.auditCardAction} numberOfLines={1}>{actionLabel}</Text>
                        {severity !== "NORMAL" && (
                          <View style={[S.auditSeverityBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[S.auditSeverityText, { color: dotColor }]}>
                              {severity === "CRITICAL" ? "Critical" : "Important"}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!subtitle && <Text style={S.auditCardSub} numberOfLines={2}>{subtitle}</Text>}
                      <Text style={S.auditCardMeta}>{item.actorName} · {moduleLabel(item.entity)} · {fmtTime(item.timestamp)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: SP._6 }} />}
            />
          )}
        </>
      ) : (
        <View style={S.logsNoAccess}>
          <I.Shield c={C.gray400} />
          <Text style={S.logsNoAccessText}>Only Owners and Managers can view activity logs.</Text>
        </View>
      )}

      {/* ── Module filter picker ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={modulePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModulePickerOpen(false)}
      >
        <TouchableOpacity style={S.auditDetailOverlay} activeOpacity={1} onPress={() => setModulePickerOpen(false)}>
          <TouchableOpacity style={S.auditPickerCard} activeOpacity={1} onPress={() => {}}>
            <View style={S.auditPickerHeader}>
              <Text style={S.auditPickerTitle}>Filter by module</Text>
              <TouchableOpacity onPress={() => setModulePickerOpen(false)} hitSlop={8} activeOpacity={0.7}>
                <I.X c={C.gray400} s={16} />
              </TouchableOpacity>
            </View>
            {MODULE_FILTERS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={S.auditPickerRow}
                onPress={() => { setModuleFilter(key); setModulePickerOpen(false); }}
                activeOpacity={0.7}
              >
                <Text style={[S.auditPickerRowText, moduleFilter === key && S.auditPickerRowTextOn]}>{label}</Text>
                {moduleFilter === key && <I.Check c={C.brand500} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Date range filter picker ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={dateRangePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateRangePickerOpen(false)}
      >
        <TouchableOpacity style={S.auditDetailOverlay} activeOpacity={1} onPress={() => setDateRangePickerOpen(false)}>
          <TouchableOpacity style={S.auditPickerCard} activeOpacity={1} onPress={() => {}}>
            <View style={S.auditPickerHeader}>
              <Text style={S.auditPickerTitle}>Filter by date</Text>
              <TouchableOpacity onPress={() => setDateRangePickerOpen(false)} hitSlop={8} activeOpacity={0.7}>
                <I.X c={C.gray400} s={16} />
              </TouchableOpacity>
            </View>
            {DATE_RANGE_FILTERS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={S.auditPickerRow}
                onPress={() => {
                  setDateRangePickerOpen(false);
                  if (key === "CUSTOM") { setCustomModalOpen(true); return; }
                  setDateRange(key);
                }}
                activeOpacity={0.7}
              >
                <Text style={[S.auditPickerRowText, dateRange === key && S.auditPickerRowTextOn]}>{label}</Text>
                {dateRange === key && <I.Check c={C.brand500} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CustomDateRangeModal
        visible={customModalOpen}
        initialFrom={customLogRange?.from}
        initialTo={customLogRange?.to}
        onApply={(from, to) => { setCustomLogRange({ from, to }); setDateRange("CUSTOM"); setCustomModalOpen(false); }}
        onClose={() => setCustomModalOpen(false)}
      />

      {/* ── Log Detail Modal ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <TouchableOpacity
          style={S.auditDetailOverlay}
          activeOpacity={1}
          onPress={() => setSelected(null)}
        >
          <TouchableOpacity
            style={S.auditDetailCard}
            activeOpacity={1}
            onPress={() => {}}
          >
            {selected && (() => {
              const sev: LogSeverity = SEVERITY_MAP[selected.action] ?? "NORMAL";
              const m = selected.metadata;
              const hasBeforeAfter = m.from !== undefined && m.to !== undefined;
              const hasCancelReason = selected.action === "CANCELLED" && m.reason;
              const hasDuration = selected.action === "SHIFT_ENDED" && m.durationMinutes;
              const extraKeys = Object.keys(m).filter(
                (k) => !["from", "to", "reason", "note", "wasPaid", "durationMinutes", "changes"].includes(k)
                  && !isIdKey(k)
              );
              // "productName" → "Product Name"
              const formatMetaLabel = (k: string) =>
                k.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
              // Fallback for any nested object we don't special-case below — renders
              // "Key: value, Key2: value2" instead of a raw JSON blob.
              const formatMetaValue = (v: unknown): string => {
                if (v === null || v === undefined || v === "") return "—";
                if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
                // Drop entries that stripping emptied out, so they don't leave
                // dangling commas ("Default Products: ,").
                if (Array.isArray(v)) return v.map(formatMetaValue).filter((s) => s.trim() !== "").join(", ");
                if (typeof v === "object") {
                  return Object.entries(v as Record<string, unknown>)
                    .filter(([nk]) => !isIdKey(nk))
                    .map(([nk, nv]) => `${formatMetaLabel(nk)}: ${formatMetaValue(nv)}`)
                    .join(", ");
                }
                return String(v);
              };
              // Some metadata keys carry raw BE schema values (enum slugs, ObjectIds,
              // unformatted numbers) that need a friendlier presentation than the
              // generic camelCase → Title Case fallback.
              const formatMetaRow = (k: string, v: unknown): { label: string; value: string } => {
                if (k === "branchId") {
                  const id = String(v ?? "");
                  // Unresolvable branch (deleted, or outside this merchant) shows
                  // a dash rather than falling back to the raw id.
                  return { label: "Branch", value: branchNameById.get(id) ?? "—" };
                }
                // Staff assignment logs carry the plural form — same treatment.
                if (k === "branchIds") {
                  const names = (Array.isArray(v) ? v : [v])
                    .map((id) => branchNameById.get(String(id ?? "")))
                    .filter(Boolean) as string[];
                  return { label: names.length === 1 ? "Branch" : "Branches", value: names.length ? names.join("\n") : "—" };
                }
                // Order line items: a merchant only needs what was bought and how
                // many. Everything else the BE logs per item (type, pricingType,
                // defaultProducts) is plumbing — one line per item, "Name × qty".
                if (k === "items" && Array.isArray(v)) {
                  const lines = v
                    .map((it) => {
                      const o = (it ?? {}) as Record<string, unknown>;
                      const name = String(o.productName ?? o.serviceName ?? "").trim();
                      if (!name) return "";
                      return o.quantity == null ? name : `${name} × ${o.quantity}`;
                    })
                    .filter(Boolean);
                  return { label: "Items", value: lines.length ? lines.join("\n") : "—" };
                }
                // Sellable products carry the same enum slugs under product* keys.
                if (k === "inventoryCategory" || k === "productCategory") {
                  const raw = String(v ?? "");
                  return { label: "Category", value: INVENTORY_CATEGORY_LABELS[raw] ?? humanizeCamel(raw) };
                }
                if (k === "inventoryUnit" || k === "productUnit") {
                  const raw = String(v ?? "");
                  return { label: "Unit", value: INVENTORY_UNIT_LABELS[raw] ?? humanizeCamel(raw) };
                }
                if (k === "cost" && typeof v === "number") {
                  return { label: "Cost", value: formatPeso(v) };
                }
                if (k === "operatingHours" && v && typeof v === "object") {
                  return { label: "Operating Hours", value: formatOperatingHoursMeta(v as Record<string, any>) };
                }
                if (k === "branchAddress" && v && typeof v === "object") {
                  const a = v as Record<string, unknown>;
                  const parts = [a.streetAddress, a.barangayName, a.cityMunicipalityName, a.provinceName, a.regionName, a.zipCode]
                    .map((p) => (p == null ? "" : String(p).trim()))
                    .filter(Boolean);
                  return { label: "Branch Address", value: parts.length ? parts.join(", ") : "—" };
                }
                if (k === "branchMapLocation" && v && typeof v === "object") {
                  const { latitude, longitude } = v as Record<string, unknown>;
                  return {
                    label: "Map Location",
                    value: latitude != null && longitude != null ? `${latitude}, ${longitude}` : "—",
                  };
                }
                return { label: formatMetaLabel(k), value: formatMetaValue(v) };
              };
              // Mutation args always arrive wrapped as { input: {...} } (see
              // ActivityLoggingInterceptor) — create mutations wrap an extra level
              // deeper (variables are `{ input: CreateXInput }` and CreateXInput
              // itself is logged under an "input" key), so unwrap repeatedly until
              // we reach the real fields object instead of stopping one level early.
              const unwrapInput = (v: unknown): unknown => {
                while (
                  v && typeof v === "object" && !Array.isArray(v) &&
                  Object.keys(v as object).length === 1 && "input" in (v as object)
                ) {
                  v = (v as Record<string, unknown>).input;
                }
                return v;
              };
              const metaRows: { label: string; value: string }[] = extraKeys.flatMap((k) => {
                const v = unwrapInput((m as Record<string, unknown>)[k]);
                if (v && typeof v === "object" && !Array.isArray(v)) {
                  return Object.entries(v as Record<string, unknown>)
                    .filter(([nk]) => !isIdKey(nk))
                    .map(([nk, nv]) => formatMetaRow(nk, unwrapInput(nv)));
                }
                return [formatMetaRow(k, v)];
              })
                // A row whose whole value was ids (e.g. an items entry holding
                // nothing else) would otherwise render as a blank line.
                .filter((r) => r.value.trim() !== "" && r.value.trim() !== ",");
              const nonCriticalSevLabel = sev === "IMPORTANT" ? "Important" : "Normal";
              const sevLabel = sev === "CRITICAL" ? "Critical" : nonCriticalSevLabel;
              return (
                <>
                  {/* Header */}
                  <View style={S.auditDetailHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.auditDetailTitle}>{auditActionLabel(selected.action)}</Text>
                      <Text style={S.auditDetailModule}>{moduleLabel(selected.entity)}</Text>
                      {!!selected.entityName && (
                        <Text style={S.auditDetailRecord} numberOfLines={2} selectable>
                          {selected.entityName}
                        </Text>
                      )}
                    </View>
                    <View style={[S.auditSeverityBadge, { backgroundColor: SEVERITY_BG[sev] }]}>
                      <Text style={[S.auditSeverityText, { color: SEVERITY_COLORS[sev] }]}>
                        {sevLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={S.auditDetailDivider} />

                  {/* Change: before → after */}
                  {hasBeforeAfter && (
                    <View style={S.auditDetailRow}>
                      <Text style={S.auditDetailLabel}>Change</Text>
                      <Text style={S.auditDetailValue}>{String(m.from)} → {String(m.to)}</Text>
                    </View>
                  )}

                  {/* Cancel reason */}
                  {hasCancelReason && (
                    <View style={S.auditDetailRow}>
                      <Text style={S.auditDetailLabel}>Reason</Text>
                      <Text style={S.auditDetailValue}>
                        {CANCEL_REASON_LABELS[String(m.reason)] ?? String(m.reason)}
                        {m.note ? `\n"${String(m.note)}"` : ""}
                      </Text>
                    </View>
                  )}

                  {/* Duration */}
                  {hasDuration && (
                    <View style={S.auditDetailRow}>
                      <Text style={S.auditDetailLabel}>Duration</Text>
                      <Text style={S.auditDetailValue}>{String(m.durationMinutes)} min</Text>
                    </View>
                  )}

                  {/* Actor */}
                  <View style={S.auditDetailRow}>
                    <Text style={S.auditDetailLabel}>Performed by</Text>
                    <Text style={S.auditDetailValue}>{selected.actorName}</Text>
                  </View>

                  {/* Timestamp */}
                  <View style={S.auditDetailRow}>
                    <Text style={S.auditDetailLabel}>Time</Text>
                    <Text style={S.auditDetailValue}>{fmtFull(selected.timestamp)}</Text>
                  </View>

                  {/* Extra metadata */}
                  {metaRows.map((row) => (
                    <View key={row.label} style={S.auditDetailRow}>
                      <Text style={S.auditDetailLabel}>{row.label}</Text>
                      <Text style={S.auditDetailValue}>{row.value}</Text>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={S.auditDetailCloseBtn}
                    onPress={() => setSelected(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={S.auditDetailCloseBtnText}>Done</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
