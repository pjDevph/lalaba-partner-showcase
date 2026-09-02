// Services screen model — types, constants, and pure/async helper logic.
// Extracted from services.tsx (no JSX; view-agnostic).
import type React from "react";
import { errField } from "../../utils/userError";
import { C } from "../../theme/tokens";
import { showAlert } from "../../lib/dialog";
import { useNotificationStore } from "../../stores/notificationStore";
import { ActivityLog, type LogActor } from "../../utils/logActivity";
import {
  gqlMyServices, gqlCreateService, gqlUpdateService, gqlArchiveService, gqlRestoreService,
  toPricingType, fromPricingType, toServiceCategory, fromServiceCategory, type GqlService,
} from "../../services/graphql/laundryServices";
import { gqlMyInventory } from "../../services/graphql/inventory";

export const CATEGORIES = [
  "Wash & Fold", "Wash & Iron", "Wash Only",
  "Dry Clean", "Iron Only", "Express",
  "Delicate", "Bedding", "Curtains", "Shoes", "Bags", "Other",
] as const;

export type InventoryUsageUnit = "ml" | "g" | "pieces" | "sachet" | "L" | "kg" | "pack" | "box" | "scoop";
export type InventoryUsagePer  = "order" | "kg" | "load" | "pc";

export interface InventoryUsageItem {
  inventoryItemId: string;
  productName?: string;
  quantity: number;
  unit: InventoryUsageUnit;
  per: InventoryUsagePer;
}

export interface InvProduct { id: string; name: string; unit: string; }

// Only weight (g/kg) and volume (ml/L) have a fixed conversion ratio — count
// units (pieces, pack, sachet, box, scoop) have no universal ratio between
// them, so they're not offered as alternates.
export const WEIGHT_TO_G: Partial<Record<InventoryUsageUnit, number>> = { g: 1, kg: 1000 };
export const VOLUME_TO_ML: Partial<Record<InventoryUsageUnit, number>> = { ml: 1, L: 1000 };

export function compatibleUnits(baseUnit?: string): InventoryUsageUnit[] {
  if (!baseUnit) return [];
  if (baseUnit in WEIGHT_TO_G) return ["g", "kg"];
  if (baseUnit in VOLUME_TO_ML) return ["ml", "L"];
  return [baseUnit as InventoryUsageUnit];
}

export function convertUsageQuantity(
  qty: number,
  from: InventoryUsageUnit,
  to: InventoryUsageUnit,
): number | null {
  if (from === to) return qty;
  if (WEIGHT_TO_G[from] && WEIGHT_TO_G[to]) return (qty * WEIGHT_TO_G[from]!) / WEIGHT_TO_G[to]!;
  if (VOLUME_TO_ML[from] && VOLUME_TO_ML[to]) return (qty * VOLUME_TO_ML[from]!) / VOLUME_TO_ML[to]!;
  return null;
}

export interface Service {
  id: string;
  name: string;
  price: number;
  cost: number;
  unit: string;
  category: string;
  type: "service" | "product";
  inventoryUsage: InventoryUsageItem[];
  isActive: boolean;
  isOnline: boolean;
  isArchived: boolean;
  isFeatured: boolean;
  estimatedMinutes: number;
  baseKilos?: number;
  excessRate?: number;
  note?: string;
  archivedAt?: Date | null;
  hardDeleteAt?: Date | null;
  merchantId?: string;
  branchId?: string | null;
  createdAt?: any;
  updatedAt?: any;
}

export type FormData = Omit<Service, "id" | "createdAt" | "updatedAt" | "archivedAt" | "hardDeleteAt" | "merchantId">;

export const EMPTY_FORM: FormData = {
  name: "",
  price: 0,
  cost: 0,
  unit: "per kg",
  category: "Wash & Fold",
  type: "service",
  inventoryUsage: [],
  isActive: true,
  isOnline: true,
  isArchived: false,
  isFeatured: false,
  estimatedMinutes: 0,
  baseKilos: undefined,
  excessRate: undefined,
  note: "",
};

// ─── Numeric input sanitizers ──────────────────────────────────────────────────
// Strip anything that isn't a valid number so users can never type letters/symbols
// into a numeric field (keyboardType alone doesn't block hardware keyboards/paste).
export function sanitizeInt(v: string): string {
  return v.replace(/\D/g, "");
}
export function sanitizeDecimal(v: string): string {
  const s = v.replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s;
  // keep only the first dot
  return s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
}

// ─── Amount bounds ─────────────────────────────────────────────────────────────
// Guards against fat-finger / paste garbage (e.g. a stray digit turning ₱120 into
// a 20-digit number) producing an unusable price on the service.
export const MAX_AMOUNT = 999_999.99;
export function amountError(v: number | undefined, label: string): string | undefined {
  if (v !== undefined && v > MAX_AMOUNT) {
    return `${label} can't exceed ₱${MAX_AMOUNT.toLocaleString()}.`;
  }
  return undefined;
}

