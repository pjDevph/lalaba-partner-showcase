// Terminal tab — the walk-in order builder (services, cart, payment). Extracted from pos.tsx.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, PanResponder, Animated, Keyboard, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { C, SP } from "../../theme/tokens";
import { showAlert, showConfirm } from "../../lib/dialog";
import { getMinutesUntilClose } from "../../utils/operatingHours";
import { type POSPaymentMethod, PAYMENT_METHOD_LABELS } from "../../types/pos.types";
import { ClaimTicket } from "../../components/pos/ClaimTicket";
import { GCashQRModal } from "../../components/pos/GCashQRModal";
import { POSSummaryModal } from "../../components/pos/POSSummaryModal";
import { auth } from "../../config/firebase";
import { usePOSOrderStore } from "../../stores/posOrderStore";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { useServicesStore } from "../../stores/servicesStore";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useDisplayStore } from "../../stores/displayStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useProductsStore } from "../../stores/productsStore";
import { useQueueStore } from "../../stores/queueStore";
import { useCan } from "../../hooks/usePermission";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useFontScale } from "../../../app/_layout";
import { Icon, fp, mapStoreService, type ServiceDef } from "./shared";
import { ServiceTile } from "./ServiceTile";
import { AddCustomerDrawer } from "./AddCustomerDrawer";
import { P, S } from "./styles";

// ─── Terminal helpers ──────────────────────────────────────────────────────────

function matchesServiceFilter(svc: ServiceDef, query: string, filterCat: string): boolean {
  const matchesSearch = query.length === 0 || svc.name.toLowerCase().includes(query);
  if (filterCat === "All") return matchesSearch;
  if (filterCat === "★") return matchesSearch && !!svc.isFeatured;
  return matchesSearch && svc.category === filterCat;
}


// Sellable Products are always sold in whole units — "pc" here is the POS
// display unit, unrelated to productUnit (which is the Inventory-consumption
// unit, e.g. "g", and would be confusing shown as "₱15/g" on a tile).
function mapStoreProduct(p: { _id: string; productName: string; price: number; productCategory: string }): ServiceDef {
  return {
    id:        p._id,
    name:      p.productName,
    unitPrice: p.price ?? 0,
    // Not shown on the tile (ServiceTile only renders name/price). Constant so
    // buildServiceCategories() sees only one category and hides the chip row —
    // products aren't grouped by productCategory in the POS picker.
    category:  "product",
    unit:      "pc",
    isAddon:   false,
  };
}

// ─── Terminal sub-logic helpers ───────────────────────────────────────────────

function buildServiceCategories(services: ServiceDef[]): string[] {
  const hasFeatured = services.some((sv) => sv.isFeatured);
  return [
    ...(hasFeatured ? ["★"] : []),
    "All",
    ...new Set(services.map((sv) => sv.category).filter(Boolean)),
  ];
}

async function executeOrderSubmit(
  paymentMethod: string,
  splits: { method: string; amount: number }[],
  setShowGCashModal: (v: boolean) => void,
  submitOrder: () => Promise<void>,
): Promise<void> {
  // Determine effective primary method (first split method or single method)
  const effectiveMethod = splits.length > 0 ? (splits[0]?.method ?? paymentMethod) : paymentMethod;
  // Maya has no QR step: the app never had a mayaQrUrl to show (the field
  // existed on no type, store or schema), so the modal could only ever render
  // its "not configured" placeholder. Maya is tendered like any other non-cash
  // method — the cashier records the merchant's own reference number inline.
  if (effectiveMethod === "GCASH") { setShowGCashModal(true); return; }
  await submitOrder();
}

function validateDiscount(value: number, subtotal: number): string | null {
  if (Number.isNaN(value) || value <= 0) return "Enter a valid amount.";
  if (value > subtotal) return "Discount can't exceed subtotal.";
  return null;
}

function applyQtyBlurUpdate(
  id: string,
  qtyEdit: Record<string, string>,
  updateItem: (id: string, patch: { weightKg: number }) => void,
  setQtyEdit: (fn: (p: Record<string, string>) => Record<string, string>) => void,
) {
  const v = Number.parseFloat(qtyEdit[id] ?? "1");
  if (!Number.isNaN(v) && v > 0) updateItem(id, { weightKg: v });
  setQtyEdit((p) => { const n = { ...p }; delete n[id]; return n; });
}

function isCashShort(
  paymentMethod: string,
  amountReceived: number,
  total: number,
  splits: { method: string; amount: number }[],
): boolean {
  if (splits.length > 0) {
    const splitSum = splits.reduce((s, sp) => s + sp.amount, 0);
    return splitSum < total;
  }
  return paymentMethod === "CASH" && amountReceived < total;
}

function getOrderActionLabel(createdOrder: unknown): string {
  return createdOrder ? "Order created ✓" : "Create Order";
}

function applyDiscountOrAlert(
  discountInput: string,
  discountCodeInput: string,
  sub: number,
  setDiscount: (amount: number, code: string) => void,
  setShowDiscount: (v: boolean) => void,
): void {
  const v = Number.parseFloat(discountInput);
  const discountError = validateDiscount(v, sub);
  if (discountError) {
    const title = Number.isNaN(v) || v <= 0 ? "Invalid discount" : "Too large";
    showAlert(title, discountError);
    return;
  }
  setDiscount(v, discountCodeInput.trim());
  setShowDiscount(false);
}

/** onGoToQueue: switches the POS to the Queue tab (owned by the parent POS
 *  screen, which holds the tab state). Used by the claim ticket's
 *  "Back to Queue" button. */
