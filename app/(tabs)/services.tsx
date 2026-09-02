// app/(tabs)/services.tsx
// Service Management — add, edit, archive services with pricing and costing

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { IconStar, IconClose } from "../../src/components/ui/icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useServicesStore } from "../../src/stores/servicesStore";
import { useCan } from "../../src/hooks/usePermission";
import { useBurgerClearance } from "../../src/hooks/useBurgerClearance";
import { type LogActor } from "../../src/utils/logActivity";
import { C, RADIUS } from "../../src/theme/tokens";
import { HeroHeader, TopBar } from "../../src/components/ui";
import { styles } from "../../src/screens/services/styles";
import {
  gqlMyEffectiveCommission,
  commissionBreakdown,
  type EffectiveCommission,
} from "../../src/services/graphql/platformFee";
import {
  CATEGORIES,
  EMPTY_FORM, sanitizeInt, amountError,
  groupByCategory, duplicateNameError,
  fetchAndSetServices, buildServiceFilter, formatTimeLabel,
  fetchInvProducts, toggleServiceFeatured, restoreArchivedService,
  doConfirmArchive, scopeToBranch, applyInventoryItemUpdate, applyInventoryItemRemove,
  serviceCountLabel, doSave, formatActiveSubtitle, buildEmptyConfig,
  type InventoryUsageItem, type InvProduct,
  type Service, type FormData, type CategoryFilter,
} from "../../src/screens/services/model";
import { EmptyServicesBox, ServicesListSection } from "../../src/screens/services/ServicesListSection";
import { InventoryTrackContent, SelectField, FormField } from "../../src/screens/services/FormComponents";
import { AddButton } from "../../src/components/ui/AddButton";
import { BranchPickerView } from "../../src/components/BranchPickerView";
import { Ionicons } from "@expo/vector-icons";

// Types, helpers, and sub-components live in src/screens/services/*.
// This file owns the ServicesScreen route (list view + add/edit form modal).
/** One line of the commission breakdown. Negative values render as a deduction. */
function FeeLine({
  label,
  value,
  strong,
  muted,
}: Readonly<{ label: string; value: number; strong?: boolean; muted?: boolean }>) {
  const negative = value < 0;
  const amount = Math.abs(value).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (
    <View style={styles.feeLineRow}>
      <Text
        style={[
          styles.feeLineLabel,
          strong && styles.feeLineLabelStrong,
          muted && styles.feeLineMuted,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          strong ? styles.feeLineValueStrong : styles.feeLineValue,
          muted && styles.feeLineMuted,
        ]}
      >
        {negative ? "−" : ""}₱{amount}
      </Text>
    </View>
  );
}