// ─── Filter helpers ────────────────────────────────────────────────────────────

export type StatusFilter = "active" | "inactive" | "archived";

export type CategoryFilter = "All" | (typeof CATEGORIES)[number];

export function filterVisible(
  services: Service[],
  statusFilter: StatusFilter,
  categoryFilter: CategoryFilter,
  searchQ: string,
): Service[] {
  return services
    .filter((s) => {
      if (statusFilter === "archived")  return s.isArchived === true;
      if (statusFilter === "inactive")  return s.isArchived === false && s.isActive === false;
      return s.isArchived === false && s.isActive === true;
    })
    .filter((s) => categoryFilter === "All" || s.category === categoryFilter)
    .filter((s) => searchQ.length === 0 || s.name.toLowerCase().includes(searchQ))
    .sort((a, b) => {
      if (statusFilter !== "active") return 0;
      if (a.isFeatured && !b.isFeatured) return -1;
      if (!a.isFeatured && b.isFeatured) return 1;
      return 0;
    });
}

export function groupByCategory(svcs: Service[]): Record<string, Service[]> {
  const groups: Record<string, Service[]> = {};
  svcs.forEach((s) => {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  });
  return groups;
}

export function mapGqlService(d: GqlService): Service {
  return {
    id:               d._id,
    name:             d.serviceName      ?? "",
    price:            Number(d.price     ?? 0),
    cost:             Number(d.suppliesCost ?? 0),
    unit:             fromPricingType(d.pricingType  ?? "per_kilo"),
    category:         fromServiceCategory(d.category ?? "other"),
    type:             "service",
    inventoryUsage:   (d.defaultProducts ?? []).map((dp) => ({
      inventoryItemId: dp.inventoryId,
      productName:     dp.productName,
      quantity:        dp.quantity,
      unit:            (dp.unit as InventoryUsageUnit) ?? "g",
      per:             (dp.per as InventoryUsagePer) ?? "order",
    })),
    isActive:         d.isActive         ?? true,
    isOnline:         d.isOnline         ?? true,
    isArchived:       d.isArchived       ?? false,
    isFeatured:       d.isFeatured       ?? false,
    estimatedMinutes: Number(d.estimatedMinutes ?? 0),
    baseKilos:        d.baseKilos        ?? undefined,
    excessRate:       d.excessRate       ?? undefined,
    note:             "",
    archivedAt:       d.archivedAt ? new Date(d.archivedAt) : null,
    hardDeleteAt:     null,
    merchantId:       d.uid,
    branchId:         d.branchId         ?? null,
  };
}

export function duplicateNameError(name: string, existingServices: Service[], editingId: string | null): string | undefined {
  const nameLower = name.trim().toLowerCase();
  if (!nameLower) return undefined;
  const isDuplicate = existingServices.some(
    (s) => s.id !== editingId && !s.isArchived && s.name.trim().toLowerCase() === nameLower
  );
  return isDuplicate ? `Already exists.` : undefined;
}

export function validateServiceForm(form: FormData, existingServices: Service[], editingId: string | null): string | null {
  if (!form.name.trim()) return "Service name is required.";
  if (form.price <= 0) return "Price must be greater than 0.";
  return (
    duplicateNameError(form.name, existingServices, editingId) ??
    amountError(form.price, "Price") ??
    amountError(form.cost, "Supplies cost") ??
    amountError(form.baseKilos, "Base kilos") ??
    amountError(form.excessRate, "Excess rate") ??
    null
  );
}

export async function persistService(
  form: FormData,
  merchantId: string | null,
  ownerActor: LogActor,
  editingId: string | null,
  branchId?: string | null,
): Promise<string> {
  const effectiveBranchId = branchId ?? "";
  const mappedDefaultProducts = form.inventoryUsage
    .filter((u) => u.inventoryItemId)
    .map((u) => ({
      inventoryId:  u.inventoryItemId,
      productName:  u.productName ?? u.inventoryItemId,
      quantity:     u.quantity,
      unit:         u.unit,
      per:          u.per,
    }));

  if (editingId) {
    await gqlUpdateService(editingId, {
      serviceName:      form.name.trim(),
      price:            Number(form.price),
      pricingType:      toPricingType(form.unit),
      baseKilos:        form.baseKilos,
      excessRate:       form.excessRate,
      suppliesCost:     form.cost,
      estimatedMinutes: form.estimatedMinutes,
      category:         toServiceCategory(form.category),
      isActive:         form.isActive,
      isOnline:         form.isOnline,
      isFeatured:       form.isFeatured,
      defaultProducts:  mappedDefaultProducts,
    });
    if (merchantId) {
      await ActivityLog.serviceUpdated(merchantId, ownerActor, editingId, form.name.trim(), {
        price: form.price, isActive: form.isActive,
      });
    }
    return editingId;
  } else {
    const svc = await gqlCreateService({
      serviceName:      form.name.trim(),
      price:            Number(form.price),
      pricingType:      toPricingType(form.unit),
      baseKilos:        form.baseKilos,
      excessRate:       form.excessRate,
      suppliesCost:     form.cost,
      estimatedMinutes: form.estimatedMinutes,
      category:         toServiceCategory(form.category),
      branchId:         effectiveBranchId,
      requiresWeighing: false,
      isOnline:         form.isOnline,
      isFeatured:       form.isFeatured,
      defaultProducts:  mappedDefaultProducts,
    });
    if (merchantId) {
      await ActivityLog.serviceCreated(merchantId, ownerActor, svc._id, form.name.trim());
    }
    return svc._id;
  }
}

