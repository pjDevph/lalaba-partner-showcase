// src/features/costing/costing.ts
// Business costing engine. Recipe/supply cost comes from Services + Inventory
// (to avoid double-counting chemicals); this module adds operating cost
// (utilities + fixed overhead + itemized additional costs) and produces the
// true cost per service UNIT (kg / load / piece / set / order) — not only kg.
// Operating cost is split across units by REVENUE SHARE.

// Phase 2: Costing feature deferred — flip to true to restore all costing UI
// (sidebar/dashboard/settings entries and the costing screen itself).
// The BE CostingModule in LALABA_BE_DEV/src/app.module.ts must be re-enabled too.
export const COSTING_ENABLED = false;

// ─── Service units ───────────────────────────────────────────────────────────────

export type UnitGroup = "kg" | "load" | "piece" | "set" | "order";
export const UNIT_LABEL: Record<UnitGroup, string> = { kg: "kg", load: "load", piece: "pc", set: "set", order: "order" };

export function unitGroupOf(unit: string): UnitGroup {
  const u = (unit || "").toLowerCase();
  // "kilo" covers the BE PricingType wire values (PER_KILO, PER_KILO_WITH_BASE)
  if (u.includes("kg") || u.includes("kilo")) return "kg";
  if (u.includes("load")) return "load";
  if (u.includes("pc") || u.includes("piece")) return "piece";
  if (u.includes("set")) return "set";
  return "order";
}

// ─── Utility tracking ────────────────────────────────────────────────────────────

export type UtilMethod = "amount" | "bill" | "tank" | "meter";
export const UTIL_METHODS: { value: UtilMethod; label: string }[] = [
  { value: "amount", label: "Manual amount" },
  { value: "bill", label: "Monthly bill" },
  { value: "tank", label: "Per tank / refill" },
  { value: "meter", label: "Meter reading" },
];

export type ReminderFreq = "DAILY" | "WEEKLY" | "MONTHLY";
export type ReminderAssign = "EVERYONE" | "STAFF" | "OWNER";
export interface UtilSchedule {
  reminder: boolean;            // auto-create a Task reminder
  frequency: ReminderFreq;
  assignMode: ReminderAssign;   // who records it
  dueTime: string | null;       // "HH:MM"
  requirePhoto: boolean;        // require a photo (e.g. bill / meter) to complete
}
const DEFAULT_SCHEDULE: UtilSchedule = { reminder: false, frequency: "MONTHLY", assignMode: "OWNER", dueTime: null, requirePhoto: false };

export interface UtilityTracking {
  method: UtilMethod;
  monthlyBill: number;   // for "bill" — spread over fixedDivisor
  tankCost: number;      // for "tank" — × tanks entered today
  rate: number;          // for "meter" — ₱ per unit
  schedule: UtilSchedule;
}
const DEFAULT_UTIL: UtilityTracking = { method: "amount", monthlyBill: 0, tankCost: 0, rate: 0, schedule: { ...DEFAULT_SCHEDULE } };

export interface AdditionalCost {
  id: string;
  name: string;
  amount: number;
  category?: string;
  repeat: "monthly" | "oneoff";   // monthly → ÷ divisor; oneoff → counts on its day
}

export interface CostingConfig {
  electricity: UtilityTracking;
  water: UtilityTracking;
  lpg: UtilityTracking;
  rentMonthly: number;
  payrollMonthly: number;
  depreciationMonthly: number;
  additionalCosts: AdditionalCost[];   // recurring monthly extras (replaces "other overhead")
  fixedDivisor: number;
  targetCostPerKilo: number;
}

export const DEFAULT_CONFIG: CostingConfig = {
  electricity: { ...DEFAULT_UTIL }, water: { ...DEFAULT_UTIL }, lpg: { ...DEFAULT_UTIL },
  rentMonthly: 0, payrollMonthly: 0, depreciationMonthly: 0,
  additionalCosts: [], fixedDivisor: 30, targetCostPerKilo: 0,
};