export function TerminalTab({ onGoToQueue }: Readonly<{ onGoToQueue?: () => void }> = {}) {
  const fs = useFontScale();
  const {
    walkinCustomer, items, paymentMethod, amountReceived,
    isSubmitting, error, queued, createdOrder, createdOrderFull,
    setWalkinCustomer, addItem, removeItem, updateItem, addCustomCharge,
    setPaymentMethod, setAmountReceived,
    submitOrder, resetOrder, clearError,
    notes, setNotes,
    discountAmount, discountCode, discountType, setDiscount, clearDiscount,
    subtotal, totalAmount, changeGiven, splitTotal,
    splits, setSplit, removeSplit, clearSplits,
    setReferenceId,
    fulfillmentType, setFulfillmentType,
    paymentTiming, setPaymentTiming,
  } = usePOSOrderStore();

  const activeStaff = useActiveStaffStore((s) => s.activeStaff);
  const canApplyDiscount = useCan("canApplyDiscount");
  const canCreateOrder = useCan("canCreateOrder");

  const merchant          = useMerchantStore((s) => s.profile);
  const selectedBranchId  = useMerchantStore((s) => s.selectedBranchId);
  const _branches         = useMerchantStore((s) => s.branches);
  const push              = useNotificationStore((s) => s.push);
  const merchantId        = useAuthStore((s) => s.merchantId);
  const role              = useAuthStore((s) => s.role);
  const activeBranchId    = useAuthStore((s) => s.activeBranchId);
  // Full access is the owner's. The second arm of this check (STAFF with a
  // MANAGER branch role) was unreachable — no membership is ever built as
  // MANAGER — so it only ever resolved to the merchant.
  const hasFullAccess = role === "MERCHANT";

  // Merchants scope by merchantStore.selectedBranchId; staff scope by
  // authStore.activeBranchId — merchantStore.selectedBranchId can go stale
  // for staff, so it isn't safe to prefer it via `??` for staff.
  const effectiveBranchId = role === "MERCHANT" ? selectedBranchId : activeBranchId;

  // GCash QR: branch-level takes priority, falls back to merchant-level.
  const _activePOSBranch  = _branches.find((b) => b.id === effectiveBranchId) ?? null;
  const effectiveGcashQrUrl = _activePOSBranch?.gcashQrUrl ?? merchant?.gcashQrUrl ?? null;

  const insets = useSafeAreaInsets();
  const scrollRef = React.useRef<ScrollView>(null);
  const { width: winW, height: winH } = useWindowDimensions();
  // Layout follows the device orientation automatically (auto-rotate). No manual toggle.
  const isLandscape = winW > winH;

  // ── Service-grid zoom (persisted) ──────────────────────────────────────────
  // Lets smaller devices fit more tiles. + = fewer/larger tiles, − = more/smaller.
  const posZoomDelta = useDisplayStore((s) => s.posZoomDelta);
  const setPosZoomDelta = useDisplayStore((s) => s.setPosZoomDelta);
  // Portrait defaults to full-width rows (1 col) so service cards are big and
  // easy to tap; the cashier can zoom out for a denser grid. Landscape keeps a grid.
  const baseCols = isLandscape ? 3 : 1;
  const MIN_COLS = isLandscape ? 2 : 1, MAX_COLS = isLandscape ? 6 : 4;
  const gridCols = Math.max(MIN_COLS, Math.min(MAX_COLS, baseCols - posZoomDelta));
  const tileWidthPct = `${((100 - 3 * (gridCols - 1)) / gridCols).toFixed(1)}%`;
  const canZoomIn  = gridCols > MIN_COLS;   // fewer columns = bigger tiles
  const canZoomOut = gridCols < MAX_COLS;   // more columns = smaller tiles
  const zoomIn  = () => { if (canZoomIn)  setPosZoomDelta(posZoomDelta + 1); };
  const zoomOut = () => { if (canZoomOut) setPosZoomDelta(posZoomDelta - 1); };

  const [showGCashModal, setShowGCashModal] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [cardRef, setCardRef] = useState("");
  const [qphRef, setQphRef] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [splitInputs, setSplitInputs] = useState<Record<string, string>>({});
  const [splitRefs, setSplitRefs] = useState<Record<string, string>>({});
  const [keypadInput, setKeypadInput] = useState("");
  const [gcashRef, setGcashRef] = useState("");
  const [mayaRef, setMayaRef] = useState("");
  const [showCustomer, setShowCustomer] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const reviewSheetY     = useRef(new Animated.Value(winH)).current;
  const reviewSnapRef    = useRef(0);
  const closeReviewRef   = useRef<() => void>(() => {});
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [showCustomCharge, setShowCustomCharge] = useState(false);
  // Clears the cart + transient panels after a claim ticket is dismissed.
  // Shared by the ticket's close / "New Order" / "Back to Queue" actions.
  const resetTicketState = useCallback(() => {
    resetOrder();
    setKeypadInput("");
    setShowDiscount(false);
    setShowCustomCharge(false);
  }, [resetOrder]);
  const [chargePreset, setChargePreset] = useState("");
  const [chargeCustomName, setChargeCustomName] = useState("");
  const [chargeAmountInput, setChargeAmountInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCat, setFilterCat] = useState<string>("All");
  const [serviceTypeTab, setServiceTypeTab] = useState<"service" | "product">("service");
  const [qtyEdit, setQtyEdit] = useState<Record<string, string>>({});
  const rawServices    = useServicesStore((s) => s.services);
  const servicesLoaded = useServicesStore((s) => s.isLoaded);
  const services       = useMemo(
    () => rawServices
      .filter((s) => !s.isArchived && s.serviceName?.trim())
      .map(mapStoreService),
    [rawServices],
  );

  // Filter services to the effective branch.
  // A service with branchId=null is "global" — visible to all branches.
  // A service with branchId set only shows in that branch.
  const branchServices = effectiveBranchId
    ? services.filter((sv) => !sv.branchId || sv.branchId === effectiveBranchId)
    : services;

  // Sellable Products link to Inventory via inventoryId, not branchId directly —
  // keep this branch's Inventory list loaded so we can cross-reference it,
  // same pattern as the Products tab in the Inventory screen.
  // Services/Products stores are otherwise only loaded once at auth bootstrap
  // and only refreshed by whoever edits them on their own device — a second
  // device (e.g. a staff cashier) would never see a merchant's new service or
  // product until it refocuses Terminal, so refresh both here too.
  useFocusEffect(
    useCallback(() => {
      if (!effectiveBranchId) return;
      useInventoryStore.getState().setBranchId(effectiveBranchId);
      void useInventoryStore.getState().refresh();
      void useServicesStore.getState().refresh();
      void useProductsStore.getState().refresh();
    }, [effectiveBranchId])
  );
  const branchInventoryProducts = useInventoryStore((s) => s.products);
  const branchInventoryIds = useMemo(
    () => new Set(branchInventoryProducts.map((p) => p.id)),
    [branchInventoryProducts]
  );
  const rawProducts = useProductsStore((s) => s.products);
  const branchProducts = useMemo(
    () => rawProducts
      .filter((p) => !p.isArchived && branchInventoryIds.has(p.inventoryId))
      .map(mapStoreProduct),
    [rawProducts, branchInventoryIds]
  );

  // Split by type tab
  const tabServices = serviceTypeTab === "product" ? branchProducts : branchServices;

  const serviceCategories = buildServiceCategories(tabServices);
  const searchQueryNormalized = searchQuery.trim().toLowerCase();
  const filteredServices = tabServices.filter(
    (sv) => matchesServiceFilter(sv, searchQueryNormalized, filterCat)
  );

  const productsLoaded = useProductsStore((s) => s.isLoaded);
  const noServicesAddedTitle =
    serviceTypeTab === "product" ? "No products for sale yet"
    : "No services available yet";
  const noServicesAddedHint =
    serviceTypeTab === "product" ? "Add a sellable product in the Inventory tab's Products section."
    : "Add at least one service before creating POS orders.";
  const noServicesAddedRoute = serviceTypeTab === "product" ? "/(tabs)/inventory" : "/(tabs)/services";
  const noServicesAddedLabel = serviceTypeTab === "product" ? "Add Product" : "Add Service";
  const noServicesAddedView = hasFullAccess ? (
    <>
      <Text style={S.tileEmptyTitle}>{noServicesAddedTitle}</Text>
      <Text style={S.tileEmptyText}>{noServicesAddedHint}</Text>
      <TouchableOpacity
        style={S.tileEmptyBtn}
        onPress={() => router.push(noServicesAddedRoute)}
        activeOpacity={0.85}
      >
        <Text style={S.tileEmptyBtnText}>{noServicesAddedLabel}</Text>
      </TouchableOpacity>
    </>
  ) : (
    <>
      <Text style={S.tileEmptyTitle}>
        {serviceTypeTab === "product" ? "No products available" : "No services available"}
      </Text>
      <Text style={S.tileEmptyText}>
        Your manager hasn&apos;t added any{serviceTypeTab === "product" ? " products" : " services"} yet.
      </Text>
    </>
  );
  const noServicesFilterView = (
    <Text style={S.tileEmptyText}>
      {filterCat === "★"
        ? "No featured items — star one in the Services tab."
        : "No results — try a different search or category."}
    </Text>
  );
  const noServicesLoadedView = tabServices.length === 0 ? noServicesAddedView : noServicesFilterView;
  const activeTabLoaded = serviceTypeTab === "product" ? productsLoaded : servicesLoaded;
  const noServicesEmptyView = activeTabLoaded ? noServicesLoadedView : <ActivityIndicator color={P.blue} />;

  const inCart = (id: string) => items.some((i) => i.serviceId === id);
  const sub    = subtotal();
  const total  = totalAmount();
  const change = changeGiven();
  const insufficientCash = isCashShort(paymentMethod, amountReceived, total, splits);
  // A walk-in paid sale needs only a service + (for cash) enough money. Customer
  // details are OPTIONAL — they're only useful for a claim ticket, so we never
  // block checkout on them (just show a soft hint). `orderBlockReason` doubles as
  // the CTA label when set.
  const splitCov = splits.length > 0 ? splitTotal() : 0;
  const shortAmt = splits.length > 0 ? total - splitCov : total - amountReceived;
  const insufficientCashLabel = insufficientCash
    ? (paymentMethod === "CASH" && amountReceived === 0 && splits.length === 0
        ? "Enter cash received"
        : `Short ₱${Math.max(0, shortAmt).toFixed(2)}`)
    : null;
  const deliveryMissingCustomer =
    fulfillmentType === "DELIVERY" &&
    (!walkinCustomer.name?.trim() || !walkinCustomer.phone?.trim() || !walkinCustomer.address?.trim());

  const orderBlockReason: string | null =
    !canCreateOrder ? "No permission to create orders"
    : items.length === 0 ? "Add a service"
    : deliveryMissingCustomer ? "Add customer details"
    : (paymentTiming === "now" ? insufficientCashLabel : null);

  useEffect(() => {
    const bid = effectiveBranchId ?? merchantId ?? auth.currentUser?.uid ?? "";
    if (bid) usePOSOrderStore.getState().setBranchId(bid);
  }, [effectiveBranchId, merchantId]);

  useEffect(() => {
    if (createdOrder) setShowGCashModal(false);
  }, [createdOrder]);

  // Sync the local keypad display with the persisted store value whenever the
  // Review sheet opens. Without this, a stale amountReceived in AsyncStorage can
  // make the button appear active while the display still shows ₱0.00.
  useEffect(() => {
    if (showReview) {
      setKeypadInput(amountReceived > 0 ? String(amountReceived) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReview]);

  useEffect(() => {
    if (error) { push({ type: "error", title: "Order Error", message: error }); clearError(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);


  const handleTapService = useCallback((svc: ServiceDef) => {
    addItem({
      serviceId:       svc.id,
      serviceName:     svc.name,
      weightKg:        1,
      unitPrice:       svc.unitPrice,
      lineTotal:       svc.unitPrice,
      pricingType:     svc.pricingType,
      defaultProducts: svc.defaultProducts?.map((dp) => ({ ...dp, included: true })),
    });
    Keyboard.dismiss();
  }, [addItem]);

  // Sellable Products reuse ServiceTile's tap/stepper UI — serviceId doubles as
  // the cart dedup key; submitOrder drops it for type:"product" items and
  // sends productId/productName to the backend instead (see posOrderStore).
  const handleTapProduct = useCallback((svc: ServiceDef) => {
    addItem({
      serviceId:   svc.id,
      serviceName: svc.name,
      weightKg:    1,
      unitPrice:   svc.unitPrice,
      lineTotal:   svc.unitPrice,
      type:        "product",
      productId:   svc.id,
      productName: svc.name,
    });
    Keyboard.dismiss();
  }, [addItem]);

  const handleTapTile = serviceTypeTab === "product" ? handleTapProduct : handleTapService;

  const onQtyFocus  = (id: string, current: number) => setQtyEdit((p) => ({ ...p, [id]: String(current) }));
  // Keep the raw draft string for display (so "5." mid-typing works) but push
  // every valid value to the store immediately — totals must track the typed
  // qty live, not wait for blur.
  const onQtyChange = (id: string, v: string) => {
    setQtyEdit((p) => ({ ...p, [id]: v }));
    const parsed = Number.parseFloat(v);
    if (!Number.isNaN(parsed) && parsed > 0) updateItem(id, { weightKg: parsed });
  };
  const onQtyBlur   = (id: string) => applyQtyBlurUpdate(id, qtyEdit, updateItem, setQtyEdit);

  const handleApplyDiscount = () => {
    applyDiscountOrAlert(discountInput, discountCodeInput, sub, setDiscount, setShowDiscount);
  };

  const { isOffline } = useNetworkStatus();

  const applyRefs = useCallback(() => {
    if (paymentMethod === "CARD")              setReferenceId(cardRef.trim()  || undefined);
    else if (paymentMethod === "QPH")          setReferenceId(qphRef.trim()   || undefined);
    else if (paymentMethod === "GCASH")        setReferenceId(gcashRef.trim() || undefined);
    else if (paymentMethod === "MAYA")         setReferenceId(mayaRef.trim()  || undefined);
    else if (paymentMethod === "BANK_TRANSFER") setReferenceId(bankRef.trim() || undefined);
  }, [paymentMethod, cardRef, qphRef, gcashRef, mayaRef, bankRef, setReferenceId]);

  const submitAfterChecks = useCallback(async () => {
    if (isOffline) {
      showConfirm(
        "No Internet Connection",
        "You're offline. The order will be saved and automatically synced once you're back online.\n\nProceed?",
        () => {
          applyRefs();
          void executeOrderSubmit(paymentMethod, splits, setShowGCashModal, submitOrder);
        },
        { confirmLabel: "Queue Offline" }
      );
      return;
    }
    applyRefs();
    // If a GCash ref was pre-entered inline, skip the QR modal and submit directly.
    if (paymentMethod === "GCASH" && gcashRef.trim()) {
      await submitOrder();
      return;
    }
    await executeOrderSubmit(paymentMethod, splits, setShowGCashModal, submitOrder);
  }, [isOffline, paymentMethod, gcashRef, splits, submitOrder, setShowGCashModal, applyRefs]);

  const doSubmit = useCallback(async () => {
    // Product-only sales aren't time-bound by service turnaround, so the
    // closing-soon warning only applies when the cart has at least one service.
    const hasServiceItem = items.some((i) => (i.type ?? "service") === "service");
    if (hasServiceItem) {
      const minsToClose = getMinutesUntilClose(_activePOSBranch?.operatingHours);
      if (minsToClose !== null && minsToClose <= 30) {
        const message = minsToClose <= 0
          ? "This branch is already past its closing time. Are you sure you want to accept this order?"
          : `This branch will be closing in ${minsToClose} minute${minsToClose === 1 ? "" : "s"}. Are you sure you want to accept this order?`;
        showConfirm(
          "Store Closing Soon",
          message,
          () => { void submitAfterChecks(); },
          { confirmLabel: "Accept Order" }
        );
        return;
      }
    }
    await submitAfterChecks();
  }, [items, _activePOSBranch, submitAfterChecks]);

  const handleCloseReview = useCallback(() => {
    setShowReview(false);
    setAmountReceived(0);
    setKeypadInput("");
  }, [setAmountReceived]);

  // ── Draggable Review Sheet ────────────────────────────────────────────────
  useEffect(() => { closeReviewRef.current = handleCloseReview; }, [handleCloseReview]);

  const SHEET_H       = winH - insets.top - 8;
  const SNAP_PARTIAL  = SHEET_H * 0.42;  // ~58% visible
  const SNAP_FULL     = 0;               // 100% visible

  useEffect(() => {
    if (showReview && !isLandscape) {
      reviewSnapRef.current = SNAP_FULL;
      Animated.spring(reviewSheetY, { toValue: SNAP_FULL, useNativeDriver: true, bounciness: 3 }).start();
    } else {
      Animated.timing(reviewSheetY, { toValue: SHEET_H, duration: 280, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReview, isLandscape]);

  const reviewPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      const next = reviewSnapRef.current + g.dy;
      reviewSheetY.setValue(Math.max(SNAP_FULL, Math.min(SHEET_H, next)));
    },
    onPanResponderRelease: (_, g) => {
      const landed = reviewSnapRef.current + g.dy;
      if (g.vy > 0.6 || landed > SHEET_H * 0.65) {
        Animated.timing(reviewSheetY, { toValue: SHEET_H, duration: 250, useNativeDriver: true })
          .start(() => closeReviewRef.current());
        return;
      }
      const target = (g.vy < -0.5 || landed < SHEET_H * 0.22) ? SNAP_FULL : SNAP_PARTIAL;
      reviewSnapRef.current = target;
      Animated.spring(reviewSheetY, { toValue: target, useNativeDriver: true, bounciness: 4 }).start();
    },
  })).current;

  const handleGCashConfirmed = useCallback(async (ref?: string) => {
    if (ref) { setReferenceId(ref); }
    setShowGCashModal(false);
    await submitOrder();
  }, [submitOrder, setReferenceId]);

  const orderActionLabel = getOrderActionLabel(createdOrder);

  // Discount label — computed here so renderOrderCart (implicit-return arrow) can use it.
  const discountCodeLabel = discountCode ? `"${discountCode}"` : "Discount";
  const discountSeniorLabel = discountType === "SENIOR" ? "Senior (20%)" : discountCodeLabel;
  const discountLabel = discountType === "PWD" ? "PWD (20%)" : discountSeniorLabel;

  // Cart / "Current Sale" content — shared by the portrait Review sheet and the
  // landscape persistent cart panel. `scrollStyle` controls the scroll-area size:
  // a capped height inside the portrait bottom sheet, flex-fill in the landscape panel.
  const renderOrderCart = (scrollStyle: any) => (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={scrollStyle}
      >
        {/* Items */}
        <View style={S.reviewSection}>
          {items.map((item) => {
            const isCustom = item.serviceId.startsWith("custom:");
            const editing = qtyEdit[item.serviceId];
            const displayQty = editing ?? String(item.weightKg);
            const svcUnit = isCustom ? "" : (services.find((sv) => sv.id === item.serviceId)?.unit ?? "kg");
            return (
              <View key={item.serviceId}><View style={S.lineItem}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[S.lineItemName, { fontSize: 14 * fs }]} numberOfLines={1}>
                    {item.serviceName}
                  </Text>
                  {isCustom && (
                    <Text style={{ fontSize: 10, color: P.warning, fontWeight: "600" }}>Custom charge</Text>
                  )}
                </View>
                <View style={S.lineItemRight}>
                  {!isCustom && (
                    <>
                      <TextInput
                        style={S.qtyInput}
                        value={displayQty}
                        onFocus={() => onQtyFocus(item.serviceId, item.weightKg)}
                        onChangeText={(v) => onQtyChange(item.serviceId, v)}
                        onBlur={() => onQtyBlur(item.serviceId)}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                      <Text style={S.lineItemUnit}>{svcUnit}</Text>
                    </>
                  )}
                  <Text style={S.lineItemTotal}>{fp(item.lineTotal)}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.serviceId)} style={S.removeBtn} hitSlop={6}>
                    <Icon.X s={13} c={P.muted} />
                  </TouchableOpacity>
                </View></View>
              </View>
            );
          })}


          {/* Discount */}
          {discountAmount > 0 ? (
            <View style={S.discountApplied}>
              <Icon.Percent />
              <Text style={S.discountAppliedText}>
                {discountLabel} applied
              </Text>
              <TouchableOpacity
                onPress={() => { clearDiscount(); setDiscountInput(""); setDiscountCodeInput(""); }}
                style={{ marginLeft: "auto" }}
              >
                <Icon.X s={12} />
              </TouchableOpacity>
            </View>
          ) : canApplyDiscount ? (
            <>
              <TouchableOpacity style={S.addLink} onPress={() => setShowDiscount(!showDiscount)} activeOpacity={0.7}>
                <Icon.Percent />
                <Text style={S.addLinkText}>{showDiscount ? "Hide discount" : "Add discount"}</Text>
              </TouchableOpacity>
              {showDiscount && (
                <View style={{ gap: SP._12, paddingBottom: SP._4 }}>
                  <Text style={S.discountSectionLabel}>GOVERNMENT DISCOUNT</Text>
                  <View style={{ flexDirection: "row", gap: SP._10 }}>
                    {(["PWD", "SENIOR"] as const).map((type) => {
                      const preset20 = Number.parseFloat((sub * 0.20).toFixed(2));
                      return (
                        <TouchableOpacity
                          key={type}
                          style={S.discountPresetBtn}
                          onPress={() => { setDiscount(preset20, type, type); setShowDiscount(false); setDiscountInput(""); setDiscountCodeInput(""); }}
                          activeOpacity={0.8}
                        >
                          <Text style={S.discountPresetLabel}>{type === "PWD" ? "PWD" : "Senior"}</Text>
                          <Text style={S.discountPresetAmt}>-{fp(preset20)}</Text>
                          <Text style={S.discountPresetPct}>20% off</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={S.discountSectionLabel}>PROMO / VOUCHER CODE</Text>
                  <View style={[S.discountInputRow, { marginBottom: 0 }]}>
                    <TextInput
                      style={[S.discountInput, { flex: 1 }]}
                      placeholder="Enter code"
                      value={discountCodeInput}
                      onChangeText={setDiscountCodeInput}
                      autoCapitalize="characters"
                      placeholderTextColor={C.gray400}
                    />
                    <TouchableOpacity
                      style={[S.discountApplyBtn, { marginLeft: SP._8, minWidth: 84, opacity: voucherValidating ? 0.6 : 1 }]}
                      onPress={() => {
                        if (!discountCodeInput.trim()) return;
                        setVoucherValidating(true);
                        try { push({ type: "error", title: "Not available", message: "Voucher validation is not supported yet." }); }
                        finally { setVoucherValidating(false); }
                      }}
                      disabled={voucherValidating || !discountCodeInput.trim()}
                      activeOpacity={0.8}
                    >
                      <Text style={S.discountApplyText}>{voucherValidating ? "..." : "Validate"}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={S.discountSectionLabel}>CUSTOM AMOUNT (₱)</Text>
                  <View style={[S.discountInputRow, { marginBottom: 0 }]}>
                    <TextInput
                      style={[S.discountInput, { flex: 1 }]}
                      placeholder="0.00"
                      value={discountInput}
                      onChangeText={(v) => setDiscountInput(v.replace(/[^\d.]/g, ""))}
                      keyboardType="decimal-pad"
                      placeholderTextColor={C.gray400}
                    />
                    <TouchableOpacity
                      style={[S.discountApplyBtn, { marginLeft: SP._8, minWidth: 84, opacity: discountInput ? 1 : 0.45 }]}
                      onPress={handleApplyDiscount}
                      disabled={!discountInput}
                      activeOpacity={0.8}
                    >
                      <Text style={S.discountApplyText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => { setShowDiscount(false); setDiscountInput(""); setDiscountCodeInput(""); }} style={{ alignSelf: "center", paddingVertical: SP._4 }}>
                    <Text style={{ fontSize: 13, color: P.muted, fontWeight: "600" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : null}

          {/* Custom Charge */}
          <TouchableOpacity style={S.addLink} onPress={() => { setShowCustomCharge(!showCustomCharge); setChargePreset(""); setChargeCustomName(""); setChargeAmountInput(""); }} activeOpacity={0.7}>
            <Icon.Plus c={P.warning} />
            <Text style={[S.addLinkText, { color: P.warning }]}>{showCustomCharge ? "Cancel charge" : "Add custom charge"}</Text>
          </TouchableOpacity>
          {showCustomCharge && (
            <View style={{ gap: SP._10, paddingBottom: SP._4 }}>
              <View style={S.chargeGrid}>
                {["Delivery Fee", "Rush Fee", "Extra Detergent", "Plastic Bag", "Damage Fee", "Other"].map((p) => {
                  const active = chargePreset === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[S.chargeGridBtn, active && S.chargeGridBtnActive]}
                      onPress={() => { setChargePreset(p); if (p !== "Other") setChargeCustomName(""); }}
                      activeOpacity={0.75}
                    >
                      {active && <View style={S.chargeGridCheck}><Icon.Check c={P.white} s={12} /></View>}
                      <Text style={[S.chargeGridText, active && S.chargeGridTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={[S.chargeAmountRow, chargePreset ? S.chargeAmountRowActive : undefined]}>
                <Text style={[S.chargeAmountCurrency, chargePreset ? { color: P.warning } : undefined]}>₱</Text>
                <TextInput
                  style={S.chargeAmountInput}
                  placeholder="0.00"
                  value={chargeAmountInput}
                  onChangeText={(v) => setChargeAmountInput(v.replace(/[^\d.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={C.gray300}
                  editable={!!chargePreset}
                />
              </View>
              {chargePreset === "Other" && (
                <TextInput
                  style={S.discountInput}
                  placeholder="Charge name"
                  value={chargeCustomName}
                  onChangeText={setChargeCustomName}
                  placeholderTextColor={C.gray400}
                />
              )}
              <View style={{ flexDirection: "row", gap: SP._8 }}>
                <TouchableOpacity
                  style={[S.discountApplyBtn, { backgroundColor: P.warning, opacity: (chargePreset && chargeAmountInput && (chargePreset !== "Other" || chargeCustomName)) ? 1 : 0.35 }]}
                  onPress={() => {
                    const name = chargePreset === "Other" ? chargeCustomName.trim() : chargePreset;
                    const amount = Number.parseFloat(chargeAmountInput);
                    if (!name) { showAlert("Name required", "Select a charge type."); return; }
                    if (Number.isNaN(amount) || amount <= 0) { showAlert("Invalid amount", "Enter a valid charge amount."); return; }
                    addCustomCharge(name, amount);
                    setShowCustomCharge(false);
                    setChargePreset(""); setChargeCustomName(""); setChargeAmountInput("");
                  }}
                  disabled={!chargePreset || !chargeAmountInput}
                  activeOpacity={0.8}
                >
                  <Text style={S.discountApplyText}>Add Charge</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={S.discountCancelBtn}
                  onPress={() => { setShowCustomCharge(false); setChargePreset(""); setChargeCustomName(""); setChargeAmountInput(""); }}
                  activeOpacity={0.8}
                >
                  <Text style={S.discountCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={S.notesInlineWrap}>
            <Icon.Note />
            <TextInput
              style={S.notesInlineInput}
              placeholder="Special notes..."
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholderTextColor={C.gray400}
              maxLength={300}
            />
            {notes.length > 0 && (
              <TouchableOpacity onPress={() => setNotes("")} hitSlop={8}>
                <Icon.X s={12} />
              </TouchableOpacity>
            )}
          </View>

          {/* Totals */}
          <View style={S.totalsBlock}>
            <View style={S.totalRow}>
              <Text style={S.totalRowLabel}>Subtotal</Text>
              <Text style={S.totalRowValue}>{fp(sub)}</Text>
            </View>
            {discountAmount > 0 && (
              <View style={S.totalRow}>
                <Text style={[S.totalRowLabel, { color: C.accent700 }]}>Discount</Text>
                <Text style={[S.totalRowValue, { color: C.accent700 }]}>-{fp(discountAmount)}</Text>
              </View>
            )}
            <View style={[S.totalRow, { marginTop: SP._8 }]}>
              <Text style={S.grandLabel}>Total</Text>
              <Text style={S.grandValue}>{fp(total)}</Text>
            </View>
          </View>
        </View>

        {/* Fulfillment */}
        <View style={[S.reviewPaySection, { paddingBottom: SP._12 }]}>
          <Text style={[S.sectionMeta, { marginBottom: SP._10 }]}>FULFILLMENT</Text>
          <View style={{ flexDirection: "row", gap: SP._8 }}>
            {(["PICKUP", "DELIVERY"] as const).map((ft) => (
              <TouchableOpacity
                key={ft}
                style={[S.payGridBtn, { flex: 1 }, fulfillmentType === ft && S.payGridBtnActive]}
                onPress={() => setFulfillmentType(ft)}
                activeOpacity={0.75}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6 }}>
                  {ft === "PICKUP"
                    ? <Ionicons name="bag-handle-outline" size={16} color={fulfillmentType === ft ? P.blue : P.muted} />
                    : <MaterialCommunityIcons name="truck-delivery-outline" size={16} color={fulfillmentType === ft ? P.blue : P.muted} />}
                  <Text style={[S.payGridBtnText, fulfillmentType === ft && S.payGridBtnTextActive]}>
                    {ft === "PICKUP" ? "Pick-up" : "Delivery"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Payment timing */}
        <View style={[S.reviewPaySection, { paddingBottom: SP._12 }]}>
          <Text style={[S.sectionMeta, { marginBottom: SP._10 }]}>PAYMENT TIMING</Text>
          <View style={{ flexDirection: "row", gap: SP._8 }}>
            <TouchableOpacity
              style={[S.payGridBtn, { flex: 1 }, paymentTiming === "now" && S.payGridBtnActive]}
              onPress={() => setPaymentTiming("now")}
              activeOpacity={0.75}
            >
              <Text style={[S.payGridBtnText, paymentTiming === "now" && S.payGridBtnTextActive]}>Pay Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.payGridBtn, { flex: 1 }, paymentTiming === "later" && S.payGridBtnActive]}
              onPress={() => { setPaymentTiming("later"); clearSplits(); setShowSplitPanel(false); }}
              activeOpacity={0.75}
            >
              <Text style={[S.payGridBtnText, paymentTiming === "later" && S.payGridBtnTextActive]}>Pay Later</Text>
            </TouchableOpacity>
          </View>
          {paymentTiming === "later" && (
            <Text style={{ fontSize: 11, color: C.warning600, fontWeight: "600", marginTop: SP._8 }}>
              Order will be created as Unpaid — collect at pickup or delivery.
            </Text>
          )}
        </View>

        {/* Payment */}
        {paymentTiming === "now" && (
        <View style={S.reviewPaySection}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SP._12 }}>
            <Text style={S.sectionMeta}>PAYMENT METHOD</Text>
            <TouchableOpacity
              style={[S.splitToggle, showSplitPanel && S.splitToggleActive]}
              onPress={() => { setShowSplitPanel(!showSplitPanel); clearSplits(); setSplitInputs({}); setSplitRefs({}); }}
              activeOpacity={0.75}
            >
              <Text style={[S.splitToggleText, showSplitPanel && S.splitToggleTextActive]}>
                {showSplitPanel ? "✓ Split" : "Split Pay"}
              </Text>
            </TouchableOpacity>
          </View>

          {!showSplitPanel ? (
            <>
              {/* 2-column payment method grid */}
              <View style={S.payGrid}>
                <View style={S.payGridRow}>
                  {(["CASH", "GCASH"] as POSPaymentMethod[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[S.payGridBtn, paymentMethod === m && S.payGridBtnActive]}
                      onPress={() => setPaymentMethod(m)}
                      activeOpacity={0.75}
                    >
                      <Text style={[S.payGridBtnText, paymentMethod === m && S.payGridBtnTextActive]}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={S.payGridRow}>
                  {(["MAYA", "CARD"] as POSPaymentMethod[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[S.payGridBtn, paymentMethod === m && S.payGridBtnActive]}
                      onPress={() => setPaymentMethod(m)}
                      activeOpacity={0.75}
                    >
                      <Text style={[S.payGridBtnText, paymentMethod === m && S.payGridBtnTextActive]}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={S.payGridRow}>
                  {(["QPH", "BANK_TRANSFER"] as POSPaymentMethod[]).map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[S.payGridBtn, paymentMethod === m && S.payGridBtnActive]}
                      onPress={() => setPaymentMethod(m)}
                      activeOpacity={0.75}
                    >
                      <Text style={[S.payGridBtnText, paymentMethod === m && S.payGridBtnTextActive]}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {paymentMethod === "CASH" && (
                <View style={{ marginTop: SP._12, gap: SP._8 }}>
                  {/* Live amount display */}
                  <View style={{ backgroundColor: P.blueTint, borderRadius: 14, borderWidth: 2, borderColor: P.blueLight, paddingHorizontal: SP._16, paddingVertical: SP._12 }}>
                    <Text style={{ fontSize: 11, color: P.blue, fontWeight: "600" }}>Cash Received</Text>
                    <Text style={{ fontSize: 30, fontWeight: "800", color: P.blue }}>
                      {keypadInput ? fp(Number.parseFloat(keypadInput) || 0) : "₱0.00"}
                    </Text>
                    {Number.parseFloat(keypadInput) >= total && total > 0 && (
                      <Text style={{ fontSize: 13, color: P.success, fontWeight: "600", marginTop: SP._4 }}>
                        Change: {fp((Number.parseFloat(keypadInput) || 0) - total)}
                      </Text>
                    )}
                  </View>
                  {/* Quick amounts */}
                  <View style={{ flexDirection: "row", gap: SP._8 }}>
                    {([{ label: "Exact", val: String(total) }, { label: "₱500", val: "500" }, { label: "₱1,000", val: "1000" }] as { label: string; val: string }[]).map((q) => (
                      <TouchableOpacity
                        key={q.label}
                        style={[S.catChip, { flex: 1, justifyContent: "center", paddingVertical: SP._10 }]}
                        onPress={() => { setKeypadInput(q.val); setAmountReceived(Number.parseFloat(q.val) || 0); }}
                        activeOpacity={0.75}
                      >
                        <Text style={S.catChipText}>{q.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Inline number pad */}
                  {([ ["1","2","3"], ["4","5","6"], ["7","8","9"], ["00","0","⌫"] ] as string[][]).map((row) => (
                    <View key={row.join("")} style={{ flexDirection: "row", gap: SP._8, marginBottom: SP._4 }}>
                      {row.map((k) => (
                        <TouchableOpacity
                          key={k}
                          style={S.keypadBtn}
                          onPress={() => {
                            setKeypadInput((p) => {
                              let next: string;
                              if (k === "⌫") next = p.slice(0, -1);
                              else if (p === "0" && k !== ".") next = k;
                              else if (p.length >= 8) next = p;
                              else next = p + k;
                              setAmountReceived(Number.parseFloat(next) || 0);
                              return next;
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={S.keypadBtnText}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              )}
              {(paymentMethod === "GCASH" || paymentMethod === "MAYA") && (
                <View style={{ marginTop: SP._10, gap: SP._6 }}>
                  <Text style={{ fontSize: 11, color: P.muted, fontWeight: "600" }}>
                    {paymentMethod === "GCASH" ? "GCash" : "Maya"} Reference Number
                  </Text>
                  <TextInput
                    style={S.cashInput}
                    placeholder="Enter reference number (optional)"
                    value={paymentMethod === "GCASH" ? gcashRef : mayaRef}
                    onChangeText={paymentMethod === "GCASH" ? setGcashRef : setMayaRef}
                    autoCapitalize="characters"
                    placeholderTextColor={C.gray400}
                  />
                  <Text style={{ fontSize: 11, color: P.muted }}>
                    Leave blank to show QR after creating order.
                  </Text>
                </View>
              )}
              {paymentMethod === "CARD" && (
                <View style={{ marginTop: SP._10, gap: SP._6 }}>
                  <Text style={{ fontSize: 11, color: P.muted, fontWeight: "600" }}>Card Reference / Approval Code</Text>
                  <TextInput
                    style={S.cashInput}
                    placeholder="Enter reference number"
                    value={cardRef}
                    onChangeText={setCardRef}
                    autoCapitalize="characters"
                    placeholderTextColor={C.gray400}
                  />
                </View>
              )}
              {paymentMethod === "QPH" && (
                <View style={{ marginTop: SP._10, gap: SP._6 }}>
                  <Text style={{ fontSize: 11, color: P.muted, fontWeight: "600" }}>QPH Reference Number</Text>
                  <TextInput
                    style={S.cashInput}
                    placeholder="Enter reference number"
                    value={qphRef}
                    onChangeText={setQphRef}
                    autoCapitalize="characters"
                    placeholderTextColor={C.gray400}
                  />
                </View>
              )}
              {paymentMethod === "BANK_TRANSFER" && (
                <View style={{ marginTop: SP._10, gap: SP._6 }}>
                  <Text style={{ fontSize: 11, color: P.muted, fontWeight: "600" }}>Bank Transfer Reference</Text>
                  <TextInput
                    style={S.cashInput}
                    placeholder="Enter transaction reference"
                    value={bankRef}
                    onChangeText={setBankRef}
                    autoCapitalize="characters"
                    placeholderTextColor={C.gray400}
                  />
                </View>
              )}
            </>
          ) : (
            /* Split payment — inline per-method inputs */
            <View style={{ gap: SP._10 }}>
              {/* Running totals */}
              <View style={{ backgroundColor: P.bg, borderRadius: 14, padding: SP._12, gap: SP._6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: P.muted, fontWeight: "600" }}>Total Due</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: P.text }}>{fp(total)}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: P.blue, fontWeight: "600" }}>Covered</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: P.blue }}>{fp(splitTotal())}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, color: splitTotal() >= total ? P.success : P.errorRed, fontWeight: "600" }}>Remaining</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: splitTotal() >= total ? P.success : P.errorRed }}>
                    {fp(Math.max(0, total - splitTotal()))}
                  </Text>
                </View>
              </View>
              {/* Per-method inputs */}
              {(["CASH", "GCASH", "MAYA", "CARD", "QPH", "BANK_TRANSFER"] as POSPaymentMethod[]).map((m) => {
                const existing = splits.find((s) => s.method === m);
                const inputVal = splitInputs[m] ?? (existing ? String(existing.amount) : "");
                const refVal   = splitRefs[m] ?? (existing?.reference ?? "");
                const needsRef = m !== "CASH";
                return (
                  <View key={m} style={{ marginBottom: SP._4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10 }}>
                      <Text style={{ width: 104, fontSize: 13, fontWeight: "600", color: existing ? P.blue : P.muted }}>
                        {PAYMENT_METHOD_LABELS[m]} (₱)
                      </Text>
                      <TextInput
                        style={[S.cashInput, { flex: 1, marginBottom: 0 }]}
                        placeholder="0.00"
                        value={inputVal}
                        onChangeText={(v) => setSplitInputs((p) => ({ ...p, [m]: v.replace(/[^\d.]/g, "") }))}
                        onBlur={() => {
                          const amt = Number.parseFloat(splitInputs[m] ?? "");
                          if (!Number.isNaN(amt) && amt > 0) {
                            setSplit(m, amt, splitRefs[m] || undefined);
                          } else {
                            removeSplit(m);
                            setSplitInputs((p) => { const n = { ...p }; delete n[m]; return n; });
                            setSplitRefs((p)   => { const n = { ...p }; delete n[m]; return n; });
                          }
                        }}
                        keyboardType="decimal-pad"
                        placeholderTextColor={C.gray400}
                      />
                      {existing ? (
                        <TouchableOpacity
                          onPress={() => {
                            removeSplit(m);
                            setSplitInputs((p) => { const n = { ...p }; delete n[m]; return n; });
                            setSplitRefs((p)   => { const n = { ...p }; delete n[m]; return n; });
                          }}
                          hitSlop={8}
                        >
                          <Icon.X s={16} c={P.errorRed} />
                        </TouchableOpacity>
                      ) : splitTotal() > 0 && splitTotal() < total ? (
                        <TouchableOpacity
                          style={{ backgroundColor: P.blueTint, borderRadius: 8, paddingHorizontal: SP._8, paddingVertical: 4 }}
                          onPress={() => {
                            const rem = parseFloat((total - splitTotal()).toFixed(2));
                            setSplitInputs((p) => ({ ...p, [m]: String(rem) }));
                            setSplit(m, rem, splitRefs[m] || undefined);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={{ fontSize: 11, color: P.blue, fontWeight: "700" }}>+₱{(total - splitTotal()).toFixed(2)}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {needsRef && existing && (
                      <TextInput
                        style={[S.cashInput, { marginTop: SP._6, marginLeft: 114, marginBottom: 0 }]}
                        placeholder="Reference / transaction no."
                        value={refVal}
                        onChangeText={(v) => {
                          setSplitRefs((p) => ({ ...p, [m]: v }));
                          setSplit(m, existing.amount, v || undefined);
                        }}
                        autoCapitalize="characters"
                        placeholderTextColor={C.gray400}
                      />
                    )}
                  </View>
                );
              })}
              {change > 0 && (
                <View style={[S.changeBox, { marginTop: SP._4 }]}>
                  <Text style={S.changeLabel}>Cash Change</Text>
                  <Text style={S.changeValue}>{fp(change)}</Text>
                </View>
              )}
            </View>
          )}
        </View>
        )}
      </ScrollView>

      {/* Split-pay suggestion when cash is short but partially entered */}
      {paymentTiming === "now" && paymentMethod === "CASH" && amountReceived > 0 && amountReceived < total && !showSplitPanel && (
        <View style={{ backgroundColor: "#FEF3C7", paddingVertical: SP._8, paddingHorizontal: SP._16, flexDirection: "row", alignItems: "center", gap: SP._8 }}>
          <Text style={{ fontSize: 12, color: "#92400E", flex: 1 }}>
            Cash short ₱{shortAmt.toFixed(2)} — cover the rest with another method?
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowSplitPanel(true);
              setSplitInputs({ CASH: String(amountReceived) });
              setSplit("CASH", amountReceived);
            }}
            style={{ backgroundColor: "#D97706", borderRadius: 8, paddingHorizontal: SP._10, paddingVertical: 4 }}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Split Pay</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Create Order footer */}
      {queued && (
        <View style={{ backgroundColor: "#D1FAE5", paddingVertical: 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="checkmark" size={14} color="#065F46" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#065F46" }}>Saved offline</Text>
          <Text style={{ fontSize: 12, color: "#047857", flex: 1 }}>Order queued — will upload when internet returns</Text>
        </View>
      )}
      <View style={[S.reviewFooter, { paddingBottom: Math.max(insets.bottom, SP._16) }]}>
        <TouchableOpacity
          style={[
            S.cta,
            (orderBlockReason || createdOrder) ? S.ctaError : S.ctaActive,
            isSubmitting && { opacity: 0.7 },
          ]}
          onPress={() => {
            if (deliveryMissingCustomer) {
              setShowCustomer(true);
              return;
            }
            setShowReview(false);
            setShowSummary(true);
          }}
          disabled={isSubmitting || !canCreateOrder || (!!orderBlockReason && !deliveryMissingCustomer) || !!createdOrder}
          activeOpacity={0.87}
        >
          {isSubmitting ? (
            <ActivityIndicator color={P.white} />
          ) : (
            <View style={S.ctaInner}>
              <Text style={[S.ctaLabel, (orderBlockReason || createdOrder) && S.ctaLabelError]}>
                {orderBlockReason ?? orderActionLabel}
              </Text>
              {!orderBlockReason && (
                <View style={S.ctaPill}>
                  <Text style={S.ctaPillText}>{fp(total)}</Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const customerPhoneSuffix = walkinCustomer.phone ? "  ·  " + walkinCustomer.phone : "";

  return (
    <>
      {/* Android: undefined so native adjustResize handles the keyboard; "height"
          double-resizes and flickers the bottom CTA (e.g. "Add customer name or phone"). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={isLandscape ? S.landscapeRow : { flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={S.landscapeLeft}
          contentContainerStyle={S.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Customer — compact row; full details live in the Add Customer drawer.
              A walk-in paid sale needs no customer; add one only for a claim ticket. */}
          <View style={S.custRow}>
            <Icon.User c={P.muted} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
              <Text style={S.custLabel}>CUSTOMER</Text>
              <Text style={S.custValue} numberOfLines={1}>
                {(walkinCustomer.name ?? "").trim()
                  ? `${walkinCustomer.name}${customerPhoneSuffix}`
                  : "Walk-in Customer"}
              </Text>
            </View>
            <TouchableOpacity style={S.custBtn} onPress={() => setShowCustomer(true)} activeOpacity={0.8}>
              <Text style={S.custBtnText}>{(walkinCustomer.name ?? "").trim() ? "Edit" : "+ Add Customer"}</Text>
            </TouchableOpacity>
          </View>

          {/* Services section */}
          <View style={S.openSection}>
            {/* Services / Products tab switcher */}
            <View style={S.serviceTypeTabRow}>
              {(["service", "product"] as const).map((t) => {
                const label = t === "service" ? "Services" : "Products";
                const count = t === "product" ? branchProducts.length : branchServices.length;
                const isActive = serviceTypeTab === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[S.serviceTypeTab, isActive && S.serviceTypeTabActive]}
                    onPress={() => {
                      setServiceTypeTab(t);
                      setFilterCat("All");
                      setSearchQuery("");
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[S.serviceTypeTabText, isActive && S.serviceTypeTabTextActive]}>
                      {label}
                    </Text>
                    {count > 0 && (
                      <View style={[S.serviceTypeTabBadge, isActive && S.serviceTypeTabBadgeActive]}>
                        <Text style={[S.serviceTypeTabBadgeText, isActive && S.serviceTypeTabBadgeTextActive]}>
                          {count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={S.searchZoomRow}>
              <View style={[S.searchRow, { flex: 1, marginBottom: 0 }]}>
                <Icon.Search />
                <TextInput
                  style={S.searchInput}
                  placeholder={serviceTypeTab === "product" ? "Search products..." : "Search services..."}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholderTextColor={C.gray400}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                    <Icon.X s={13} />
                  </TouchableOpacity>
                )}
              </View>
              {/* Zoom moved inline to save a full row */}
              <View style={S.zoomInline}>
                <TouchableOpacity style={[S.zoomBtn, !canZoomOut && S.zoomBtnDisabled]} onPress={zoomOut} disabled={!canZoomOut} hitSlop={6} accessibilityLabel="Smaller tiles">
                  <Text style={S.zoomBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[S.zoomBtn, !canZoomIn && S.zoomBtnDisabled]} onPress={zoomIn} disabled={!canZoomIn} hitSlop={6} accessibilityLabel="Larger tiles">
                  <Text style={S.zoomBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {serviceCategories.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chipRow}>
                {serviceCategories.map((cat) => {
                  const isActive = filterCat === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[S.catChip, isActive && S.catChipOn]}
                      onPress={() => setFilterCat(cat)}
                      activeOpacity={0.75}
                    >
                      <Text style={[S.catChipText, isActive && S.catChipTextOn]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {filteredServices.length === 0 ? (
              <View style={S.tileEmpty}>
                {noServicesEmptyView}
              </View>
            ) : (
              <View style={S.tileGrid}>
                {filteredServices.map((svc) => (
                  <ServiceTile
                    key={svc.id}
                    svc={svc}
                    selected={inCart(svc.id)}
                    cartItem={items.find((i) => i.serviceId === svc.id)}
                    onTap={handleTapTile}
                    onRemove={removeItem}
                    onUpdate={updateItem}
                    widthPct={tileWidthPct}
                    fullWidth={gridCols === 1}
                  />
                ))}
              </View>
            )}
          </View>

        </ScrollView>

        {/* ── Landscape: persistent "Current Sale" cart panel ── */}
        {isLandscape && (
          <View style={S.cartPanel}>
            <View style={S.cartPanelHeader}>
              <Text style={S.cartPanelTitle}>Current Sale</Text>
            </View>
            {items.length === 0 ? (
              <View style={S.cartPanelEmpty}>
                <Text style={S.cartBarEmpty}>Select a service to start an order</Text>
              </View>
            ) : (
              renderOrderCart({ flex: 1 })
            )}
          </View>
        )}
        </View>

        {/* ── Portrait: sticky cart summary bar ── */}
        {!isLandscape && (
          <View style={[S.cartBar, { paddingBottom: Math.max(insets.bottom, SP._12) }]}>
            {items.length === 0 ? (
              <Text style={S.cartBarEmpty}>Select a service to start an order</Text>
            ) : (
              <TouchableOpacity
                style={S.cartBarActive}
                onPress={() => setShowReview(true)}
                activeOpacity={0.88}
              >
                <View style={S.cartBarInfo}>
                  <Text style={S.cartBarCount}>
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </Text>
                  <Text style={S.cartBarTotal}>{fp(total)}</Text>
                </View>
                <View style={S.cartBarBtn}>
                  <Text style={S.cartBarBtnText}>Review Order →</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Review Order bottom sheet (portrait only — landscape uses the side panel) ── */}
      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={showReview && !isLandscape}
        animationType="none"
        transparent
        statusBarTranslucent
        onRequestClose={handleCloseReview}
      >
        <View style={S.reviewBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} onPress={handleCloseReview} activeOpacity={1} />
          <Animated.View
            style={[
              S.reviewSheet,
              {
                position: "absolute", left: 0, right: 0, bottom: 0,
                height: SHEET_H,
                paddingBottom: Math.max(insets.bottom, SP._16),
                transform: [{ translateY: reviewSheetY }],
              },
            ]}
          >
            {/* Draggable handle + header — pan responder lives here */}
            <View {...reviewPan.panHandlers}>
              <View style={S.reviewHandle} />
              <View style={S.reviewSheetHeader}>
                <Text style={S.reviewSheetTitle}>Review Order</Text>
                <TouchableOpacity onPress={handleCloseReview} hitSlop={8}>
                  <Icon.X c={P.muted} s={18} />
                </TouchableOpacity>
              </View>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
              {renderOrderCart({ maxHeight: SHEET_H - 80 })}
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>

      <POSSummaryModal
        visible={showSummary}
        onClose={() => setShowSummary(false)}
        onConfirm={() => { setShowSummary(false); void doSubmit(); }}
        isSubmitting={isSubmitting}
        walkinCustomer={walkinCustomer}
        items={items}
        notes={notes}
        paymentMethod={paymentMethod}
        paymentTiming={paymentTiming}
        fulfillmentType={fulfillmentType}
        amountReceived={amountReceived}
        subtotal={sub}
        discountAmount={discountAmount}
        discountCode={discountCode}
        discountType={discountType}
        total={total}
        splits={splits}
      />

      <GCashQRModal
        visible={showGCashModal}
        gcashQrUrl={effectiveGcashQrUrl}
        totalAmount={total}
        onConfirmReceived={handleGCashConfirmed}
        onCancel={() => setShowGCashModal(false)}
      />

      <ClaimTicket
        visible={!!createdOrder}
        order={createdOrder}
        orderFull={createdOrderFull}
        cashierName={activeStaff?.name}
        onClose={resetTicketState}
        onNewOrder={resetTicketState}
        onBackToQueue={() => {
          resetTicketState();
          onGoToQueue?.();
        }}
      />

      <AddCustomerDrawer
        visible={showCustomer}
        initial={walkinCustomer}
        onClose={() => setShowCustomer(false)}
        onSave={(c) => setWalkinCustomer(c)}
        recentOrders={useQueueStore.getState().orders}
        isDelivery={fulfillmentType === "DELIVERY"}
      />
    </>
  );
}