export async function unarchiveService(svc: Service, merchantId: string | null, ownerActor: LogActor): Promise<void> {
  await gqlRestoreService(svc.id);
  if (merchantId) await ActivityLog.serviceRestored(merchantId, ownerActor, svc.id, svc.name);
}

export async function fetchAndSetServices(
  merchantId: string | null,
  setServices: (s: Service[]) => void,
  setLoading: (v: boolean) => void,
  opts?: { silent?: boolean },
): Promise<void> {
  if (!merchantId) { if (!opts?.silent) setLoading(false); return; }
  try {
    if (!opts?.silent) setLoading(true);
    const [active, archived] = await Promise.all([
      gqlMyServices({ limit: 100 }),
      gqlMyServices({ isArchived: true, limit: 100 }),
    ]);
    setServices([...active, ...archived].map(mapGqlService).filter((s) => !!s.name?.trim()));
  } catch (err) {
    console.warn("[Services] fetch error:", err);
    setServices([]);
    useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load services." });
  } finally {
    if (!opts?.silent) setLoading(false);
  }
}

export function buildServiceFilter(
  services: Service[],
  statusFilter: StatusFilter,
  categoryFilter: CategoryFilter,
  searchText: string,
): Service[] {
  const searchQ = searchText.trim().toLowerCase();
  return filterVisible(services, statusFilter, categoryFilter, searchQ);
}

