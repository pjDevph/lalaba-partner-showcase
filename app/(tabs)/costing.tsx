// app/(tabs)/costing.tsx
// Costing — full business cost engine. Recipe cost auto from jobs; operating cost
// from utilities (flexible per-utility tracking) + fixed overhead + itemized
// additional costs; allocated across service units (kg/load/piece…) by revenue
// share to give true cost per unit. Owner-only.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, RefreshControl, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Switch, Modal,
  useWindowDimensions,
} from "react-native";
import { showConfirm } from "../../src/lib/dialog";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuthStore } from "../../src/stores/authStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { useServicesStore } from "../../src/stores/servicesStore";
import { gqlMyOrders } from "../../src/services/graphql/orders";
import { gqlMyTasks, gqlCreateTask, gqlUpdateTask, gqlDeleteTask } from "../../src/services/graphql/tasks";
import { gqlGetCostingConfig, gqlUpsertCostingConfig, gqlGetCostingReports, gqlUpsertCostingReport } from "../../src/services/graphql/costing";
import { gqlMyInventory } from "../../src/services/graphql/inventory";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useCan } from "../../src/hooks/usePermission";
import { C, SP } from "../../src/theme/tokens";
import { s } from "../../src/screens/costing/styles";
import { TopBar, Segments } from "../../src/components/ui";
import { BranchPickerView } from "../../src/components/BranchPickerView";
import { TimeField } from "../../src/components/TimeField";
import {
  type CostingConfig, type DailyReport, type Period, type TargetStatus,
  type UnitGroup, type UtilityTracking, type UtilMethod, type UnitProduction,
  type ReminderFreq, type ReminderAssign, type UtilSchedule,
  type InventoryCostInfo, type ServiceCostRef, COSTING_ENABLED,
  DEFAULT_CONFIG, mapConfig, fixedDailyShares, additionalMonthlyDaily, aggregateByUnit, computeDailyReport,
  utilityDailyAmount, meterAmount, reminderSpecs, serviceRecipeCost, UTIL_METHODS, UNIT_LABEL, aggregateByBranch, serviceCostingTable,
  periodSummary, branchSummary, targetStatus, isConfigured, savedTimeLabel, peso, isoDate, prettyDate, genId,
} from "../../src/features/costing/costing";
import { Ionicons } from "@expo/vector-icons";
import { toUserMessage } from "../../src/utils/userError";

type Tab = "today" | "setup" | "reports";
type WizardStyle = "simple" | "detailed";
interface UtilToday { amount: number; tanks: number; prev: number; current: number; }
const EMPTY_UT: UtilToday = { amount: 0, tanks: 0, prev: 0, current: 0 };

const STATUS_FG: Record<TargetStatus, string> = { under: C.success700, near: C.warning700, over: C.error700, none: C.gray400, neutral: C.brand700 };
const STATUS_BG: Record<TargetStatus, string> = { under: C.success100, near: C.warning100, over: C.error100, none: C.gray100, neutral: C.brand100 };

function num(v: string): number { const x = v.replace(/[^\d.]/g, ""); const d = x.indexOf("."); return Number.parseFloat(d === -1 ? x : x.slice(0, d + 1) + x.slice(d + 1).replace(/\./g, "")) || 0; }

// Wizard: preset utility methods by style. Simple = bills + LPG tank; Detailed = meters + LPG tank.
function applyStyle(style: WizardStyle, base: CostingConfig): CostingConfig {
  const set = (t: UtilityTracking, method: UtilMethod): UtilityTracking => ({ ...t, method });
  const eu: UtilMethod = style === "simple" ? "bill" : "meter";
  return { ...base, electricity: set(base.electricity, eu), water: set(base.water, eu), lpg: set(base.lpg, "tank") };
}

// Wizard: apply one reminder schedule across all utilities.
function withReminders(cfg: CostingConfig, on: boolean, assign: ReminderAssign, time: string | null): CostingConfig {
  if (!on) return cfg;
  const sched = (t: UtilityTracking): UtilSchedule => ({ reminder: true, frequency: t.method === "bill" ? "MONTHLY" : "WEEKLY", assignMode: assign, dueTime: time, requirePhoto: t.method === "bill" || t.method === "meter" });
  return {
    ...cfg,
    electricity: { ...cfg.electricity, schedule: sched(cfg.electricity) },
    water: { ...cfg.water, schedule: sched(cfg.water) },
    lpg: { ...cfg.lpg, schedule: sched(cfg.lpg) },
  };
}