/**
 * Minimal structural shapes for the costing aggregators. These describe only
 * the fields actually read, so any caller supplying a richer order/service
 * object still satisfies them — the point is to stop `any` swallowing typos
 * like `it.weighKg`, not to restate the full domain model.
 */
export interface CostingOrderItem {
  // Optional on purpose: product-only POS lines carry no serviceId. The lookup
  // below tolerates that (it falls through to the "order" unit group with zero
  // recipe cost) — the previous `any` simply hid that the field can be absent.
  serviceId?: string | null;
  weightKg?: number | null;
  lineTotal?: number | null;
}

export interface CostingOrder {
  status?: string | null;
  branchId?: string | null;
  totalAmount?: number | null;
  items?: CostingOrderItem[] | null;
}

export interface CostingService {
  id: string;
  name?: string | null;
  unit?: string | null;
  price?: number | null;
  cost?: number | null;
  costPerOrder?: number | null;
  isActive?: boolean | null;
  isArchived?: boolean | null;
}

/**
 * Config parsers read persisted documents that may be current OR legacy shape,
 * so `unknown` is the honest input type. `asRecord` narrows once at the top and
 * the reads below stay explicit about what they expect.
 */
type UnknownRecord = Record<string, unknown>;

function asRecord(v: unknown): UnknownRecord | null {
  return v && typeof v === "object" ? (v as UnknownRecord) : null;
}
const rNum = (v: unknown): number => Number(v ?? 0) || 0;
const rStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

function mapSchedule(v: unknown): UtilSchedule {
  const d = asRecord(v);
  if (!d) return { ...DEFAULT_SCHEDULE };
  const frequency = rStr(d.frequency);
  const assignMode = rStr(d.assignMode);
  return {
    reminder: !!d.reminder,
    frequency: (["DAILY", "WEEKLY", "MONTHLY"] as const).includes(
      frequency as UtilSchedule["frequency"],
    )
      ? (frequency as UtilSchedule["frequency"])
      : "MONTHLY",
    assignMode: (["EVERYONE", "STAFF", "OWNER"] as const).includes(
      assignMode as UtilSchedule["assignMode"],
    )
      ? (assignMode as UtilSchedule["assignMode"])
      : "OWNER",
    dueTime: rStr(d.dueTime),
    requirePhoto: !!d.requirePhoto,
  };
}

function mapUtil(v: unknown, legacyRate?: number): UtilityTracking {
  const d = asRecord(v);
  if (d && "method" in d) {
    return {
      method: d.method as UtilityTracking["method"],
      monthlyBill: rNum(d.monthlyBill),
      tankCost: rNum(d.tankCost),
      rate: rNum(d.rate),
      schedule: mapSchedule(d.schedule),
    };
  }
  // legacy flat config only had a rate
  return { method: legacyRate ? "meter" : "amount", monthlyBill: 0, tankCost: 0, rate: Number(legacyRate ?? 0), schedule: { ...DEFAULT_SCHEDULE } };
}

// ─── Reminder task specs (Costing → Tasks bridge) ────────────────────────────────

export interface ReminderSpec {
  source: string; title: string; description: string;
  frequency: ReminderFreq; assignMode: ReminderAssign; dueTime: string | null; requirePhoto: boolean;
}

export function reminderSpecs(c: CostingConfig, branchId?: string | null): ReminderSpec[] {
  const out: ReminderSpec[] = [];
  const suffix = branchId ? `:${branchId}` : "";
  const add = (key: string, label: string, t: UtilityTracking) => {
    if (!t.schedule.reminder) return;
    const nounByMeter = t.method === "meter" ? `${label} meter reading` : `${label} cost`;
    const nounByTank  = t.method === "tank"  ? `${label} tank count`    : nounByMeter;
    const noun        = t.method === "bill"  ? `${label} bill`          : nounByTank;
    const usageByMeter = t.method === "meter" ? "meter reading" : "amount";
    const usageNoun    = t.method === "tank"  ? "tanks used"    : usageByMeter;
    out.push({
      source: `costing:${key}${suffix}`,
      title: `Record ${noun}`,
      description: `Costing reminder — log the ${label.toLowerCase()} ${usageNoun} for the day's cost per kilo.`,
      frequency: t.schedule.frequency, assignMode: t.schedule.assignMode, dueTime: t.schedule.dueTime, requirePhoto: t.schedule.requirePhoto,
    });
  };
  add("electricity", "Electricity", c.electricity);
  add("water", "Water", c.water);
  add("lpg", "LPG", c.lpg);
  return out;
}