export function formatTimeLabel(days: number, hrs: number, mins: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}min`);
  return parts.length ? parts.join(" ") : "0min";
}

export function getMarginColor(m: number | null): string {
  if (m === null) return C.gray500;
  if (m >= 40) return C.success700;
  if (m >= 20) return C.warning700;
  return C.error700;
}

export interface ExecuteSaveOpts {
  form: FormData;
  merchantId: string | null;
  ownerActor: LogActor;
  editingId: string | null;
  fetchServices: () => Promise<void>;
  setModalVisible: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  branchId?: string | null;
}

export async function executeSave(opts: ExecuteSaveOpts): Promise<void> {
  const { form, merchantId, ownerActor, editingId, fetchServices, setModalVisible, setSaving, branchId } = opts;
  try {
    await persistService(form, merchantId, ownerActor, editingId, branchId);
    await fetchServices();
    setModalVisible(false);
    useNotificationStore.getState().push({
      type: "success",
      title: editingId ? "Service updated" : "Service added",
      message: form.name.trim(),
    });
  } catch (err: unknown) {
    useNotificationStore.getState().push({
      type: "error", title: "Save failed", message: errField(err, "message") ?? "Please try again.",
    });
  } finally {
    setSaving(false);
  }
}

// ─── Module-level async action helpers ────────────────────────────────────────

export async function fetchInvProducts(
  currentCount: number,
  setProducts: React.Dispatch<React.SetStateAction<InvProduct[]>>,
  setLoading: (v: boolean) => void,
): Promise<void> {
  if (currentCount > 0) return;
  setLoading(true);
  try {
    const { data: products } = await gqlMyInventory({ limit: 100 });
    setProducts(products.map((p) => ({ id: p._id, name: p.productName, unit: p.inventoryUnit ?? "" })));
  } catch {
    // non-critical; inventory usage section will show empty state
  } finally {
    setLoading(false);
  }
}

export async function toggleServiceFeatured(
  svc: Service,
  setServices: React.Dispatch<React.SetStateAction<Service[]>>,
): Promise<void> {
  const next = !svc.isFeatured;
  setServices((p) => p.map((s) => s.id === svc.id ? { ...s, isFeatured: next } : s));
  try {
    await gqlUpdateService(svc.id, { isFeatured: next });
  } catch {
    setServices((p) => p.map((s) => s.id === svc.id ? { ...s, isFeatured: !next } : s));
  }
}

export async function restoreArchivedService(
  svc: Service,
  merchantId: string | null,
  ownerActor: LogActor,
  setServices: React.Dispatch<React.SetStateAction<Service[]>>,
): Promise<void> {
  try {
    await unarchiveService(svc, merchantId, ownerActor);
    setServices((p) =>
      p.map((s) =>
        s.id === svc.id
          ? { ...s, isArchived: false, isActive: true, archivedAt: null, hardDeleteAt: null }
          : s
      )
    );
    useNotificationStore.getState().push({
      type: "success", title: "Service restored", message: `${svc.name} has been restored.`,
    });
  } catch (err: unknown) {
    useNotificationStore.getState().push({
      type: "error", title: "Could not restore service", message: errField(err, "message") ?? "Try again.",
    });
  }
}

export interface ConfirmArchiveOpts {
  editingId: string;
  serviceName: string;
  setArchiving: (v: boolean) => void;
  setArchiveConfirmVisible: (v: boolean) => void;
  setModalVisible: (v: boolean) => void;
  fetchServices: () => Promise<void>;
}

export async function doConfirmArchive(opts: ConfirmArchiveOpts): Promise<void> {
  const { editingId, serviceName, setArchiving, setArchiveConfirmVisible, setModalVisible, fetchServices } = opts;
  setArchiving(true);
  try {
    await gqlArchiveService(editingId);
    setArchiveConfirmVisible(false);
    setModalVisible(false);
    await fetchServices();
    useNotificationStore.getState().push({
      type: "success",
      title: "Service archived",
      message: serviceName,
    });
  } catch (err: unknown) {
    setArchiveConfirmVisible(false);
    useNotificationStore.getState().push({
      type: "error", title: "Could not archive service", message: errField(err, "message") ?? "Try again.",
    });
  } finally {
    setArchiving(false);
  }
}

export function scopeToBranch(services: Service[], selectedBranchId: string | null, isMerchant: boolean): Service[] {
  if (!selectedBranchId) return services;
  return services.filter((s) =>
    isMerchant ? s.branchId === selectedBranchId : !s.branchId || s.branchId === selectedBranchId
  );
}

export function applyInventoryItemUpdate(f: FormData, idx: number, updated: InventoryUsageItem): FormData {
  return { ...f, inventoryUsage: f.inventoryUsage.map((r, i) => (i === idx ? updated : r)) };
}

export function applyInventoryItemRemove(f: FormData, idx: number): FormData {
  return { ...f, inventoryUsage: f.inventoryUsage.filter((_, i) => i !== idx) };
}

export function serviceCountLabel(count: number): string {
  const plural = count === 1 ? "" : "s";
  return `${count} service${plural}`;
}

export async function doSave(
  merchantId: string,
  form: FormData,
  ownerActor: LogActor,
  editingId: string | null,
  selectedBranchId: string | null,
  fetchServices: () => Promise<void>,
  setModalVisible: (v: boolean) => void,
  setSaving: (v: boolean) => void,
  existingServices: Service[],
): Promise<void> {
  const validationError = validateServiceForm(form, existingServices, editingId);
  if (validationError) { showAlert("Validation", validationError); return; }
  setSaving(true);
  await executeSave({ form, merchantId, ownerActor, editingId, fetchServices, setModalVisible, setSaving, branchId: selectedBranchId });
}

// ─── Module-level pure helpers ────────────────────────────────────────────────

export function calcServiceMargin(svc: Service): number | null {
  if (svc.price <= 0) return null;
  return ((svc.price - svc.cost) / svc.price) * 100;
}

export function formatCurrency(v: number): string {
  return `₱${Number(v).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export function formatActiveSubtitle(count: number): string | undefined {
  if (count === 0) return undefined;
  const plural = count === 1 ? "" : "s";
  return `${count} active service${plural}`;
}

export function buildEmptyConfig(
  isFirstService: boolean,
  openAdd: () => void,
  setStatusFilter: (f: StatusFilter) => void,
): Record<StatusFilter, { title: string; desc: string; cta?: string; ctaAction?: () => void }> {
  const activeCtaAction = isFirstService ? openAdd : () => setStatusFilter("inactive");
  return {
    active: {
      title: isFirstService ? "No services yet" : "No active services",
      desc: isFirstService
        ? "Add your first service so staff can process bookings and POS transactions."
        : "All services are inactive or archived. Switch the filter to view them.",
      cta: isFirstService ? "Create First Service" : "View Inactive",
      ctaAction: activeCtaAction,
    },
    inactive: { title: "No inactive services", desc: "All services are active and visible in POS." },
    archived: { title: "No archived services", desc: "Archived services are hidden from POS but kept for records." },
  };
}

// ─── EmptyServicesBox ─────────────────────────────────────────────────────────