function Field({ label, value, onChange, prefix = "₱", suffix, placeholder }: Readonly<{ label?: string; value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; placeholder?: string }>) {
  // Plain peso amount (default prefix) — label gets "(₱)" and placeholder defaults to
  // "0.00" to match the rest of the app. Fields with a custom prefix/suffix (e.g. a
  // "₱/kg" rate, or a non-money quantity like tank count) already state their own unit.
  const isCurrency = prefix === "₱";
  const displayLabel = label && isCurrency ? `${label} (₱)` : label;
  const resolvedPlaceholder = placeholder ?? (isCurrency ? "0.00" : "0");
  return (
    <View style={label ? { marginBottom: SP._12 } : undefined}>
      {!!displayLabel && <Text style={s.inputLabel}>{displayLabel}</Text>}
      <View style={s.inputWrap}>
        {!!prefix && <Text style={s.affix}>{prefix}</Text>}
        <TextInput style={s.input} value={value === 0 ? "" : String(value)} onChangeText={(v) => onChange(num(v))}
          placeholder={resolvedPlaceholder} placeholderTextColor={C.gray400} keyboardType="decimal-pad" />
        {!!suffix && <Text style={s.affix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function Row({ label, value, strong, accent }: Readonly<{ label: string; value: string; strong?: boolean; accent?: string }>) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, strong && s.rowStrong]}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowStrong, !!accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

type UtilKey = "electricity" | "water" | "lpg";

export default function CostingScreen({ onBack: onBackProp, initialBranchId }: { readonly onBack?: () => void; readonly initialBranchId?: string } = {}) {
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();
  const goBack = onBackProp ?? (() => fromSettings === "1" ? router.replace("/(tabs)/settings") : router.back());

  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isTablet = Math.min(winWidth, winHeight) >= 600;
  // Clear the bottom tab bar + Android nav keys so the last content/Save button isn't hidden.
  const bodyPad = { paddingBottom: insets.bottom + 96 };
  const { merchantId, user, role } = useAuthStore((s2) => ({ merchantId: s2.merchantId, user: s2.user, role: s2.role }));
  const branches = useMerchantStore((s2) => s2.branches);
  const canViewCosting        = useCan("canViewCosting");
  const canSaveDailyCosting   = useCan("canSaveDailyCosting");
  const canEditSavedCosting   = useCan("canEditSavedCosting");
  const canManageCostingSetup = useCan("canManageCostingSetup");
  const canEnterUtilityReadings = useCan("canEnterUtilityReadings");
  const canViewTrueMargin     = useCan("canViewTrueMargin");
  // Profit/margin figures are sensitive — owners always see them, staff need the grant.
  const showMargin = role === "MERCHANT" || canViewTrueMargin;
  const [branchView, setBranchView] = useState<"picker" | "costing">(initialBranchId ? "costing" : "picker");
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(initialBranchId ?? null);
  const [tab, setTab] = useState<Tab>("today");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const didInit = useRef(false);

  const [config, setConfig] = useState<CostingConfig>(DEFAULT_CONFIG);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [savedToday, setSavedToday] = useState<any>(null);
  const [production, setProduction] = useState<UnitProduction[]>([]);
  const [servicesRaw, setServicesRaw] = useState<any[]>([]);
  const [ordersRaw, setOrdersRaw] = useState<any[]>([]);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<Period>("week");

  const [elec, setElec] = useState<UtilToday>(EMPTY_UT);
  const [water, setWater] = useState<UtilToday>(EMPTY_UT);
  const [lpg, setLpg] = useState<UtilToday>(EMPTY_UT);
  const [last, setLast] = useState({ elec: 0, water: 0, lpg: 0 });
  const [oneOff, setOneOff] = useState<{ id: string; name: string; amount: number }[]>([]);

  // First-time wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizStep, setWizStep] = useState(0);
  const [wizStyle, setWizStyle] = useState<WizardStyle>("simple");
  const [wizDraft, setWizDraft] = useState<CostingConfig>(DEFAULT_CONFIG);
  const [wizRemind, setWizRemind] = useState(true);
  const [wizAssign, setWizAssign] = useState<ReminderAssign>("OWNER");
  const [wizTime, setWizTime] = useState<string | null>("18:00");

  const today = isoDate(new Date());

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!COSTING_ENABLED || !merchantId || !selectedBranchId) { if (!opts?.silent) setLoading(false); return; }
    if (!opts?.silent) setLoading(true);
    try {
      const [rawConfig, rawOrders, reps, inv] = await Promise.all([
        gqlGetCostingConfig(selectedBranchId),
        gqlMyOrders({ branchId: selectedBranchId, laundryStatus: "COMPLETED", days: 1 }),
        gqlGetCostingReports(selectedBranchId),
        gqlMyInventory({ branchId: selectedBranchId, isArchived: false, limit: 500 }).catch(() => ({ data: [], total: 0 })),
      ]);

      const inventoryById: Record<string, InventoryCostInfo> = {};
      inv.data.forEach((p) => { inventoryById[p._id] = { cost: Number(p.cost ?? 0), unit: p.inventoryUnit }; });

      // Normalize GqlService → costing engine shape (id, name, unit, supplies cost
      // computed from the service's default products × inventory unit costs).
      const svcs = useServicesStore.getState().services.map((sv) => {
        const recipe = serviceRecipeCost(sv.defaultProducts, inventoryById);
        return { ...sv, id: sv._id, name: sv.serviceName, unit: sv.pricingType, cost: recipe.perUnit, costPerOrder: recipe.perOrder };
      });
      // Normalize GqlOrder → costing engine shape (status uppercase, totalAmount, items.weightKg)
      const orders = rawOrders.map((o) => ({
        ...o,
        id: o._id,
        status: o.laundryStatus.toUpperCase(),
        totalAmount: o.totalAmount,
        items: o.items.map((it) => ({ ...it, weightKg: it.quantity })),
      }));

      const cfg = mapConfig(rawConfig);
      setConfig(cfg);
      setServicesRaw(svcs);
      setOrdersRaw(orders);
      const serviceById: Record<string, ServiceCostRef> = {};
      svcs.forEach((sv) => { serviceById[sv.id] = { cost: Number(sv.cost ?? 0), costPerOrder: Number(sv.costPerOrder ?? 0), unit: sv.unit ?? "" }; });
      setProduction(aggregateByUnit(orders, serviceById));
      const names: Record<string, string> = {};
      useMerchantStore.getState().branches.forEach((b) => { names[b.id] = b.name; });
      setBranchNames(names);

      setReports(reps);
      const priorReading = (key: "elecReading" | "waterReading" | "lpgReading") =>
        reps.filter((r) => r.date < today && r[key] != null).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.[key] ?? 0;
      const ep = priorReading("elecReading"), wp = priorReading("waterReading"), lp = priorReading("lpgReading");
      setLast({ elec: ep, water: wp, lpg: lp });

      const ex = reps.find((r) => r.date === today) as any;
      setSavedToday(ex ?? null);
      const restore = (saved: number, reading: any, t: UtilityTracking, prevR: number): UtilToday => ({
        amount: t.method === "amount" ? saved : 0,
        tanks: t.method === "tank" && t.tankCost > 0 ? Math.round(saved / t.tankCost) : 0,
        prev: prevR, current: reading ?? 0,
      });
      setElec(restore(ex?.electricity ?? 0, ex?.elecReading, cfg.electricity, ep));
      setWater(restore(ex?.water ?? 0, ex?.waterReading, cfg.water, wp));
      setLpg(restore(ex?.lpg ?? 0, ex?.lpgReading, cfg.lpg, lp));
      setOneOff((ex?.oneOffCosts ?? []).map((o: any) => ({ id: genId("oo"), name: o.name, amount: o.amount })));

      if (!didInit.current) {
        didInit.current = true;
        // First-run wizard is for whoever can actually save the setup.
        if (!isConfigured(cfg) && canManageCostingSetup) { setWizStyle("simple"); setWizDraft(applyStyle("simple", cfg)); setWizStep(0); setWizardOpen(true); }
      }
    } catch (err) {
      console.warn("Costing load:", err);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load costing data." });
    } finally { if (!opts?.silent) setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId, selectedBranchId]);

  useEffect(() => { void load(); }, [load]);

  // Reports tab is read-only, so it's the only one safe to pull-to-refresh —
  // Today/Setup hold in-progress local drafts that a silent reload would stomp on.
  const onRefreshReports = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const utilAmt = (t: UtilityTracking, st: UtilToday) =>
    utilityDailyAmount(t, config.fixedDivisor, { amount: st.amount, tanks: st.tanks, meter: meterAmount(st.prev, st.current, t.rate) });
  const elecAmt = utilAmt(config.electricity, elec);
  const waterAmt = utilAmt(config.water, water);
  const lpgAmt = utilAmt(config.lpg, lpg);
  const oneOffTotal = oneOff.reduce((s2, o) => s2 + o.amount, 0);

  const report = useMemo<DailyReport>(() => computeDailyReport({
    date: today, production, electricity: elecAmt, lpg: lpgAmt, water: waterAmt, oneOffToday: oneOffTotal, config,
  }), [today, production, elecAmt, lpgAmt, waterAmt, oneOffTotal, config]);

  const fixed = fixedDailyShares(config);
  const addlMonthlyDaily = additionalMonthlyDaily(config);
  const utilTotal = elecAmt + waterAmt + lpgAmt;
  const status = targetStatus(report.costPerKilo, config.targetCostPerKilo, report.kilos);
  const hasInput = report.revenue > 0 || utilTotal > 0 || oneOffTotal > 0;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const dirty = !savedToday || r2(savedToday.totalCost) !== r2(report.totalCost) || r2(savedToday.electricity ?? 0) !== r2(elecAmt) || r2(savedToday.water ?? 0) !== r2(waterAmt) || r2(savedToday.lpg ?? 0) !== r2(lpgAmt) || r2(savedToday.additionalDaily ?? 0) !== r2(addlMonthlyDaily + oneOffTotal);

  let chip: { text: string; bg: string; fg: string };
  if (savedToday && !dirty) chip = { text: `Saved ${savedTimeLabel(savedToday.savedAt)}`.trim(), bg: C.success100, fg: C.success700 };
  else if (savedToday && dirty) chip = { text: "Edited · unsaved", bg: C.warning100, fg: C.warning700 };
  else if (hasInput) chip = { text: "Draft · not saved", bg: C.warning100, fg: C.warning700 };
  else chip = { text: "Not started", bg: C.gray100, fg: C.gray500 };

  // Smart checklist — only flag what actually needs an action today.
  type CkState = "done" | "todo" | "info";
  const utilCk = (label: string, t: UtilityTracking, amt: number): { label: string; state: CkState } => {
    const entryState: CkState = amt > 0 ? "done" : "todo";
    return t.method === "bill" ? { label: `${label} — monthly estimate`, state: "info" } : { label: `Enter ${label.toLowerCase()}`, state: entryState };
  };
  // Supplies cost is only "done" when it actually computed to a real amount —
  // revenue with ₱0 supplies means product costs are missing in Inventory/Services.
  let suppliesCk: { label: string; state: CkState };
  if (report.recipeCost > 0) suppliesCk = { label: "Supplies cost auto-computed", state: "done" };
  else if (report.revenue > 0) suppliesCk = { label: "Supplies cost missing — link products with costs in Services", state: "info" };
  else suppliesCk = { label: "Supplies cost auto-computed", state: "todo" };
  const checklist: { label: string; state: CkState }[] = [
    { label: "POS jobs reviewed", state: report.revenue > 0 ? "done" : "todo" },
    suppliesCk,
    utilCk("Electricity", config.electricity, elecAmt),
    utilCk("Water", config.water, waterAmt),
    utilCk("LPG", config.lpg, lpgAmt),
    { label: "Save daily costing", state: savedToday && !dirty ? "done" : "todo" },
  ];

  // Reports derivations
  const serviceById = useMemo(() => { const m: Record<string, ServiceCostRef> = {}; servicesRaw.forEach((sv) => { m[sv.id] = { cost: Number(sv.cost ?? 0), costPerOrder: Number(sv.costPerOrder ?? 0), unit: sv.unit ?? "" }; }); return m; }, [servicesRaw]);
  const unitsForCosting = useMemo(
    () => (report.units && report.units.length > 0 && report.revenue > 0) ? report.units : (reports[0]?.units ?? []),
    [report.units, report.revenue, reports]);
  const opPerUnitByGroup = useMemo(() => {
    const m = { kg: 0, load: 0, piece: 0, set: 0, order: 0 } as Record<UnitGroup, number>;
    unitsForCosting.forEach((u) => { if (u.qty > 0) m[u.unit] = u.operatingCost / u.qty; });
    return m;
  }, [unitsForCosting]);
  const serviceTable = useMemo(() => serviceCostingTable(servicesRaw, opPerUnitByGroup), [servicesRaw, opPerUnitByGroup]);
  const hasTrueCost = Object.values(opPerUnitByGroup).some((v) => v > 0);
  const summary = useMemo(() => periodSummary(reports, period), [reports, period]);
  const branchPeriod = useMemo(() => branchSummary(reports, period), [reports, period]);
  const branchToday = useMemo(() => aggregateByBranch(ordersRaw, serviceById, branchNames, report.operating), [ordersRaw, serviceById, branchNames, report.operating]);

  const setCfg = (patch: Partial<CostingConfig>) => setConfig((c) => ({ ...c, ...patch }));
  const setUtil = (key: UtilKey, patch: Partial<UtilityTracking>) => setConfig((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  const setSched = (key: UtilKey, patch: Partial<UtilSchedule>) => setConfig((c) => ({ ...c, [key]: { ...c[key], schedule: { ...c[key].schedule, ...patch } } }));

  // Reconcile auto-created costing reminder tasks, matched by structured `source`
  // ("costing:<utility>:<branchId>"), idempotent. Tasks created before the source
  // field existed are recognized by title prefix and adopted in place.
  const LEGACY_TITLE_PREFIXES = ["Record Electricity", "Record Water", "Record LPG"];
  const syncReminders = async (cfg: CostingConfig, branchId: string): Promise<number> => {
    const specs = reminderSpecs(cfg, branchId);
    const allTasks = await gqlMyTasks({ branchId });
    const wantedSources = new Set(specs.map((sp) => sp.source));

    const owned = allTasks.filter((t) =>
      (t.source ?? "").startsWith("costing:") ||
      (!t.source && LEGACY_TITLE_PREFIXES.some((p) => t.title.startsWith(p))));

    const haveSources = new Set<string>();
    const ops: Promise<unknown>[] = [];
    for (const t of owned) {
      const source = t.source ?? specs.find((sp) => sp.title === t.title)?.source;
      if (source && wantedSources.has(source) && !haveSources.has(source)) {
        haveSources.add(source);
        if (!t.source) ops.push(gqlUpdateTask(t._id, { source })); // adopt legacy task
      } else {
        ops.push(gqlDeleteTask(t._id)); // no longer wanted, or duplicate
      }
    }
    for (const spec of specs.filter((sp) => !haveSources.has(sp.source))) {
      ops.push(gqlCreateTask({
        branchId,
        title: spec.title,
        description: spec.description,
        priority: "low",
        category: "maintenance",
        source: spec.source,
        isVisibleToStaff: spec.assignMode !== "OWNER",
      }));
    }
    await Promise.all(ops);
    return specs.length;
  };

  const saveConfig = async () => {
    if (!selectedBranchId || !canManageCostingSetup) return;
    setSaving(true);
    try {
      await gqlUpsertCostingConfig(selectedBranchId, config);
      const n = await syncReminders(config, selectedBranchId);
      setTab("today");
      const taskPlural = n !== 1 ? "s" : "";
      useNotificationStore.getState().push({
        type: "success", title: "Setup saved",
        message: n > 0 ? `You can now record today’s costing. ${n} reminder task${taskPlural} created.` : "You can now record today’s costing.",
      });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Save failed", message: toUserMessage(err, "Try again."),
      });
    }
    finally { setSaving(false); }
  };

  const setWizCfg = (patch: Partial<CostingConfig>) => setWizDraft((c) => ({ ...c, ...patch }));
  const setWizUtil = (key: UtilKey, patch: Partial<UtilityTracking>) => setWizDraft((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const finishWizard = async () => {
    if (!selectedBranchId || !canManageCostingSetup) return;
    const final = withReminders(wizDraft, wizRemind, wizAssign, wizTime);
    setWizardOpen(false);
    setConfig(final);
    setSaving(true);
    try {
      await gqlUpsertCostingConfig(selectedBranchId, final);
      const n = await syncReminders(final, selectedBranchId);
      setTab("today");
      await load();
      const reminderTaskPlural = n !== 1 ? "s" : "";
      const reminderSuffix = n > 0 ? ` ${n} reminder task${reminderTaskPlural} created.` : "";
      useNotificationStore.getState().push({ type: "success", title: "Costing ready", message: `Setup complete. Your cost per kilo uses estimates until actual bills/readings are updated.${reminderSuffix}` });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Save failed", message: toUserMessage(err, "Try again."),
      });
    }
    finally { setSaving(false); }
  };

  const doSave = async () => {
    if (savedToday ? !canEditSavedCosting : !canSaveDailyCosting) return;
    setSaving(true);
    try {
      const by = user?.displayName ?? user?.email ?? "Owner";
      const payload: any = {
        ...report,
        branchId: selectedBranchId,
        oneOffCosts: oneOff.map((o) => ({ name: o.name, amount: o.amount })),
        elecReading: config.electricity.method === "meter" ? elec.current : null,
        waterReading: config.water.method === "meter" ? water.current : null,
        lpgReading: config.lpg.method === "meter" ? lpg.current : null,
        branches: branchToday,
        savedAt: new Date().toISOString(),
        createdBy: savedToday?.createdBy ?? by,
        firstSavedAt: savedToday?.firstSavedAt ?? savedToday?.savedAt ?? new Date().toISOString(),
        updatedBy: savedToday ? by : null,
      };
      await gqlUpsertCostingReport(selectedBranchId!, payload);
      await load();
      useNotificationStore.getState().push({ type: "success", title: "Saved", message: `Daily costing for ${prettyDate(today)} saved.` });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Save failed", message: toUserMessage(err, "Try again."),
      });
    }
    finally { setSaving(false); }
  };

  const save = () => {
    if (report.revenue <= 0) { showConfirm("No jobs today", "No completed jobs to cost. Save anyway?", () => void doSave(), { confirmLabel: "Save anyway" }); return; }
    if (savedToday) { showConfirm("Overwrite saved costing?", "You’re editing a saved daily costing. Saving overwrites it and records the change.", () => void doSave(), { confirmLabel: "Overwrite" }); return; }
    void doSave();
  };

  // ── Phase 2: Costing feature deferred — the BE CostingModule is disabled,
  // so gate the screen entirely (entry points are hidden, this covers deep links).
  if (!COSTING_ENABLED) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <TopBar title="Costing" onBack={goBack} />
        <View style={s.gate}><Text style={s.gateTitle}>Coming soon</Text><Text style={s.gateSub}>Costing is being rebuilt and will be back in a future update.</Text></View>
      </SafeAreaView>
    );
  }

  // ── Permission gate — owners always; staff need the "view costing" grant ──
  if (role && role !== "MERCHANT" && !canViewCosting) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <TopBar title="Costing" onBack={() => router.back()} />
        <View style={s.gate}><Text style={s.gateTitle}>No access</Text><Text style={s.gateSub}>Costing contains sensitive business figures. Ask the owner to grant you costing access.</Text></View>
      </SafeAreaView>
    );
  }

  // ── Branch picker ──
  if (branchView === "picker") {
    return (
      <BranchPickerView
        title="Costing"
        subtitle="Select a branch to cost"
        branches={branches}
        onBack={goBack}
        onSelect={(branchId) => { didInit.current = false; setSelectedBranchId(branchId); setBranchView("costing"); setTab("today"); }}
        getMetaText={() => "Utilities · overhead · cost/kg"}
      />
    );
  }

  // ── Method-aware utility input (Today) ──
  const utilityToday = (label: string, unit: string, t: UtilityTracking, st: UtilToday, setSt: (u: UtilToday) => void, lastReading: number) => {
    const amount = utilAmt(t, st);
    const canEnter = canEnterUtilityReadings || t.method === "bill"; // bill rows are read-only estimates anyway
    return (
      <View key={label} style={s.utilCard}>
        <View style={s.utilHead}>
          <Text style={s.utilLabel}>{label}</Text>
          <Text style={s.utilMethod}>{UTIL_METHODS.find((m) => m.value === t.method)?.label}</Text>
        </View>
        <View pointerEvents={canEnter ? "auto" : "none"} style={canEnter ? undefined : { opacity: 0.5 }}>
        {t.method === "bill" ? (
          <View style={s.estRow}>
            <Text style={s.estText}>Monthly estimate · {peso(t.monthlyBill)} ÷ {config.fixedDivisor || 30}</Text>
            <Text style={s.estVal}>{peso(amount)}/day</Text>
          </View>
        ) : t.method === "tank" ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10 }}>
              <Text style={s.meterLabel}>Tanks today</Text>
              <View style={{ flex: 1 }}><Field value={st.tanks} onChange={(n) => setSt({ ...st, tanks: n })} prefix="" suffix="tank" /></View>
            </View>
            <View style={s.meterCalcRow}><Text style={s.meterCalc}>{st.tanks} × {peso(t.tankCost)}</Text><Text style={s.meterTotal}>{peso(amount)}</Text></View>
          </>
        ) : t.method === "meter" ? (
          <>
            <View style={{ flexDirection: "row", gap: SP._10 }}>
              <View style={{ flex: 1 }}><Text style={s.meterLabel}>Previous</Text><View style={s.inputWrap}><TextInput style={s.input} value={st.prev === 0 ? "" : String(st.prev)} onChangeText={(v) => setSt({ ...st, prev: num(v) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.gray400} /><Text style={s.affixSm}>{unit}</Text></View></View>
              <View style={{ flex: 1 }}><Text style={s.meterLabel}>Current</Text><View style={s.inputWrap}><TextInput style={s.input} value={st.current === 0 ? "" : String(st.current)} onChangeText={(v) => setSt({ ...st, current: num(v) })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.gray400} /><Text style={s.affixSm}>{unit}</Text></View></View>
            </View>
            {lastReading > 0 && st.prev !== lastReading && <TouchableOpacity onPress={() => setSt({ ...st, prev: lastReading })}><Text style={s.useLast}>Use last reading: {lastReading} {unit}</Text></TouchableOpacity>}
            <View style={s.meterCalcRow}><Text style={s.meterCalc}>{Math.max(0, st.current - st.prev).toFixed(1)} {unit} × {peso(t.rate)}</Text><Text style={s.meterTotal}>{peso(amount)}</Text></View>
          </>
        ) : (
          <Field value={st.amount} onChange={(n) => setSt({ ...st, amount: n })} />
        )}
        </View>
        {!canEnter && <Text style={s.help}>Recording utility entries needs the owner's permission.</Text>}
      </View>
    );
  };

  const dueTodayCount = [config.electricity, config.water, config.lpg].filter((t) => t.method !== "bill").length;

  // ── Today ──
  const nearOrUnderLabel = status === "near" ? "near target" : `under by ${peso(config.targetCostPerKilo - report.costPerKilo)}`;
  const targetDeltaLabel = status === "over" ? `over by ${peso(report.costPerKilo - config.targetCostPerKilo)}` : nearOrUnderLabel;
  const todayTab = (
    <ScrollView style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }} contentContainerStyle={[s.body, bodyPad]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.eyebrow}>COSTING TODAY · {prettyDate(today)}</Text>

      {/* Hero */}
      <View style={[s.hero, { backgroundColor: STATUS_BG[status] }]}>
        <Text style={s.heroLabel}>True Cost per kg</Text>
        <Text style={[s.heroValue, { color: STATUS_FG[status] }]}>{report.kilos > 0 ? <>{peso(report.costPerKilo)}<Text style={s.heroUnit}>/kg</Text></> : "—"}</Text>
        {report.kilos > 0 ? (config.targetCostPerKilo > 0
          ? <Text style={[s.heroSub, { color: STATUS_FG[status] }]}>Target {peso(config.targetCostPerKilo)}/kg · {targetDeltaLabel}</Text>
          : <Text style={s.heroSubMuted}>Set a target in Setup to track over/under.</Text>)
          : <Text style={s.heroSubMuted}>No per-kg jobs yet today.</Text>}
        <Text style={s.heroMeta}>{peso(report.totalCost)} total cost{showMargin ? ` · ${peso(report.trueMargin)} true margin` : ""}</Text>
        <View style={[s.chip, { backgroundColor: chip.bg }]}><Text style={[s.chipText, { color: chip.fg }]}>{chip.text}</Text></View>
      </View>

      {/* Cost by unit strip */}
      {(report.units ?? []).length > 0 && (
        <View style={s.unitStrip}>
          {report.units!.map((u) => (
            <View key={u.unit} style={s.unitPill}>
              <Text style={s.unitPillVal}>{u.qty > 0 ? peso(u.costPerUnit) : "—"}</Text>
              <Text style={s.unitPillLabel}>/{UNIT_LABEL[u.unit]} · {u.qty.toFixed(0)}{UNIT_LABEL[u.unit]}</Text>
            </View>
          ))}
        </View>
      )}

      {savedToday && dirty && <Text style={s.editNote}>You’re editing a saved report — saving overwrites it.</Text>}

      {/* Checklist */}
      <Text style={s.sectionHeader}>Today’s checklist</Text>
      <View style={s.card}>
        {checklist.map((c) => {
          const ckInfoOrTodoStyle = c.state === "info" ? s.ckInfo : s.ckTodo;
          const ckIconStyle = c.state === "done" ? s.ckDone : ckInfoOrTodoStyle;
          const ckInfoOrEmptyMark = c.state === "info" ? "!" : "";
          return (
            <View key={c.label} style={s.ckRow}>
              <View style={[s.ckIcon, ckIconStyle]}>
                {c.state === "done"
                  ? <Ionicons name="checkmark" size={12} color={C.white} />
                  : <Text style={[s.ckMark, c.state === "info" && { color: C.warning700 }]}>{ckInfoOrEmptyMark}</Text>}
              </View>
              <Text style={[s.ckLabel, c.state === "done" && s.ckLabelDone]}>{c.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Production */}
      <Text style={s.sectionHeader}>Production from POS</Text>
      <View style={s.card}>
        {(report.units ?? []).length === 0 ? <Text style={s.help}>No completed jobs today.</Text> : report.units!.map((u) => (
          <Row key={u.unit} label={`${UNIT_LABEL[u.unit]} services`} value={`${u.qty.toFixed(u.unit === "kg" ? 1 : 0)} ${UNIT_LABEL[u.unit]} · ${peso(u.revenue)}`} />
        ))}
        <View style={s.divider} />
        <Row label="Sales revenue" value={peso(report.revenue)} />
        <Row label="Supplies cost" value={peso(report.recipeCost)} />
      </View>

      {/* Utilities */}
      <Text style={s.sectionHeader}>Utilities {dueTodayCount > 0 ? `· ${dueTodayCount} to enter` : "· all estimated"}</Text>
      {utilityToday("Electricity", "kWh", config.electricity, elec, setElec, last.elec)}
      {utilityToday("Water", "m³", config.water, water, setWater, last.water)}
      {utilityToday("LPG", "kg", config.lpg, lpg, setLpg, last.lpg)}

      {/* Fixed */}
      <Text style={s.sectionHeader}>Fixed daily share</Text>
      <View style={s.card}>
        <Row label="Rent" value={peso(fixed.rent)} />
        <Row label="Payroll" value={peso(fixed.payroll)} />
        <Row label="Depreciation" value={peso(fixed.depreciation)} />
        {fixed.total === 0 && <Text style={s.cardHint}>Set monthly fixed costs in Setup.</Text>}
      </View>

      {/* Additional costs */}
      <Text style={s.sectionHeader}>Additional costs</Text>
      <View style={s.card}>
        {addlMonthlyDaily > 0 && <Row label="Recurring (daily share)" value={peso(addlMonthlyDaily)} />}
        {oneOff.map((o) => (
          <View key={o.id} style={s.ooRow}>
            <TextInput style={s.ooName} value={o.name} onChangeText={(v) => setOneOff((p) => p.map((x) => x.id === o.id ? { ...x, name: v } : x))} placeholder="Cost name (e.g. Repair)" placeholderTextColor={C.gray400} maxLength={50} />
            <View style={s.ooAmt}><Text style={s.affixSm}>₱</Text><TextInput style={s.input} value={o.amount === 0 ? "" : String(o.amount)} onChangeText={(v) => setOneOff((p) => p.map((x) => x.id === o.id ? { ...x, amount: num(v) } : x))} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.gray400} /></View>
            <TouchableOpacity onPress={() => setOneOff((p) => p.filter((x) => x.id !== o.id))} hitSlop={8}><Ionicons name="close" size={14} color={C.gray400} style={s.ooRemove} /></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.addLink} onPress={() => setOneOff((p) => [...p, { id: genId("oo"), name: "", amount: 0 }])}><Text style={s.addLinkText}>+ Add one-off cost (today)</Text></TouchableOpacity>
      </View>

      {/* Breakdown */}
      <Text style={s.sectionHeader}>Cost breakdown</Text>
      <View style={s.card}>
        <Row label="Supplies cost" value={peso(report.recipeCost)} />
        <Row label="Utilities" value={peso(utilTotal)} />
        <Row label="Fixed overhead" value={peso(fixed.total)} />
        <Row label="Additional costs" value={peso(report.additionalDaily)} />
        <View style={s.divider} />
        <Row label="Total daily cost" value={peso(report.totalCost)} strong />
        {showMargin && <Row label="True margin" value={peso(report.trueMargin)} accent={report.trueMargin >= 0 ? C.success700 : C.error700} strong />}
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, (saving || (savedToday ? !canEditSavedCosting : !canSaveDailyCosting)) && { opacity: 0.6 }]}
        onPress={save}
        disabled={saving || (savedToday ? !canEditSavedCosting : !canSaveDailyCosting)}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryBtnText}>{savedToday ? "Update daily costing" : "Save daily costing"}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Setup ──
  const utilSetup = (key: UtilKey, label: string, unit: string) => {
    const t = config[key];
    return (
      <View style={s.setupCard}>
        <Text style={s.setupCardTitle}>{label}</Text>
        <View style={s.methodWrap}>
          {UTIL_METHODS.map((m) => (
            <TouchableOpacity key={m.value} style={[s.methodChip, t.method === m.value && s.methodChipActive]} onPress={() => setUtil(key, { method: m.value as UtilMethod })} activeOpacity={0.8}>
              <Text style={[s.methodText, t.method === m.value && s.methodTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {t.method === "amount" && <Text style={s.help}>Enter the peso amount each day in Today.</Text>}
        {t.method === "bill" && <><Field label="Monthly bill" value={t.monthlyBill} onChange={(n) => setUtil(key, { monthlyBill: n })} /><Text style={s.help}>Spread automatically: {peso(t.monthlyBill / (config.fixedDivisor || 30))}/day.</Text></>}
        {t.method === "tank" && <Field label="Cost per tank / refill" value={t.tankCost} onChange={(n) => setUtil(key, { tankCost: n })} />}
        {t.method === "meter" && <Field label={`Rate (₱ per ${unit})`} value={t.rate} onChange={(n) => setUtil(key, { rate: n })} prefix="" suffix={`₱/${unit}`} placeholder="0.00" />}

        {/* Reminder schedule → auto-creates a Task */}
        <View style={s.schedDivider} />
        <View style={s.schedToggle}>
          <View style={{ flex: 1 }}>
            <Text style={s.schedTitle}>Reminder task</Text>
            <Text style={s.schedSub}>Auto-create a Task to record this</Text>
          </View>
          <Switch value={t.schedule.reminder} onValueChange={(v) => setSched(key, { reminder: v })}
            trackColor={{ false: C.gray200, true: C.brand400 }} thumbColor={t.schedule.reminder ? C.brand500 : C.gray400} />
        </View>
        {t.schedule.reminder && (
          <View style={{ marginTop: SP._8 }}>
            <Text style={s.miniLabel}>How often</Text>
            <View style={s.miniRow}>
              {(["DAILY", "WEEKLY", "MONTHLY"] as ReminderFreq[]).map((f) => (
                <TouchableOpacity key={f} style={[s.miniChip, t.schedule.frequency === f && s.miniChipActive]} onPress={() => setSched(key, { frequency: f })} activeOpacity={0.8}>
                  <Text style={[s.miniChipText, t.schedule.frequency === f && s.miniChipTextActive]}>{f.charAt(0) + f.slice(1).toLowerCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.miniLabel}>Assign to</Text>
            <View style={s.miniRow}>
              {([["OWNER", "Owner"], ["STAFF", "Staff"], ["EVERYONE", "Everyone"]] as [ReminderAssign, string][]).map(([v, lbl]) => (
                <TouchableOpacity key={v} style={[s.miniChip, t.schedule.assignMode === v && s.miniChipActive]} onPress={() => setSched(key, { assignMode: v })} activeOpacity={0.8}>
                  <Text style={[s.miniChipText, t.schedule.assignMode === v && s.miniChipTextActive]}>{lbl}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.miniLabel}>Reminder time</Text>
            <TimeField value={t.schedule.dueTime} onChange={(v) => setSched(key, { dueTime: v })} />
            <View style={[s.schedToggle, { marginTop: SP._10 }]}>
              <Text style={s.schedTitle}>Require photo (bill/meter)</Text>
              <Switch value={t.schedule.requirePhoto} onValueChange={(v) => setSched(key, { requirePhoto: v })}
                trackColor={{ false: C.gray200, true: C.brand400 }} thumbColor={t.schedule.requirePhoto ? C.brand500 : C.gray400} />
            </View>
          </View>
        )}
      </View>
    );
  };

  const monthlyAddlTotal = config.additionalCosts.filter((a) => a.repeat === "monthly").reduce((sm, a) => sm + a.amount, 0);
  const setupTab = (
    <ScrollView style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }} contentContainerStyle={[s.body, bodyPad]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {!isConfigured(config) && (
        <View style={s.checklistCard}><Text style={s.checklistTitle}>Set up costing</Text><Text style={s.checklistSub}>Pick how you track each cost. Most shops use monthly bills + LPG per tank. Configure once; record only what’s due each day in Today.</Text></View>
      )}

      <Text style={s.sectionHeader}>Utility tracking</Text>
      {utilSetup("electricity", "Electricity", "kWh")}
      {utilSetup("water", "Water", "m³")}
      {utilSetup("lpg", "LPG", "kg")}

      <Text style={s.sectionHeader}>Fixed monthly costs</Text>
      <View style={s.setupCard}>
        <Field label="Rent" value={config.rentMonthly} onChange={(n) => setCfg({ rentMonthly: n })} />
        <Field label="Payroll" value={config.payrollMonthly} onChange={(n) => setCfg({ payrollMonthly: n })} />
        <Field label="Depreciation" value={config.depreciationMonthly} onChange={(n) => setCfg({ depreciationMonthly: n })} />
      </View>

      <Text style={s.sectionHeader}>Additional costs (monthly)</Text>
      <View style={s.setupCard}>
        {config.additionalCosts.filter((a) => a.repeat === "monthly").length === 0 && <Text style={s.help}>Internet, software, garbage, security, marketing… add them itemized instead of one lump “overhead”.</Text>}
        {config.additionalCosts.filter((a) => a.repeat === "monthly").map((a) => (
          <View key={a.id} style={s.ooRow}>
            <TextInput style={s.ooName} value={a.name} onChangeText={(v) => setCfg({ additionalCosts: config.additionalCosts.map((x) => x.id === a.id ? { ...x, name: v } : x) })} placeholder="e.g. Internet" placeholderTextColor={C.gray400} maxLength={50} />
            <View style={s.ooAmt}><Text style={s.affixSm}>₱</Text><TextInput style={s.input} value={a.amount === 0 ? "" : String(a.amount)} onChangeText={(v) => setCfg({ additionalCosts: config.additionalCosts.map((x) => x.id === a.id ? { ...x, amount: num(v) } : x) })} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.gray400} /></View>
            <TouchableOpacity onPress={() => setCfg({ additionalCosts: config.additionalCosts.filter((x) => x.id !== a.id) })} hitSlop={8}><Ionicons name="close" size={14} color={C.gray400} style={s.ooRemove} /></TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={s.addLink} onPress={() => setCfg({ additionalCosts: [...config.additionalCosts, { id: genId("ac"), name: "", amount: 0, repeat: "monthly" }] })}><Text style={s.addLinkText}>+ Add cost item</Text></TouchableOpacity>
        {monthlyAddlTotal > 0 && <Text style={s.cardHint}>{peso(monthlyAddlTotal)}/month · {peso(addlMonthlyDaily)}/day</Text>}
      </View>

      {/* Fixed/day summary */}
      <View style={s.fixedSummary}>
        <Text style={s.fixedSummaryLabel}>FIXED + RECURRING PER DAY</Text>
        <Text style={s.fixedSummaryValue}>{peso(fixed.total + addlMonthlyDaily)}<Text style={s.fixedSummaryUnit}>/day</Text></Text>
        <Text style={s.fixedSummarySub}>{peso(config.rentMonthly + config.payrollMonthly + config.depreciationMonthly + monthlyAddlTotal)} monthly ÷ {config.fixedDivisor || 30} days</Text>
      </View>

      <Text style={s.sectionHeader}>Target</Text>
      <View style={s.setupCard}><Field label="Target cost per kg" value={config.targetCostPerKilo} onChange={(n) => setCfg({ targetCostPerKilo: n })} suffix="/kg" /></View>

      <Text style={s.sectionHeader}>Advanced</Text>
      <View style={s.setupCard}>
        <Field label="Operating days per month" value={config.fixedDivisor} onChange={(n) => setCfg({ fixedDivisor: Math.min(31, Math.max(0, Math.round(n))) })} prefix="" suffix="days" placeholder="30" />
        <Text style={s.help}>Monthly costs are spread over this many days. Leave at 30 unless your shop closes on fixed days. Empty resets to 30.</Text>
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, (saving || !canManageCostingSetup) && { opacity: 0.6 }]}
        onPress={saveConfig}
        disabled={saving || !canManageCostingSetup}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color={C.white} /> : <Text style={s.primaryBtnText}>Save setup</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Reports ──
  const reportsTab = (
    <ScrollView
      style={{ flex: 1, maxWidth: 880, width: "100%", alignSelf: "center" }}
      contentContainerStyle={[s.body, bodyPad]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshReports} tintColor={C.brand500} colors={[C.brand500]} />}
    >
      <View style={s.periodRow}>
        {(["week", "month", "all"] as Period[]).map((p) => {
          const monthOrAllLabel = p === "month" ? "This Month" : "All Time";
          const periodLabel = p === "week" ? "This Week" : monthOrAllLabel;
          return (
            <TouchableOpacity key={p} style={[s.periodChip, period === p && s.periodChipActive]} onPress={() => setPeriod(p)} activeOpacity={0.8}>
              <Text style={[s.periodText, period === p && s.periodTextActive]}>{periodLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {period === "month" && (() => {
        const now = new Date();
        const monthLabel = now.toLocaleString("en-PH", { month: "long", year: "numeric" });
        const profit = summary.trueMargin;
        const isProfit = profit >= 0;
        const marginPct = summary.revenue > 0 ? (profit / summary.revenue) * 100 : 0;
        const heroColor = isProfit ? (C.success700 ?? "#15803D") : (C.error700 ?? "#B91C1C");
        const heroBg    = isProfit ? "#F0FDF4" : "#FFF1F2";
        return (
          <View style={{ backgroundColor: heroBg, borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1.5, borderColor: heroColor }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: heroColor, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>{monthLabel}</Text>
            <Text style={{ fontSize: 12, fontWeight: "700", color: heroColor, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>
              <Ionicons name={isProfit ? "checkmark" : "close"} size={12} color={heroColor} />
              {isProfit ? " Profitable" : " Operating at a loss"}
            </Text>
            <Text style={{ fontSize: 34, fontWeight: "800", color: heroColor, marginBottom: 14 }}>{isProfit ? "+" : ""}{peso(profit)}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 10, color: C.gray500, fontWeight: "600", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Revenue</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray900 }}>{peso(summary.revenue)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 10, color: C.gray500, fontWeight: "600", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Total Cost</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray900 }}>{peso(summary.totalCost)}</Text>
              </View>
              {summary.revenue > 0 && (
                <View style={{ flex: 0.7, backgroundColor: "#fff", borderRadius: 10, padding: 10, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 10, color: C.gray500, fontWeight: "600", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Margin</Text>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: heroColor }}>{marginPct.toFixed(1)}%</Text>
                </View>
              )}
            </View>
          </View>
        );
      })()}

      <View style={s.card}>
        <Text style={s.cardTitle}>{summary.count} day{summary.count !== 1 ? "s" : ""} · summary</Text>
        <Row label="Kilos washed" value={`${summary.kilos.toFixed(0)} kg`} />
        <Row label="Revenue" value={peso(summary.revenue)} />
        <Row label="Total cost" value={peso(summary.totalCost)} />
        <Row label="Avg cost / kg" value={summary.kilos > 0 ? `${peso(summary.avgCostPerKilo)}/kg` : "—"} strong />
        <Row label="Profit / kg" value={summary.kilos > 0 ? `${peso(summary.profitPerKilo)}/kg` : "—"} accent={summary.profitPerKilo >= 0 ? C.success700 : C.error700} />
        <Row label="True margin" value={peso(summary.trueMargin)} accent={summary.trueMargin >= 0 ? C.success700 : C.error700} strong />
      </View>

      <Text style={s.sectionHeader}>Cost by service unit</Text>
      {hasTrueCost ? (
        <View style={s.card}>
          <Text style={s.cardSubtitle}>True cost — operating cost split by revenue share</Text>
          {serviceTable.map((sv) => (
            <View key={sv.id} style={s.tRow}>
              <View style={s.tcName}><Text style={s.tName} numberOfLines={1}>{sv.name}</Text><Text style={s.tSub}>{peso(sv.price)}/{UNIT_LABEL[sv.unit]} · supplies {peso(sv.recipeCost)}{sv.operatingPerUnit > 0 ? ` +op ${peso(sv.operatingPerUnit)}` : ""}</Text></View>
              <Text style={s.tcNumVal}>{peso(sv.trueCost)}/{UNIT_LABEL[sv.unit]}</Text>
              <Text style={[s.tcNum2, { color: sv.trueMargin >= 0 ? C.success700 : C.error700 }]}>{sv.marginPct.toFixed(0)}%</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={s.card}>
          <View style={s.noTrueBanner}><Text style={s.noTrueTitle}>No true cost yet</Text><Text style={s.noTrueSub}>Save today’s costing to allocate operating cost per unit. Showing supplies cost only.</Text></View>
          {serviceTable.map((sv) => (
            <View key={sv.id} style={s.tRow}><View style={s.tcName}><Text style={s.tName} numberOfLines={1}>{sv.name}</Text><Text style={s.tSub}>{peso(sv.price)}/{UNIT_LABEL[sv.unit]}</Text></View><Text style={s.tcNumVal}>{peso(sv.recipeCost)}/{UNIT_LABEL[sv.unit]}</Text><Text style={s.tcNum2}>{sv.price > 0 ? `${(((sv.price - sv.recipeCost) / sv.price) * 100).toFixed(0)}%` : "—"}</Text></View>
          ))}
        </View>
      )}

      <Text style={s.sectionHeader}>Additional cost breakdown</Text>
      <View style={s.card}>
        {config.additionalCosts.length === 0 ? <Text style={s.help}>No itemized additional costs. Add them in Setup.</Text> : config.additionalCosts.map((a) => (
          <Row key={a.id} label={a.name || "Untitled"} value={`${peso(a.amount)}/mo · ${peso(a.amount / (config.fixedDivisor || 30))}/day`} />
        ))}
      </View>

      {(() => {
        const usingPeriod = branchPeriod.length > 0; const rows = usingPeriod ? branchPeriod : branchToday;
        return (
          <>
            <Text style={s.sectionHeader}>Cost per branch{usingPeriod ? "" : " (today)"}</Text>
            <View style={s.card}>
              {rows.length === 0 ? <Text style={s.help}>No branch data yet — save a daily costing.</Text> : rows.map((b) => (
                <View key={b.branchId} style={s.tRow}><View style={s.tcName}><Text style={s.tName} numberOfLines={1}>{b.branchName}</Text><Text style={s.tSub}>{b.kilos.toFixed(0)} kg · margin {peso(b.trueMargin)}</Text></View><Text style={s.tcNumVal}>{b.kilos > 0 ? `${peso(b.costPerKilo)}/kg` : "—"}</Text></View>
              ))}
            </View>
          </>
        );
      })()}

      <Text style={s.sectionHeader}>Daily history</Text>
      {reports.length === 0 ? <Text style={s.help}>Save a daily costing in Today to build history.</Text> : reports.map((rr) => {
        const over = config.targetCostPerKilo > 0 && rr.costPerKilo > config.targetCostPerKilo;
        return (
          <View key={rr.id ?? rr.date} style={s.histRow}><View style={{ flex: 1 }}><Text style={s.histDate}>{prettyDate(rr.date)}</Text><Text style={s.histMeta}>{rr.kilos.toFixed(1)} kg · cost {peso(rr.totalCost)} · margin {peso(rr.trueMargin)}</Text></View><Text style={[s.histCpk, over && { color: C.error700 }]}>{rr.kilos > 0 ? `${peso(rr.costPerKilo)}/kg` : "—"}</Text></View>
        );
      })}
    </ScrollView>
  );

  const wd = wizDraft;
  const wizardModal = (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={wizardOpen}
      transparent
      // Android's transparent+fade Modal briefly flashes an opaque black
      // window before the JS content paints — "none" skips that flash.
      animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
      onRequestClose={() => setWizardOpen(false)}
    >
      <KeyboardAvoidingView style={[s.wizBackdrop, isTablet && s.wizBackdropTablet]} behavior="padding">
        <View style={[s.wizSheet, isTablet && s.wizSheetTablet]}>
          <View style={s.wizHeader}>
            <View>
              <Text style={s.wizStep}>STEP {wizStep + 1} OF 4</Text>
              <Text style={s.wizTitle}>{["Choose costing style", "Fixed monthly costs", "Utility amounts", "Reminders"][wizStep]}</Text>
            </View>
            <TouchableOpacity onPress={() => { setWizardOpen(false); setTab("setup"); }} hitSlop={8}><Text style={s.wizStep}>Skip</Text></TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.wizBody} keyboardShouldPersistTaps="handled">
            {wizStep === 0 && (
              <>
                <Text style={s.help}>You can change any of this later in Setup.</Text>
                <TouchableOpacity style={[s.styleOpt, wizStyle === "simple" && s.styleOptActive]} onPress={() => { setWizStyle("simple"); setWizDraft((d) => applyStyle("simple", d)); }} activeOpacity={0.85}>
                  <Text style={s.styleOptTitle}>Simple · recommended</Text>
                  <Text style={s.styleOptSub}>Monthly bills for electricity & water, LPG per tank. The app estimates daily cost until a new bill arrives. Best for most shops.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.styleOpt, wizStyle === "detailed" && s.styleOptActive]} onPress={() => { setWizStyle("detailed"); setWizDraft((d) => applyStyle("detailed", d)); }} activeOpacity={0.85}>
                  <Text style={s.styleOptTitle}>Detailed</Text>
                  <Text style={s.styleOptSub}>Meter readings for electricity & water (more accurate, more daily work), LPG per tank.</Text>
                </TouchableOpacity>
              </>
            )}
            {wizStep === 1 && (
              <>
                <Field label="Rent (monthly)" value={wd.rentMonthly} onChange={(n) => setWizCfg({ rentMonthly: n })} />
                <Field label="Payroll (monthly)" value={wd.payrollMonthly} onChange={(n) => setWizCfg({ payrollMonthly: n })} />
                <Field label="Depreciation (monthly)" value={wd.depreciationMonthly} onChange={(n) => setWizCfg({ depreciationMonthly: n })} />
                <Text style={s.help}>Spread over {wd.fixedDivisor} days → {peso((wd.rentMonthly + wd.payrollMonthly + wd.depreciationMonthly) / (wd.fixedDivisor || 30))}/day.</Text>
              </>
            )}
            {wizStep === 2 && (
              <>
                {([["electricity", "Electricity", "kWh"], ["water", "Water", "m³"], ["lpg", "LPG", "kg"]] as [UtilKey, string, string][]).map(([key, label, u]) => {
                  const t = wd[key];
                  return (
                    <View key={key} style={{ marginBottom: SP._12 }}>
                      {t.method === "bill" && <Field label={`${label} — monthly bill`} value={t.monthlyBill} onChange={(n) => setWizUtil(key, { monthlyBill: n })} />}
                      {t.method === "meter" && <Field label={`${label} — rate (₱ per ${u})`} value={t.rate} onChange={(n) => setWizUtil(key, { rate: n })} prefix="" suffix={`₱/${u}`} placeholder="0.00" />}
                      {t.method === "tank" && <Field label={`${label} — cost per tank`} value={t.tankCost} onChange={(n) => setWizUtil(key, { tankCost: n })} />}
                      {t.method === "amount" && <Text style={s.help}>{label}: entered manually each day.</Text>}
                    </View>
                  );
                })}
                <Field label="Target cost per kg (optional)" value={wd.targetCostPerKilo} onChange={(n) => setWizCfg({ targetCostPerKilo: n })} suffix="/kg" />
              </>
            )}
            {wizStep === 3 && (
              <>
                <View style={s.schedToggle}>
                  <View style={{ flex: 1 }}><Text style={s.schedTitle}>Create reminder tasks</Text><Text style={s.schedSub}>Who should update these costs gets a Task automatically.</Text></View>
                  <Switch value={wizRemind} onValueChange={setWizRemind} trackColor={{ false: C.gray200, true: C.brand400 }} thumbColor={wizRemind ? C.brand500 : C.gray400} />
                </View>
                {wizRemind && (
                  <>
                    <Text style={s.miniLabel}>Assign to</Text>
                    <View style={s.miniRow}>
                      {([["OWNER", "Owner"], ["STAFF", "Staff"], ["EVERYONE", "Everyone"]] as [ReminderAssign, string][]).map(([v, lbl]) => (
                        <TouchableOpacity key={v} style={[s.miniChip, wizAssign === v && s.miniChipActive]} onPress={() => setWizAssign(v)} activeOpacity={0.8}>
                          <Text style={[s.miniChipText, wizAssign === v && s.miniChipTextActive]}>{lbl}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={s.miniLabel}>Reminder time</Text>
                    <TimeField value={wizTime} onChange={setWizTime} />
                    <Text style={[s.help, { marginTop: SP._10 }]}>We’ll create tasks like “Record electricity bill” and “Count LPG tank count”, assigned to {wizAssign.toLowerCase()}.</Text>
                  </>
                )}
              </>
            )}
          </ScrollView>

          <View style={[s.wizFooter, { paddingBottom: insets.bottom + SP._16 }]}>
            {wizStep > 0 && <TouchableOpacity style={s.wizBack} onPress={() => setWizStep((x) => x - 1)} activeOpacity={0.8}><Text style={s.wizBackText}>Back</Text></TouchableOpacity>}
            {wizStep < 3
              ? <TouchableOpacity style={s.wizNext} onPress={() => setWizStep((x) => x + 1)} activeOpacity={0.85}><Text style={s.wizNextText}>Next</Text></TouchableOpacity>
              : <TouchableOpacity style={[s.wizNext, (saving || !canManageCostingSetup) && { opacity: 0.6 }]} onPress={finishWizard} disabled={saving || !canManageCostingSetup} activeOpacity={0.85}>{saving ? <ActivityIndicator color={C.white} /> : <Text style={s.wizNextText}>Finish setup</Text>}</TouchableOpacity>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const branchName = branches.find((b) => b.id === selectedBranchId)?.name ?? "Costing";
  const effectiveTab: Tab = (tab === "setup" && !canManageCostingSetup) || (tab === "reports" && !showMargin) ? "today" : tab;
  const setupOrReportsTab = effectiveTab === "setup" ? setupTab : reportsTab;
  const activeTabContent = effectiveTab === "today" ? todayTab : setupOrReportsTab;
  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <TopBar title={branchName} onBack={() => { setBranchView("picker"); setSelectedBranchId(null); }} />
      <View style={s.segmentBar}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
          <Segments
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: "today", label: "Today" },
              // Setup edits config; Reports is profit-centric — both permission-gated.
              ...(canManageCostingSetup ? [{ value: "setup", label: "Setup" }] : []),
              ...(showMargin ? [{ value: "reports", label: "Reports" }] : []),
            ]}
          />
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {loading ? <View style={s.loadingBox}><ActivityIndicator color={C.brand500} size="large" /></View> : activeTabContent}
      </KeyboardAvoidingView>
      {wizardModal}
    </SafeAreaView>
  );
}