/**
 * The costing config crosses the wire as a JSON scalar, so the backend has no
 * schema for it and `unknown` is the honest input type — it may be the current
 * shape or a legacy one. Every read below narrows explicitly.
 */
export function mapConfig(v: unknown): CostingConfig {
  const d = asRecord(v) ?? {};
  const rawExtras = d.additionalCosts;
  const extras: AdditionalCost[] = Array.isArray(rawExtras)
    ? rawExtras.map((raw): AdditionalCost => {
        const a = asRecord(raw) ?? {};
        return {
          id: String(a.id ?? a.name ?? ""),
          name: rStr(a.name) ?? "",
          amount: rNum(a.amount),
          category: a.category as AdditionalCost["category"],
          repeat: a.repeat === "oneoff" ? "oneoff" : "monthly",
        };
      })
    : rNum(d.otherOverheadMonthly) > 0
      ? [
          {
            id: "legacy-overhead",
            name: "Other overhead",
            amount: rNum(d.otherOverheadMonthly),
            repeat: "monthly" as const,
          },
        ]
      : [];
  return {
    electricity: mapUtil(d.electricity, rNum(d.electricityRate)),
    water: mapUtil(d.water, rNum(d.waterRate)),
    lpg: mapUtil(d.lpg, rNum(d.lpgRate)),
    rentMonthly: rNum(d.rentMonthly),
    payrollMonthly: rNum(d.payrollMonthly),
    depreciationMonthly: rNum(d.depreciationMonthly),
    additionalCosts: extras,
    fixedDivisor: rNum(d.fixedDivisor) || 30,
    targetCostPerKilo: rNum(d.targetCostPerKilo),
  };
}

export function isConfigured(c: CostingConfig): boolean {
  return c.rentMonthly > 0 || c.payrollMonthly > 0 || c.depreciationMonthly > 0 ||
    c.additionalCosts.length > 0 || c.targetCostPerKilo > 0 ||
    [c.electricity, c.water, c.lpg].some((u) => u.monthlyBill > 0 || u.rate > 0 || u.tankCost > 0);
}

// ─── Fixed & additional daily allocation ─────────────────────────────────────────

export interface FixedShares { rent: number; payroll: number; depreciation: number; total: number; }
export function fixedDailyShares(c: CostingConfig): FixedShares {
  const div = c.fixedDivisor || 30;
  const rent = c.rentMonthly / div, payroll = c.payrollMonthly / div, depreciation = c.depreciationMonthly / div;
  return { rent, payroll, depreciation, total: rent + payroll + depreciation };
}

// Daily share of recurring monthly additional costs.
export function additionalMonthlyDaily(c: CostingConfig): number {
  const div = c.fixedDivisor || 30;
  return c.additionalCosts.filter((a) => a.repeat === "monthly").reduce((s, a) => s + a.amount, 0) / div;
}

// Daily amount for a utility given its method and today's input.
// input = amount (amount method) · tanks (tank method) · {prev,current} ignored here.
export function utilityDailyAmount(t: UtilityTracking, divisor: number, input: { amount?: number; tanks?: number; meter?: number }): number {
  switch (t.method) {
    case "bill": return t.monthlyBill / (divisor || 30);
    case "tank": return t.tankCost * (input.tanks ?? 0);
    case "meter": return input.meter ?? 0;
    default: return input.amount ?? 0;
  }
}

// Whether a utility needs a manual entry today (bill is auto-estimated).
export function utilityNeedsInput(t: UtilityTracking): boolean {
  return t.method !== "bill";
}

export function meterAmount(prev: number, current: number, rate: number): number {
  return Math.max(0, current - prev) * rate;
}