export default function ServicesScreen({ onBack: onBackProp, initialBranchId }: { onBack?: () => void; initialBranchId?: string } = {}) {
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();
  const goBack = onBackProp ?? (() => fromSettings === "1" ? router.replace("/(tabs)/settings") : router.back());
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  const { merchantId, role, activeBranchId: authBranchId } = useAuthStore((s) => ({
    merchantId: s.merchantId,
    role: s.role,
    activeBranchId: s.activeBranchId,
  }));
  const branches = useMerchantStore((s) => s.branches);
  const isMerchant = role === "MERCHANT";

  // Merchants read the ONE shared current branch (the same field POS, Orders,
  // Wallet and the dashboard use) so switching anywhere re-scopes this list
  // too. Staff follow their device/active branch; an embedded copy (Settings)
  // is pinned to the branch it was opened for.
  const storeBranchId = useMerchantStore((s) => s.selectedBranchId);
  const selectBranch  = useMerchantStore((s) => s.selectBranch);
  const selectedBranchId =
    initialBranchId ?? (isMerchant ? storeBranchId : (authBranchId ?? null));

  // The all-branches list (with per-branch service counts) is still reachable
  // for a multi-branch owner, but it is no longer a mandatory first step —
  // there is always a current branch to land on.
  const canBrowseBranches = isMerchant && !initialBranchId && branches.length > 1;
  const [branchView, setBranchView] = useState<"picker" | "services">("services");

  // Seed / heal the shared current branch when this tab is the first thing an
  // owner opens, or when the stored branch was archived elsewhere.
  useEffect(() => {
    if (!isMerchant || initialBranchId || branches.length === 0) return;
    if (!storeBranchId || !branches.some((b) => b.id === storeBranchId)) {
      selectBranch(branches[0].id);
    }
  }, [isMerchant, initialBranchId, branches, storeBranchId, selectBranch]);

  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [archiveConfirmVisible, setArchiveConfirmVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // What the platform charges on online bookings, and who bears it. Fetched
  // rather than assumed: the rate and the payer are both admin-editable, and a
  // merchant deciding a price needs the real terms.
  const [commission, setCommission] = useState<EffectiveCommission | null>(null);
  useEffect(() => {
    let alive = true;
    gqlMyEffectiveCommission("MERCHANT")
      .then((c) => { if (alive) setCommission(c); })
      // Silent: the fee block simply doesn't render. Better a form with no fee
      // line than one quoting a rate we failed to confirm.
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("All");
  type StatusFilter = "active" | "inactive" | "archived";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [openPicker, setOpenPicker] = useState<"category" | "unit" | null>(null);

  // Inventory usage state
  const [trackInventory, setTrackInventory] = useState(false);
  const [invProducts, setInvProducts] = useState<InvProduct[]>([]);
  const [invProductsLoading, setInvProductsLoading] = useState(false);
  const [invPickerRow, setInvPickerRow] = useState<number | null>(null);

  const updateInventoryItem = useCallback(
    (idx: number, updated: InventoryUsageItem) => setForm((f) => applyInventoryItemUpdate(f, idx, updated)),
    [],
  );

  const removeInventoryItem = useCallback(
    (idx: number) => setForm((f) => applyInventoryItemRemove(f, idx)),
    [],
  );

  const loadInvProducts = useCallback(
    () => fetchInvProducts(invProducts.length, setInvProducts, setInvProductsLoading),
    [invProducts.length],
  );

  const canAddService     = useCan("canAddService");
  const canEditService    = useCan("canEditService");
  const burgerClearance   = useBurgerClearance();
  const canArchiveService = useCan("canArchiveService");

  const user = useAuthStore((s) => s.user);
  const ownerActor: LogActor = useMemo(() => ({
    id:   user?.uid      ?? merchantId ?? "",
    name: user?.displayName ?? user?.email ?? "Owner",
    role: "OWNER",
  }), [user?.uid, user?.displayName, user?.email, merchantId]);

  const fetchServices = useCallback(async (opts?: { silent?: boolean }) => {
    await fetchAndSetServices(merchantId, setServices, setLoading, opts);
    void useServicesStore.getState().refresh();
  }, [merchantId]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchServices({ silent: true });
    setRefreshing(false);
  }, [fetchServices]);

  const openAdd = () => {
    if (!canAddService) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTrackInventory(false);
    setInvPickerRow(null);
    setOpenPicker(null);
    setArchiveConfirmVisible(false);
    setModalVisible(true);
    loadInvProducts();
  };

  const openEdit = useCallback((svc: Service) => {
    setArchiveConfirmVisible(false);
    setEditingId(svc.id);
    setForm({
      name: svc.name,
      price: svc.price,
      category: svc.category,
      unit: svc.unit,
      type: svc.type,
      inventoryUsage: svc.inventoryUsage,
      isArchived: svc.isArchived,
      estimatedMinutes: svc.estimatedMinutes,
      cost: svc.cost,
      isActive: svc.isActive,
      isOnline: svc.isOnline,
      isFeatured: svc.isFeatured,
      baseKilos: svc.baseKilos,
      excessRate: svc.excessRate,
      note: svc.note ?? "",
      branchId: svc.branchId ?? null,
    });
    setTrackInventory(svc.inventoryUsage.length > 0);
    setInvPickerRow(null);
    setOpenPicker(null);
    setModalVisible(true);
    loadInvProducts();
  }, [loadInvProducts]);

  // Archive from a list card: load the service into the edit context (so
  // confirmArchive has the right editingId + form.name), then surface the
  // archive-confirm dialog that lives inside the edit modal.
  const openArchiveConfirm = useCallback((svc: Service) => {
    if (!canArchiveService) return;
    openEdit(svc);
    setArchiveConfirmVisible(true);
  }, [canArchiveService, openEdit]);

  const save = async () => {
    if (!merchantId) return;
    if (editingId ? !canEditService : !canAddService) return;
    await doSave(merchantId, form, ownerActor, editingId, selectedBranchId, fetchServices, setModalVisible, setSaving, branchServices);
  };

  const archiveService = () => {
    if (!editingId || !canArchiveService) return;
    setArchiveConfirmVisible(true);
  };

  const confirmArchive = async () => {
    if (!editingId || !canArchiveService) return;
    await doConfirmArchive({
      editingId,
      serviceName: form.name.trim(),
      setArchiving,
      setArchiveConfirmVisible,
      setModalVisible,
      fetchServices,
    });
  };

  const restoreService = useCallback((svc: Service) => {
    if (!canArchiveService) return;
    void restoreArchivedService(svc, merchantId, ownerActor, setServices);
  }, [canArchiveService, merchantId, ownerActor]);
  const toggleFeatured = useCallback(
    (svc: Service) => toggleServiceFeatured(svc, setServices),
    [],
  );

  const isFirstService = services.length === 0;
  const cfg = buildEmptyConfig(isFirstService, openAdd, setStatusFilter)[statusFilter];
  const emptyServicesView = (
    <EmptyServicesBox cfg={cfg} isFirstService={isFirstService} statusFilter={statusFilter} />
  );

  // These all feed ServicesListSection, which is memoized. Typing in the form modal
  // re-renders this screen on every keystroke, so recomputing them here (and handing
  // the list fresh array identities) would re-render every service card per character.
  // MERCHANT: strict scope; STAFF: includes global (no branchId) services too.
  const branchServices = useMemo(
    () => scopeToBranch(services, selectedBranchId, isMerchant),
    [services, selectedBranchId, isMerchant],
  );

  const visible = useMemo(
    () => buildServiceFilter(branchServices, statusFilter, categoryFilter, searchText),
    [branchServices, statusFilter, categoryFilter, searchText],
  );

  const { archivedCount, inactiveCount, activeCount } = useMemo(() => ({
    archivedCount: branchServices.filter((s) => s.isArchived).length,
    inactiveCount: branchServices.filter((s) => !s.isArchived && !s.isActive).length,
    activeCount:   branchServices.filter((s) => !s.isArchived && s.isActive).length,
  }), [branchServices]);

  const visibleGrouped = useMemo(() => groupByCategory(visible), [visible]);
  const featuredServices = useMemo(
    () => statusFilter === "active"
      ? branchServices.filter((s) => s.isFeatured && !s.isArchived && s.isActive)
      : [],
    [branchServices, statusFilter],
  );

  const isFormValid =
    form.name.trim().length > 0 &&
    form.price > 0 &&
    !duplicateNameError(form.name, branchServices, editingId) &&
    !amountError(form.price, "Price") &&
    !amountError(form.cost, "Supplies cost") &&
    !amountError(form.baseKilos, "Base kilos") &&
    !amountError(form.excessRate, "Excess rate");

  const servicesLoadingView = (
    <View style={styles.loadingBox}>
      <ActivityIndicator color={C.brand500} size="large" />
    </View>
  );
  const bodyWhenLoaded = visible.length === 0 ? emptyServicesView : null;
  const servicesBodyContent = loading ? servicesLoadingView : bodyWhenLoaded;

  // ── Level 1: Branch picker (MERCHANT only) ──────────────────────────────────
  if (canBrowseBranches && branchView === "picker") {
    return (
      <BranchPickerView
      blueHeader
        title="Services"
        subtitle="Select a branch to manage"
        branches={branches}
        onBack={goBack}
        onSelect={(branchId) => { selectBranch(branchId); setBranchView("services"); }}
        getMetaText={(b) => serviceCountLabel(services.filter((s) => !s.isArchived && s.branchId === b.id).length)}
      />
    );
  }

  // ── Level 2: Services content ────────────────────────────────────────────────
  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.white }]} edges={["top"]}>
      {/* Header — TopBar with back for MERCHANT, HeroHeader for STAFF */}
      {isMerchant ? (
        <TopBar
          title={selectedBranch?.name ?? "Services"}
          subtitle={formatActiveSubtitle(activeCount)}
          onBack={canBrowseBranches ? () => setBranchView("picker") : goBack}
          right={
            <AddButton variant="link" label="Add" onPress={openAdd} disabled={!canAddService} />
          }
        />
      ) : (
        <HeroHeader
          noWave
          title="Services"
          subtitle={formatActiveSubtitle(activeCount) ?? ""}
          // Was a hard push to /(staff)/pos, which both lost the caller's
          // place and grew the history stack. goBack returns to whatever
          // opened this.
          onBack={goBack}
          right={
            <View style={{ marginRight: burgerClearance }}>
              <AddButton variant="link" label="Add" onPress={openAdd} disabled={!canAddService} />
            </View>
          }
        />
      )}

      {/* Search + filter row */}
      <View style={styles.searchRow}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", gap: 10 }}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={C.gray400} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search services..."
            placeholderTextColor={C.gray400}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={C.gray400} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status filter group */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Status</Text>
          <View style={styles.statusFilterRow}>
            {([
              { key: "active",   label: "Active",   icon: "checkmark" },
              { key: "inactive", label: "Inactive",  icon: "pause" },
              { key: "archived", label: "Archived",  icon: "archive-outline" },
            ] as { key: StatusFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(({ key: f, label, icon }) => {
              const filterCounts: Record<StatusFilter, number> = { active: activeCount, inactive: inactiveCount, archived: archivedCount };
              const count = filterCounts[f];
              const isActive = statusFilter === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.statusFilterTab, isActive && styles.statusFilterTabActive]}
                  onPress={() => setStatusFilter(f)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={icon} size={11} color={isActive ? C.white : C.gray500} />
                  <Text style={[styles.statusFilterTabText, isActive && styles.statusFilterTabTextActive]}>
                    {label}{count > 0 ? ` ${count}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Category filter group */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterRow}
          >
            {(["All", ...CATEGORIES] as CategoryFilter[]).map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryFilterChip, categoryFilter === cat && styles.categoryFilterChipActive]}
                onPress={() => setCategoryFilter(cat)}
                activeOpacity={0.75}
              >
                <Text style={[styles.categoryFilterChipText, categoryFilter === cat && styles.categoryFilterChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} />}
      >
        <View style={styles.contentInner}>
        {servicesBodyContent ?? (
          <ServicesListSection
            featuredServices={featuredServices}
            searchText={searchText}
            statusFilter={statusFilter}
            visibleGrouped={visibleGrouped}
            visible={visible}
            onToggleFeatured={toggleFeatured}
            onEdit={openEdit}
            onArchive={openArchiveConfirm}
            onRestore={restoreService}
            canEdit={canEditService}
            canRestore={canArchiveService}
            canArchive={canArchiveService}
          />
        )}
        </View>
      </ScrollView>

      {/* ── Add / Edit Modal ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={modalVisible}
        // Android's transparent Modal briefly shows an opaque black window
        // before the JS content paints when animationType="fade" — the native
        // fade-in and the JS mount aren't synced. "none" skips that flash;
        // iOS doesn't have this bug, so it keeps the nicer fade transition.
        animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
        transparent={isTablet}
        presentationStyle={isTablet ? "overFullScreen" : "pageSheet"}
        onRequestClose={() => {
          if (archiveConfirmVisible) setArchiveConfirmVisible(false);
          else setModalVisible(false);
        }}
      >
        <View style={isTablet ? styles.tabletOverlay : { flex: 1 }}>
        {archiveConfirmVisible ? (
          // On tablet the outer tabletOverlay already provides the dim scrim —
          // archiveOverlay must not paint a second one on top of it (that
          // double-stacked rgba(0,0,0,0.45) is what made this dialog's
          // backdrop look like a darker, oddly-bounded rectangle).
          <View style={[styles.archiveOverlay, isTablet && styles.archiveOverlayNoDim]}>
            <View style={styles.archiveDialog}>
              {/* Icon badge */}
              <View style={styles.archiveIconBadge}>
                <Ionicons name="archive-outline" size={32} color={C.warning500} />
              </View>
              <Text style={styles.archiveDialogTitle}>Archive service?</Text>
              <Text style={styles.archiveDialogDesc}>
                It will be hidden from POS and staff. You can restore it later from the Archived filter.
              </Text>
              <View style={styles.archiveDialogActions}>
                <TouchableOpacity
                  style={styles.archiveDialogCancel}
                  onPress={() => setArchiveConfirmVisible(false)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.archiveDialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.archiveDialogConfirm, archiving && { opacity: 0.6 }]}
                  onPress={confirmArchive}
                  disabled={archiving}
                  activeOpacity={0.8}
                >
                  {archiving ? (
                    <ActivityIndicator color={C.white} size="small" />
                  ) : (
                    <Text style={styles.archiveDialogConfirmText}>Archive</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={isTablet ? styles.tabletCard : { flex: 1 }}
            // This modal is inside a native <Modal>, which opens its own Android window
            // and does NOT inherit the Activity's windowSoftInputMode="adjustResize" —
            // so "undefined" here left focused fields hidden behind the keyboard.
            // "height" also avoids the keyboard, but re-lays out this whole subtree as
            // the keyboard animates; "padding" only shifts the bottom inset.
            behavior="padding"
          >
          <SafeAreaView style={[styles.modalSafe, isTablet && { borderRadius: RADIUS.xl, overflow: "hidden" }]}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}>
                <IconClose />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit Service" : "New Service"}
              </Text>
              <View style={styles.modalHeaderSpacer} />
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalFormInner}>
              <Text style={styles.requiredNote}><Text style={{ color: C.error500, fontWeight: "700" }}>*</Text> Required fields</Text>
              <FormField
                label="Service Name *"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="e.g. Standard Wash"
                error={duplicateNameError(form.name, branchServices, editingId)}
              />

              {/* Category dropdown */}
              <SelectField
                label="Category *"
                value={form.category}
                options={CATEGORIES}
                open={openPicker === "category"}
                onToggle={() => setOpenPicker((v) => v === "category" ? null : "category")}
                onSelect={(cat) => { setForm((f) => ({ ...f, category: cat })); setOpenPicker(null); }}
              />

              {/* Price & Unit side by side */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <FormField
                  label="Price (₱) *"
                  value={form.price === 0 ? "" : String(form.price)}
                  onChangeText={(v) => setForm((f) => ({ ...f, price: Number.parseFloat(v) || 0 }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  maxLength={9}
                  error={amountError(form.price, "Price")}
                  style={{ flex: 1 }}
                />
                <FormField
                  label="Supplies Cost (₱)"
                  value={form.cost === 0 ? "" : String(form.cost)}
                  onChangeText={(v) => setForm((f) => ({ ...f, cost: Number.parseFloat(v) || 0 }))}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  maxLength={9}
                  error={amountError(form.cost, "Supplies cost")}
                  hint="Cost of supplies used for this service only. Utilities, rent, payroll, and overhead are added later in Costing."
                  style={{ flex: 1 }}
                />
              </View>

              {/* Pricing type dropdown */}
              <SelectField
                label="Pricing Type *"
                value={form.unit}
                options={["per kg", "per pc", "per set", "per load", "per kg + base"]}
                open={openPicker === "unit"}
                onToggle={() => setOpenPicker((v) => v === "unit" ? null : "unit")}
                onSelect={(unit: string) => {
                  setForm((f) => ({
                    ...f,
                    unit,
                    baseKilos: unit === "per kg + base" ? (f.baseKilos ?? 0) : undefined,
                    excessRate: unit === "per kg + base" ? (f.excessRate ?? 0) : undefined,
                  }));
                  setOpenPicker(null);
                }}
              />

              {/* Tiered pricing fields — only for per kg + base */}
              {form.unit === "per kg + base" && (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <FormField
                    label="Base Kilos"
                    value={form.baseKilos !== undefined ? String(form.baseKilos) : ""}
                    onChangeText={(v) => setForm((f) => ({ ...f, baseKilos: Number.parseFloat(v) || 0 }))}
                    placeholder="e.g. 4"
                    keyboardType="decimal-pad"
                    maxLength={9}
                    error={amountError(form.baseKilos, "Base kilos")}
                    hint="Included in base price"
                    style={{ flex: 1 }}
                  />
                  <FormField
                    label="Excess Rate (₱/kg)"
                    value={form.excessRate !== undefined ? String(form.excessRate) : ""}
                    onChangeText={(v) => setForm((f) => ({ ...f, excessRate: Number.parseFloat(v) || 0 }))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    maxLength={9}
                    error={amountError(form.excessRate, "Excess rate")}
                    hint="Charged per extra kg"
                    style={{ flex: 1 }}
                  />
                </View>
              )}

              {/* Margin preview */}
              {form.price > 0 && (
                <View style={[styles.marginPreviewBadge, form.cost === 0 && { backgroundColor: C.gray100 }]}>
                  <Text style={[styles.marginPreviewBadgeText, form.cost === 0 && { color: C.gray500 }]}>
                    {form.cost === 0
                      ? "Set supplies cost to calculate margin"
                      : `Supplies Margin: ${(((form.price - form.cost) / form.price) * 100).toFixed(0)}%`}
                  </Text>
                  {form.cost > 0 && (
                    <Text style={styles.marginPreviewSub}>Before utilities and overhead</Text>
                  )}
                </View>
              )}

              {/* ── Where it sells + what the platform takes ────────────────
                  The Online switch lives HERE, next to price, rather than down
                  in Visibility. It is a pricing question as much as a
                  discoverability one: turning it on is what makes the
                  commission below apply, and a switch three sections away from
                  the number it changes is a switch nobody connects to it. */}
              <Text style={styles.modalSectionLabel}>Where it sells</Text>
              <View style={styles.settingsCard}>
                <View style={[styles.settingsCardRow, styles.settingsCardRowFirst]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Online</Text>
                    <Text style={styles.switchHint}>Bookable through the Lalaba app. Off = walk-in / POS only</Text>
                  </View>
                  <Switch
                    value={form.isOnline}
                    onValueChange={(v) => setForm((f) => ({ ...f, isOnline: v }))}
                    trackColor={{ false: C.gray200, true: C.brand400 }}
                    thumbColor={form.isOnline ? C.brand500 : C.gray400}
                  />
                </View>
              </View>

              {/* Commission, shown only when it actually applies. A POS-only
                  service is never charged one, so showing marketplace pricing
                  for it would be noise at best and alarming at worst. */}
              {form.isOnline && commission && (
                <View style={styles.feeCard}>
                  <View style={styles.feeCardHeader}>
                    <Ionicons name="pricetag-outline" size={14} color={C.brand700} />
                    <Text style={styles.feeCardTitle}>
                      Lalaba fee · {commission.percent}%
                    </Text>
                  </View>

                  {(() => {
                    const b = commissionBreakdown(form.price, commission);

                    // No price yet, or a rule a percentage cannot describe:
                    // state the rate and who bears it, and stop there rather
                    // than showing a number we cannot stand behind.
                    if (!b || !b.isQuotable) {
                      return (
                        <Text style={styles.feeCardNote}>
                          {commission.chargedTo === "CUSTOMER"
                            ? "Added on top of your price for orders booked through Lalaba. You receive your full price."
                            : commission.chargedTo === "PROVIDER"
                              ? "Deducted from your price for orders booked through Lalaba."
                              : "Shared between you and the customer on orders booked through Lalaba."}
                        </Text>
                      );
                    }

                    return (
                      <>
                        {commission.chargedTo === "CUSTOMER" ? (
                          <>
                            <FeeLine label="Your price" value={b.providerReceives} />
                            <FeeLine label="Customer Lalaba fee" value={b.feeAmount} />
                            <FeeLine label="Customer pays" value={b.customerPays} muted />
                            <FeeLine label="You receive" value={b.providerReceives} strong />
                          </>
                        ) : (
                          <>
                            <FeeLine label="Customer pays" value={b.customerPays} />
                            <FeeLine label="Lalaba fee" value={-b.feeAmount} />
                            <FeeLine label="You receive" value={b.providerReceives} strong />
                          </>
                        )}
                        <Text style={styles.feeCardNote}>
                          Walk-in and POS orders are not charged this fee.
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}

              {/* Est. time — days + hours + minutes inputs */}
              {(() => {
                const totalMins = form.estimatedMinutes || 0;
                const days = Math.floor(totalMins / 1440);
                const hrs  = Math.floor((totalMins % 1440) / 60);
                const mins = totalMins % 60;
                const num = (v: string) => Number.parseInt(sanitizeInt(v), 10) || 0;
                const setTime = (d: number, h: number, m: number) =>
                  setForm((f) => ({
                    ...f,
                    estimatedMinutes: Math.max(0, d) * 1440 + Math.max(0, h) * 60 + Math.max(0, m),
                  }));
                return (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.fieldLabel}>Est. Time</Text>
                    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                      <View style={{ flex: 1, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <TextInput
                          style={[styles.fieldInput, { flex: 1, textAlign: "center" }]}
                          value={days === 0 ? "" : String(days)}
                          onChangeText={(v) => setTime(num(v), hrs, mins)}
                          placeholder="0"
                          placeholderTextColor={C.gray400}
                          keyboardType="number-pad"
                        />
                        <Text style={{ fontSize: 13, color: C.gray500, fontWeight: "600" }}>days</Text>
                      </View>
                      <View style={{ flex: 1, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <TextInput
                          style={[styles.fieldInput, { flex: 1, textAlign: "center" }]}
                          value={hrs === 0 ? "" : String(hrs)}
                          onChangeText={(v) => setTime(days, Math.min(23, num(v)), mins)}
                          placeholder="0"
                          placeholderTextColor={C.gray400}
                          keyboardType="number-pad"
                        />
                        <Text style={{ fontSize: 13, color: C.gray500, fontWeight: "600" }}>hrs</Text>
                      </View>
                      <View style={{ flex: 1, maxWidth: 150, flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <TextInput
                          style={[styles.fieldInput, { flex: 1, textAlign: "center" }]}
                          value={mins === 0 ? "" : String(mins)}
                          onChangeText={(v) => setTime(days, hrs, Math.min(59, num(v)))}
                          placeholder="0"
                          placeholderTextColor={C.gray400}
                          keyboardType="number-pad"
                        />
                        <Text style={{ fontSize: 13, color: C.gray500, fontWeight: "600" }}>min</Text>
                      </View>
                    </View>
                    {totalMins > 0 && (
                      <Text style={[styles.fieldHint, { marginTop: 4 }]}>
                        {formatTimeLabel(days, hrs, mins)} · {totalMins} minutes total
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* ── VISIBILITY ───────────────────────────────── */}
              <Text style={styles.modalSectionLabel}>Visibility</Text>
              <View style={styles.settingsCard}>
                {/* Featured */}
                <View style={[styles.settingsCardRow, styles.settingsCardRowFirst, form.isFeatured && { backgroundColor: "#FEFCE8" }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.switchLabelRow}>
                      <IconStar size={12} color={form.isFeatured ? C.warning500 : C.gray400} />
                      <Text style={[styles.switchLabel, form.isFeatured && styles.switchLabelFeatured]}>
                        Featured
                      </Text>
                    </View>
                    <Text style={styles.switchHint}>Highlighted at top of service list</Text>
                  </View>
                  <Switch
                    value={form.isFeatured}
                    onValueChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))}
                    trackColor={{ false: C.gray200, true: C.warning300 }}
                    thumbColor={form.isFeatured ? C.warning500 : C.gray400}
                  />
                </View>

                {/* Active */}
                <View style={styles.settingsCardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchLabel}>Active</Text>
                    <Text style={styles.switchHint}>Inactive services won&apos;t appear in POS</Text>
                  </View>
                  <Switch
                    value={form.isActive}
                    onValueChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                    trackColor={{ false: C.gray200, true: C.brand400 }}
                    thumbColor={form.isActive ? C.brand500 : C.gray400}
                  />
                </View>
              </View>

              {/* ── STOCK ─────────────────────────────────────── */}
              <Text style={styles.modalSectionLabel}>Stock</Text>
              <View style={styles.settingsCard}>
                {/* Track inventory toggle */}
                <View style={[styles.settingsCardRow, styles.settingsCardRowFirst]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.switchLabel, invProducts.length === 0 && !invProductsLoading && { color: C.gray400 }]}>
                      Track inventory usage
                    </Text>
                    <Text style={styles.switchHint}>
                      {invProducts.length === 0 && !invProductsLoading
                        ? "No inventory items found — add items in Inventory first"
                        : "Deduct stock automatically when this is sold"}
                    </Text>
                  </View>
                  <Switch
                    value={trackInventory}
                    onValueChange={(v) => {
                      setTrackInventory(v);
                      if (!v) setForm((f) => ({ ...f, inventoryUsage: [] }));
                      setInvPickerRow(null);
                    }}
                    trackColor={{ false: C.gray200, true: C.brand400 }}
                    thumbColor={trackInventory ? C.brand500 : C.gray400}
                    disabled={invProducts.length === 0 && !invProductsLoading}
                  />
                </View>
              </View>

              {trackInventory && (
                <InventoryTrackContent
                  loading={invProductsLoading}
                  products={invProducts}
                  usageItems={form.inventoryUsage}
                  serviceUnit={form.unit}
                  pickerRow={invPickerRow}
                  onTogglePicker={(idx) => setInvPickerRow(invPickerRow === idx ? null : idx)}
                  onChange={updateInventoryItem}
                  onRemove={removeInventoryItem}
                  onAddRow={() => {
                    const newIdx = form.inventoryUsage.length;
                    setForm((f) => ({
                      ...f,
                      inventoryUsage: [...f.inventoryUsage, { inventoryItemId: "", quantity: 0, unit: "ml", per: "order" }],
                    }));
                    setInvPickerRow(newIdx);
                  }}
                />
              )}

              <FormField
                label="Notes"
                value={form.note ?? ""}
                onChangeText={(v) => setForm((f) => ({ ...f, note: v }))}
                placeholder="Special instructions or description"
                multiline
              />

              {editingId && (
                <TouchableOpacity
                  style={[styles.archiveBtn, !canArchiveService && { opacity: 0.4 }]}
                  onPress={archiveService}
                  disabled={!canArchiveService}
                  activeOpacity={0.7}
                >
                  <Text style={styles.archiveBtnText}>Archive this service</Text>
                </TouchableOpacity>
              )}
              </View>
            </ScrollView>

            {/* Modal footer */}
            <View style={styles.modalFooter}>
              <View style={styles.modalFooterInner}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAddBtn, (saving || !isFormValid || (editingId ? !canEditService : !canAddService)) && { opacity: 0.45 }]}
                onPress={save}
                disabled={saving || !isFormValid || (editingId ? !canEditService : !canAddService)}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color={C.white} size="small" />
                ) : (
                  <Text style={styles.modalAddBtnText}>
                    {editingId ? "Save Changes" : "Add Service"}
                  </Text>
                )}
              </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
          </KeyboardAvoidingView>
        )}
        </View>
      </Modal>

      {/* ── Product tour ── */}
    </SafeAreaView>
  );
}

// Maps service billing unit → which "per" options make sense