// ─── Recipe / supplies cost (Services × Inventory) ───────────────────────────────

// Convertible measurement families for default-product ↔ inventory units.
const WEIGHT_TO_G: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, L: 1000 };

function convertQty(qty: number, from?: string | null, to?: string | null): number {
  if (!from || !to || from === to) return qty;
  if (WEIGHT_TO_G[from] && WEIGHT_TO_G[to]) return (qty * WEIGHT_TO_G[from]) / WEIGHT_TO_G[to];
  if (VOLUME_TO_ML[from] && VOLUME_TO_ML[to]) return (qty * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
  return qty; // incomparable units — assume quantity is already in the inventory unit
}

export interface InventoryCostInfo { cost: number; unit: string; }
export interface RecipeCost { perUnit: number; perOrder: number; }

// Supplies cost of one service from its default products × inventory unit costs.
// per "kg"/"load"/"pc" → scales with the service quantity; "order" (or unset) →
// incurred once per order line regardless of quantity.
export function serviceRecipeCost(
  defaultProducts: { inventoryId: string; quantity: number; unit?: string | null; per?: string | null }[] | null | undefined,
  inventoryById: Record<string, InventoryCostInfo>,
): RecipeCost {
  const out: RecipeCost = { perUnit: 0, perOrder: 0 };
  for (const dp of defaultProducts ?? []) {
    const inv = inventoryById[dp.inventoryId];
    if (!inv || !(inv.cost > 0)) continue;
    const cost = convertQty(Number(dp.quantity ?? 0), dp.unit, inv.unit) * inv.cost;
    if (dp.per === "kg" || dp.per === "load" || dp.per === "pc") out.perUnit += cost;
    else out.perOrder += cost;
  }
  return out;
}

// ─── Production by unit ──────────────────────────────────────────────────────────

export interface UnitProduction { unit: UnitGroup; qty: number; revenue: number; recipeCost: number; }

export interface ServiceCostRef { cost: number; unit: string; costPerOrder?: number; }

export function aggregateByUnit(
  orders: CostingOrder[],
  serviceById: Record<string, ServiceCostRef>,
): UnitProduction[] {
  const map: Record<string, UnitProduction> = {};
  for (const o of orders) {
    if ((o.status as string) === "CANCELLED") continue;
    for (const it of (o.items ?? [])) {
      const svc = it.serviceId ? serviceById[it.serviceId] : undefined;
      const g = unitGroupOf(svc?.unit ?? "order");
      const qty = Number(it.weightKg ?? 0);
      const rev = Number(it.lineTotal ?? 0);
      const cur = (map[g] ??= { unit: g, qty: 0, revenue: 0, recipeCost: 0 });
      cur.qty += qty;
      cur.revenue += rev;
      cur.recipeCost += qty * Number(svc?.cost ?? 0) + Number(svc?.costPerOrder ?? 0);
    }
  }
  const order: UnitGroup[] = ["kg", "load", "piece", "set", "order"];
  return Object.values(map).sort((a, b) => order.indexOf(a.unit) - order.indexOf(b.unit));
}

export interface UnitCosting extends UnitProduction {
  operatingCost: number; totalCost: number; costPerUnit: number; trueMargin: number;
}

// Allocate operating cost across units by revenue share → cost per unit.
export function computeUnitCosting(production: UnitProduction[], operating: number): UnitCosting[] {
  const totalRev = production.reduce((s, p) => s + p.revenue, 0);
  return production.map((p) => {
    const opShare = totalRev > 0 ? (operating * p.revenue) / totalRev : 0;
    const totalCost = p.recipeCost + opShare;
    return { ...p, operatingCost: opShare, totalCost, costPerUnit: p.qty > 0 ? totalCost / p.qty : 0, trueMargin: p.revenue - totalCost };
  });
}

// ─── Daily report ────────────────────────────────────────────────────────────────

export interface DailyReport {
  id?: string;
  date: string;
  kilos: number;            // kg-group quantity (kept for the kg KPI / dashboard)
  revenue: number;
  recipeCost: number;
  electricity: number;
  lpg: number;
  water: number;
  additionalDaily: number;
  oneOffCosts?: { name: string; amount: number }[];
  fixedTotal: number;
  operating: number;
  totalCost: number;
  costPerKilo: number;      // kg-group cost per unit (the investor KPI)
  trueMargin: number;
  units?: UnitCosting[];    // per-unit breakdown
  branches?: BranchCosting[];
  // meter readings (Phase 2)
  elecReading?: number | null;
  waterReading?: number | null;
  lpgReading?: number | null;
  // audit-light
  savedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  firstSavedAt?: string;
}

export interface ComputeInput {
  date: string;
  production: UnitProduction[];
  electricity: number; lpg: number; water: number;
  oneOffToday: number;
  config: CostingConfig;
}

export function computeDailyReport(i: ComputeInput): DailyReport {
  const fixed = fixedDailyShares(i.config);
  const addlMonthly = additionalMonthlyDaily(i.config);
  const additionalDaily = addlMonthly + i.oneOffToday;
  const utilities = i.electricity + i.lpg + i.water;
  const operating = utilities + fixed.total + additionalDaily;

  const units = computeUnitCosting(i.production, operating);
  const revenue = i.production.reduce((s, p) => s + p.revenue, 0);
  const recipeCost = i.production.reduce((s, p) => s + p.recipeCost, 0);
  const totalCost = recipeCost + operating;
  const kg = units.find((u) => u.unit === "kg");

  return {
    date: i.date,
    kilos: kg?.qty ?? 0,
    revenue, recipeCost,
    electricity: i.electricity, lpg: i.lpg, water: i.water,
    additionalDaily, fixedTotal: fixed.total, operating,
    totalCost,
    costPerKilo: kg?.costPerUnit ?? 0,
    trueMargin: revenue - totalCost,
    units,
  };
}

// ─── Branch costing ──────────────────────────────────────────────────────────────

export interface BranchCosting {
  branchId: string; branchName: string;
  kilos: number; revenue: number; recipeCost: number;
  operatingCost: number; totalCost: number; costPerKilo: number; trueMargin: number;
}

export function aggregateByBranch(
  orders: CostingOrder[],
  serviceById: Record<string, ServiceCostRef>,
  branchNameById: Record<string, string>,
  totalOperatingCost: number,
): BranchCosting[] {
  const map: Record<string, { kilos: number; revenue: number; recipeCost: number }> = {};
  for (const o of orders) {
    if ((o.status as string) === "CANCELLED") continue;
    const bid = o.branchId ?? "—";
    map[bid] ??= { kilos: 0, revenue: 0, recipeCost: 0 };
    map[bid].revenue += Number(o.totalAmount ?? 0);
    for (const it of (o.items ?? [])) {
      const svc = it.serviceId ? serviceById[it.serviceId] : undefined;
      const qty = Number(it.weightKg ?? 0);
      map[bid].recipeCost += qty * Number(svc?.cost ?? 0) + Number(svc?.costPerOrder ?? 0);
      if (unitGroupOf(svc?.unit ?? "") === "kg") map[bid].kilos += qty;
    }
  }
  const totalKilos = Object.values(map).reduce((s, b) => s + b.kilos, 0);
  return Object.entries(map).map(([branchId, b]) => {
    const opShare = totalKilos > 0 ? (totalOperatingCost * b.kilos) / totalKilos : 0;
    const totalCost = b.recipeCost + opShare;
    return {
      branchId, branchName: branchNameById[branchId] ?? "Unassigned",
      kilos: b.kilos, revenue: b.revenue, recipeCost: b.recipeCost,
      operatingCost: opShare, totalCost,
      costPerKilo: b.kilos > 0 ? totalCost / b.kilos : 0,
      trueMargin: b.revenue - totalCost,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// ─── Per-service costing (uses its unit-group's operating-per-unit) ────────────────

export interface ServiceCosting {
  id: string; name: string; price: number; unit: UnitGroup;
  recipeCost: number; operatingPerUnit: number; trueCost: number; trueMargin: number; marginPct: number;
}

export function serviceCostingTable(services: CostingService[], opPerUnitByGroup: Record<UnitGroup, number>): ServiceCosting[] {
  return services
    .filter((sv) => sv.isActive !== false && !sv.isArchived)
    .map((sv) => {
      const unit = unitGroupOf(sv.unit ?? "");
      const price = Number(sv.price ?? 0);
      // per-order supplies only fold cleanly into a per-unit figure for order-priced services
      const recipeCost = Number(sv.cost ?? 0) + (unit === "order" ? Number(sv.costPerOrder ?? 0) : 0);
      const operatingPerUnit = opPerUnitByGroup[unit] ?? 0;
      const trueCost = recipeCost + operatingPerUnit;
      return { id: sv.id, name: sv.name ?? "", price, unit, recipeCost, operatingPerUnit, trueCost, trueMargin: price - trueCost, marginPct: price > 0 ? ((price - trueCost) / price) * 100 : 0 };
    });
}

// ─── Periods / summary ───────────────────────────────────────────────────────────

export type Period = "week" | "month" | "all";

export interface PeriodSummary {
  count: number; kilos: number; revenue: number; totalCost: number;
  avgCostPerKilo: number; profitPerKilo: number; trueMargin: number;
  trend: { date: string; costPerKilo: number }[];
}

function startOfPeriod(p: Period): string {
  const now = new Date();
  if (p === "week") { const d = new Date(now); d.setDate(now.getDate() - now.getDay()); d.setHours(0, 0, 0, 0); return isoDate(d); }
  if (p === "month") return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  return "0000-00-00";
}

export function periodSummary(reports: DailyReport[], p: Period): PeriodSummary {
  const since = startOfPeriod(p);
  const inP = reports.filter((r) => r.date >= since).sort((a, b) => (a.date < b.date ? -1 : 1));
  const kilos = inP.reduce((s, r) => s + r.kilos, 0);
  const revenue = inP.reduce((s, r) => s + r.revenue, 0);
  const totalCost = inP.reduce((s, r) => s + r.totalCost, 0);
  return {
    count: inP.length, kilos, revenue, totalCost,
    avgCostPerKilo: kilos > 0 ? totalCost / kilos : 0,
    profitPerKilo: kilos > 0 ? (revenue - totalCost) / kilos : 0,
    trueMargin: revenue - totalCost,
    trend: inP.map((r) => ({ date: r.date, costPerKilo: r.costPerKilo })),
  };
}

export function branchSummary(reports: DailyReport[], p: Period): BranchCosting[] {
  const since = startOfPeriod(p);
  const map: Record<string, BranchCosting> = {};
  for (const r of reports.filter((x) => x.date >= since)) {
    for (const b of (r.branches ?? [])) {
      const cur = (map[b.branchId] ??= { branchId: b.branchId, branchName: b.branchName, kilos: 0, revenue: 0, recipeCost: 0, operatingCost: 0, totalCost: 0, costPerKilo: 0, trueMargin: 0 });
      cur.branchName = b.branchName || cur.branchName;
      cur.kilos += b.kilos; cur.revenue += b.revenue; cur.recipeCost += b.recipeCost;
      cur.operatingCost += b.operatingCost; cur.totalCost += b.totalCost;
    }
  }
  return Object.values(map).map((b) => ({ ...b, costPerKilo: b.kilos > 0 ? b.totalCost / b.kilos : 0, trueMargin: b.revenue - b.totalCost })).sort((a, b) => b.revenue - a.revenue);
}

// ─── Status / formatting ─────────────────────────────────────────────────────────

export type TargetStatus = "none" | "neutral" | "under" | "near" | "over";
export function targetStatus(costPerKilo: number, target: number, kilos: number): TargetStatus {
  if (kilos <= 0) return "none";
  if (target <= 0) return "neutral";
  if (costPerKilo > target) return "over";
  if (costPerKilo > target * 0.95) return "near";
  return "under";
}

export function peso(v: number): string {
  return `₱${(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function savedTimeLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function genId(prefix: string): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return `${prefix}_${n.toString(36).padStart(7, "0")}`;
}
