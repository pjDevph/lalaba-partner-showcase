// app/(tabs)/sales.tsx
// Sales Report — tabs (Overview / Transactions / Payments / Services), 6 KPIs,
// report basis selector, compact header, landscape-safe max-width layout.

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, ActivityIndicator, RefreshControl,
  TouchableOpacity, useWindowDimensions,
} from "react-native";
import { writeAsStringAsync, EncodingType, cacheDirectory } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { SafeAreaView } from "react-native-safe-area-context";
import { gqlMyOrders } from "../../src/services/graphql/orders";
import { gqlAssertReportExport } from "../../src/services/graphql/analytics";
import { useAuthStore } from "../../src/stores/authStore";
import { useCan } from "../../src/hooks/usePermission";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { C, SP } from "../../src/theme/tokens";
import { Card, TopBar } from "../../src/components/ui";
import { S } from "../../src/screens/sales/styles";
import {
  STATUS_MAP, getPeriodRange, computeSummary, computePayments, computeServices, fc,
  type Period, type ReportBasis, type ReportTab, type SaleOrder,
} from "../../src/screens/sales/model";
import {
  IcoExport, OverviewTab, TransactionsTab, PaymentsTab, ServicesTab, ExportModal,
} from "../../src/screens/sales/components";
import { CustomDateRangeModal, formatRangeLabel } from "../../src/components/CustomDateRangeModal";
import { AvatarMenu } from "../../src/screens/dashboard/AvatarMenu";

// ─── Types ────────────────────────────────────────────────────────────────────


export default function SalesScreen() {
  const router  = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const merchantId              = useAuthStore((s) => s.merchantId);
  const user                    = useAuthStore((s) => s.user);
  const role                    = useAuthStore((s) => s.role);
  const activeBranchId          = useAuthStore((s) => s.activeBranchId);
  const activeBranchName        = useAuthStore((s) => s.activeBranchName);
  const avatarInitials          = (user?.displayName?.trim()?.[0] ?? "M").toUpperCase();
  const canExportReports        = useCan("canExportReports");
  const dashboardFilterBranchId = useMerchantStore((s) => s.dashboardFilterBranchId);
  const setDashboardFilterBranch  = useMerchantStore((s) => s.setDashboardFilterBranch);
  const seedDashboardFilterBranch = useMerchantStore((s) => s.seedDashboardFilterBranch);
  const selectedBranchId          = useMerchantStore((s) => s.selectedBranchId);
  // Staff see reports for the branch they selected in the header switcher only.
  // Merchant is an admin — keep their existing dashboard branch filter (all/any).
  const reportBranchId          = role === "MERCHANT" ? dashboardFilterBranchId : activeBranchId;
  const branches                = useMerchantStore((s) => s.branches);
  const profile                 = useMerchantStore((s) => s.profile);

  const [period, setPeriod]   = useState<Period>("week");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [basis, setBasis]     = useState<ReportBasis>("all");
  const [activeTab, setTab]   = useState<ReportTab>("overview");
  const [orders, setOrders]   = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting]           = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const selectedBranchName = role === "MERCHANT"
    ? (dashboardFilterBranchId ? (branches.find(b => b.id === dashboardFilterBranchId)?.name ?? null) : null)
    : activeBranchName;

  // Default the report to the branch the owner is currently working in rather
  // than silently to "All Branches". Only until they pick a scope themselves —
  // after that their choice sticks for the session.
  useEffect(() => {
    if (role !== "MERCHANT" || !selectedBranchId) return;
    seedDashboardFilterBranch(selectedBranchId);
  }, [role, selectedBranchId, seedDashboardFilterBranch]);

  const fetchOrders = useCallback(async (opts?: { silent?: boolean }) => {
    if (!merchantId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const [start, end] = getPeriodRange(period, customRange);
      const dateFrom = start.toISOString();
      const dateTo   = end.toISOString();
      const branchId = reportBranchId ?? undefined;

      const raw = await gqlMyOrders({ limit: 500, dateFrom, dateTo, branchId });

      const data: SaleOrder[] = raw.map(o => {
        const paidTx      = (o.transactions ?? []).filter(t => ["completed", "add_on"].includes((t.status ?? "").toLowerCase()));
        const refundedTx  = (o.transactions ?? []).filter(t => (t.status ?? "").toLowerCase() === "refunded");
        const amountPaid  = paidTx.reduce((s, t) => s + t.amountPaid, 0) - refundedTx.reduce((s, t) => s + t.amountPaid, 0);
        const paymentMethod = paidTx.length > 1 ? "split" : (paidTx[0]?.paymentMethod ?? null);
        return {
          id:             o._id,
          claimCode:      o.claimCode ?? o._id.slice(-4).toUpperCase(),
          customerName:   o.customerName ?? "Walk-in",
          total:          o.totalAmount,
          subtotal:       o.subtotal,
          amountReceived: Math.max(0, amountPaid),
          discountAmount: o.discountValue ?? 0,
          discountCode:   null,
          status:         ((o.paymentStatus ?? "").toLowerCase() === "refunded"
            ? "CANCELLED"
            : STATUS_MAP[o.laundryStatus] ?? "CREATED") as SaleOrder["status"],
          paymentStatus:  (o.paymentStatus ?? "unpaid").toLowerCase(),
          createdAt:      o.createdAt ? new Date(o.createdAt) : new Date(),
          cancelledAt:    null,
          branchId:       o.branchId ?? null,
          paymentMethod,
          txList:         paidTx.map(t => ({ paymentMethod: t.paymentMethod, amountPaid: t.amountPaid })),
          items: (o.items ?? []).map(i => ({
            serviceName: i.serviceName ?? "",
            unitPrice:   i.unitPrice,
            weightKg:    i.quantity,
          })),
        };
      });
      setOrders(data);
    } catch (err) {
      console.warn("Sales fetch error:", err);
      setOrders([]);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load sales data." });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [merchantId, period, customRange, reportBranchId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders({ silent: true });
    setRefreshing(false);
  }, [fetchOrders]);

  const summary  = computeSummary(orders, basis);
  const services = computeServices(summary.basisOrders);
  const payments = computePayments(summary.basisOrders);

  const nonClaimedBasisLabel = basis === "excl_cancelled" ? "Excl. Cancelled" : "All Orders";
  const basisLabel = basis === "claimed" ? "Completed Only" : nonClaimedBasisLabel;

  const periodLabel = (() => {
    const now = new Date();
    if (period === "custom" && customRange) return formatRangeLabel(customRange.from, customRange.to);
    if (period === "today") return `Today, ${now.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
    if (period === "week")  return `Last 7 days ending ${now.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
    return now.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  })();

  // ── CSV export (logic unchanged, triggered from modal) ────────────────────
  const exportCSV = useCallback(async () => {
    if (orders.length === 0 || !canExportReports) return;
    setExporting(true);
    setShowExportModal(false);
    try {
      // Server-side permission gate — export cannot proceed without it.
      await gqlAssertReportExport();
      const labelMap: Record<string, string> = { today: "Today", week: "Last 7 Days", month: "This Month" };
      const periodLbl    = period === "custom" && customRange ? periodLabel : (labelMap[period] ?? period);
      const now          = new Date();
      const generatedAt  =
        now.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) + " – " +
        now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
      const businessName = profile?.businessName ?? "Lalaba Merchant";
      const branchLabel  = selectedBranchName ?? "All Branches";

      const csvSummary     = computeSummary(orders, basis);
      const csvBasisOrders = csvSummary.basisOrders;
      const claimedOrds    = csvBasisOrders.filter(o => o.status === "CLAIMED");
      const totalSales     = csvSummary.grossSales;
      const avgOrd         = csvSummary.avgOrder;

      const payBreak: Record<string, { amount: number; count: number }> = {};
      csvBasisOrders.filter(o => o.paymentStatus !== "refunded" && o.status !== "CANCELLED").forEach(o => {
        const txs = o.txList.length > 0 ? o.txList : [{ paymentMethod: o.paymentMethod, amountPaid: o.amountReceived }];
        const seen = new Set<string>();
        txs.forEach(tx => {
          const pm = tx.paymentMethod ?? "Unknown";
          if (!payBreak[pm]) payBreak[pm] = { amount: 0, count: 0 };
          payBreak[pm].amount += tx.amountPaid;
          if (!seen.has(pm)) { seen.add(pm); payBreak[pm].count++; }
        });
      });

      const branchBreak: { name: string; amount: number; count: number }[] = [];
      if (!selectedBranchName) {
        const byBranch: Record<string, { amount: number; count: number }> = {};
        csvBasisOrders.filter(o => o.paymentStatus !== "refunded" && o.status !== "CANCELLED").forEach(o => {
          const bid = o.branchId ?? "__none__";
          if (!byBranch[bid]) byBranch[bid] = { amount: 0, count: 0 };
          byBranch[bid].amount += o.total;
          byBranch[bid].count++;
        });
        Object.entries(byBranch).forEach(([bid, st]) => {
          branchBreak.push({ name: bid === "__none__" ? "Unassigned" : (branches.find(b => b.id === bid)?.name ?? bid), ...st });
        });
        branchBreak.sort((a, b) => b.amount - a.amount);
      }

      const q    = (s: string | number | null | undefined) => `"${String(s ?? "").replace(/"/g, '""')}"`;
      const rows: string[][] = [];

      rows.push([businessName]);
      rows.push(["Sales Report"]);
      rows.push([]);
      rows.push(["Branch:", branchLabel]);
      rows.push(["Date Range:", periodLbl]);
      rows.push(["Generated:", generatedAt]);
      rows.push([]);
      rows.push(["── SUMMARY ──"]);
      rows.push(["Gross Sales:", `₱${totalSales.toFixed(2)}`]);
      rows.push(["Collected:", `₱${csvSummary.collected.toFixed(2)}`]);
      rows.push(["Cancelled:", `₱${csvSummary.cancelledValue.toFixed(2)}`, `${csvSummary.cancelledCount} orders`]);
      rows.push(["Total Orders (basis):", String(csvBasisOrders.length)]);
      rows.push(["Claimed Orders:", String(claimedOrds.length)]);
      rows.push(["Avg Order Value:", `₱${avgOrd.toFixed(2)}`]);
      rows.push([]);
      rows.push(["── PAYMENT BREAKDOWN ──"]);
      Object.entries(payBreak).forEach(([method, st]) => rows.push([method, `₱${st.amount.toFixed(2)}`, `${st.count} orders`]));
      if (Object.keys(payBreak).length === 0) rows.push(["No claimed orders"]);
      rows.push([]);
      if (branchBreak.length > 0) {
        rows.push(["── BRANCH BREAKDOWN ──"]);
        branchBreak.forEach(b => rows.push([b.name, `₱${b.amount.toFixed(2)}`, `${b.count} orders`]));
        rows.push([]);
      }
      const branchCol = selectedBranchName ? [] : ["Branch"];
      rows.push(["Order ID", ...branchCol, "Claim Code", "Customer", "Date", "Time",
        "Services", "Total Qty (kg)", "Subtotal (PHP)", "Discount (PHP)", "Discount Code",
        "Total (PHP)", "Collected (PHP)", "Payment", "Status"]);
      csvBasisOrders.forEach(o => {
        const bName    = o.branchId ? (branches.find(b => b.id === o.branchId)?.name ?? o.branchId) : "";
        const totalQty = o.items.reduce((s, i) => s + (i.weightKg ?? 0), 0);
        const svcStr   = o.items.map(i => `${i.serviceName} x${i.weightKg}kg`).join("; ");
        rows.push([
          o.id,
          ...(selectedBranchName ? [] : [bName]),
          o.claimCode,
          o.customerName,
          o.createdAt.toLocaleDateString("en-PH"),
          o.createdAt.toLocaleTimeString("en-PH", { hour12: true }),
          svcStr,
          String(totalQty),
          o.subtotal.toFixed(2),
          o.discountAmount.toFixed(2),
          o.discountCode ?? "",
          o.total.toFixed(2),
          o.amountReceived.toFixed(2),
          o.paymentMethod ?? "—",
          o.status,
        ]);
      });

      const csv      = rows.map(r => r.map(c => q(c)).join(",")).join("\r\n");
      const bSuffix  = selectedBranchName ? `_${selectedBranchName.replace(/\s+/g, "")}` : "";
      const pKey     = period === "custom" ? "CustomRange" : (labelMap[period] ?? period).replace(/\s+/g, "");
      const fileName = `Lalaba_Sales_${pKey}${bSuffix}_${Date.now()}.csv`;
      const filePath = `${cacheDirectory}${fileName}`;

      await writeAsStringAsync(filePath, csv, { encoding: EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
          dialogTitle: `Export ${periodLbl} Sales`,
        });
      } else {
        useNotificationStore.getState().push({ type: "success", title: "Exported", message: `File saved: ${filePath}` });
      }
    } catch (err) {
      console.error("CSV export failed:", err);
      useNotificationStore.getState().push({ type: "error", title: "Export failed", message: "Could not export the data. Please try again." });
    } finally {
      setExporting(false);
    }
  }, [orders, basis, period, customRange, periodLabel, selectedBranchName, branches, profile, canExportReports]);

  // ── Excel export ──────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    if (orders.length === 0 || !canExportReports) return;
    setExporting(true);
    setShowExportModal(false);
    try {
      // Server-side permission gate — export cannot proceed without it.
      await gqlAssertReportExport();
      const labelMap: Record<string, string> = { today: "Today", week: "Last 7 Days", month: "This Month" };
      const periodLbl    = period === "custom" && customRange ? periodLabel : (labelMap[period] ?? period);
      const now          = new Date();
      const generatedAt  =
        now.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) + " – " +
        now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
      const businessName = profile?.businessName ?? "Lalaba Merchant";
      const branchLbl    = selectedBranchName ?? "All Branches";

      const csvSummary     = computeSummary(orders, basis);
      const csvBasisOrders = csvSummary.basisOrders;

      const rows: (string | number | null)[][] = [];
      rows.push([businessName]);
      rows.push(["Sales Report"]);
      rows.push([]);
      rows.push(["Branch:", branchLbl]);
      rows.push(["Date Range:", periodLbl]);
      rows.push(["Generated:", generatedAt]);
      rows.push([]);
      rows.push(["SUMMARY"]);
      rows.push(["Gross Sales", csvSummary.grossSales]);
      rows.push(["Collected", csvSummary.collected]);
      rows.push(["Cancelled", csvSummary.cancelledValue, `${csvSummary.cancelledCount} orders`]);
      rows.push(["Total Orders (basis)", csvBasisOrders.length]);
      rows.push(["Avg Order Value", csvSummary.avgOrder]);
      rows.push([]);

      const payBreak: Record<string, { amount: number; count: number }> = {};
      csvBasisOrders
        .filter(o => o.paymentStatus !== "refunded" && o.status !== "CANCELLED")
        .forEach(o => {
          const txs = o.txList.length > 0 ? o.txList : [{ paymentMethod: o.paymentMethod, amountPaid: o.amountReceived }];
          const seen = new Set<string>();
          txs.forEach(tx => {
            const pm = tx.paymentMethod ?? "Unknown";
            if (!payBreak[pm]) payBreak[pm] = { amount: 0, count: 0 };
            payBreak[pm].amount += tx.amountPaid;
            if (!seen.has(pm)) { seen.add(pm); payBreak[pm].count++; }
          });
        });
      if (Object.keys(payBreak).length > 0) {
        rows.push(["PAYMENT BREAKDOWN"]);
        Object.entries(payBreak).forEach(([method, st]) => rows.push([method, st.amount, `${st.count} orders`]));
        rows.push([]);
      }

      const branchCol = selectedBranchName ? [] : ["Branch"];
      rows.push(["Order ID", ...branchCol, "Claim Code", "Customer", "Date", "Time",
        "Services", "Total Qty (kg)", "Subtotal (PHP)", "Discount (PHP)",
        "Total (PHP)", "Collected (PHP)", "Payment", "Status"]);
      csvBasisOrders.forEach(o => {
        const bName    = o.branchId ? (branches.find(b => b.id === o.branchId)?.name ?? o.branchId) : "";
        const totalQty = o.items.reduce((s, i) => s + (i.weightKg ?? 0), 0);
        const svcStr   = o.items.map(i => `${i.serviceName} x${i.weightKg}kg`).join("; ");
        rows.push([
          o.id,
          ...(selectedBranchName ? [] : [bName]),
          o.claimCode, o.customerName,
          o.createdAt.toLocaleDateString("en-PH"),
          o.createdAt.toLocaleTimeString("en-PH", { hour12: true }),
          svcStr, totalQty, o.subtotal, o.discountAmount,
          o.total, o.amountReceived,
          o.paymentMethod ?? "—", o.status,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
      const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      const pKey     = periodLbl.replace(/\s+/g, "");
      const bSuffix  = selectedBranchName ? `_${selectedBranchName.replace(/\s+/g, "")}` : "";
      const fileName = `Lalaba_Sales_${pKey}${bSuffix}_${Date.now()}.xlsx`;
      const filePath = `${cacheDirectory}${fileName}`;

      await writeAsStringAsync(filePath, base64, { encoding: EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          UTI: "com.microsoft.excel.xlsx",
          dialogTitle: `Export ${periodLbl} Sales`,
        });
      } else {
        useNotificationStore.getState().push({ type: "success", title: "Exported", message: `File saved: ${filePath}` });
      }
    } catch (err) {
      console.error("Excel export failed:", err);
      useNotificationStore.getState().push({ type: "error", title: "Export failed", message: "Could not export the Excel file. Please try again." });
    } finally {
      setExporting(false);
    }
  }, [orders, basis, period, customRange, periodLabel, selectedBranchName, branches, profile, canExportReports]);

  const handleExport = useCallback((format: "csv" | "excel") => {
    if (format === "excel") exportExcel();
    else exportCSV();
  }, [exportCSV, exportExcel]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.safe} edges={["top"]}>
      {/* Uniform blue header — same TopBar (blue) the other screens use. */}
      <TopBar
        blue
        title="Sales Report"
        subtitle={`${selectedBranchName ?? (branches.length > 1 ? "All Branches" : "Main Branch")} · ${periodLabel}`}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._10 }}>
            <TouchableOpacity
              onPress={() => setShowExportModal(true)}
              style={[S.exportIconBtn, (exporting || orders.length === 0 || !canExportReports) && { opacity: 0.45 }]}
              activeOpacity={0.75}
              disabled={exporting || orders.length === 0 || !canExportReports}
            >
              {exporting
                ? <ActivityIndicator size="small" color={C.white} />
                : <>
                    <IcoExport />
                    {width >= 600 && <Text style={S.exportLabel}>Export</Text>}
                  </>
              }
            </TouchableOpacity>
            {/* Landscape: inline avatar next to Export (Export | Avatar). The
                global corner avatar is suppressed on this route to avoid overlap. */}
            {isLandscape && (
              <>
                <View style={{ width: 1, height: 24, backgroundColor: "rgba(255,255,255,0.3)" }} />
                <AvatarMenu initials={avatarInitials} />
              </>
            )}
          </View>
        }
      />

      {/* Filter bar: period + basis */}
      <View style={S.filterBar}>
        <View style={{ maxWidth: 880, width: "100%", alignSelf: "center", gap: SP._8 }}>
          {/* Period row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Text style={S.filterRowLabel}>Period</Text>
            <View style={[S.pillRow, { flex: 1 }]}>
              {([ ["today", "Today"], ["week", "7 Days"], ["month", "Month"] ] as [Period, string][]).map(([v, l]) => (
                <TouchableOpacity key={v} style={[S.pill, period === v && S.pillActive]} onPress={() => setPeriod(v)} activeOpacity={0.75}>
                  <Text style={[S.pillText, period === v && S.pillTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[S.pill, period === "custom" && S.pillActive, { maxWidth: 140 }]}
                onPress={() => setCustomModalOpen(true)}
                activeOpacity={0.75}
              >
                <Text style={[S.pillText, period === "custom" && S.pillTextActive]} numberOfLines={1}>
                  {period === "custom" && customRange ? formatRangeLabel(customRange.from, customRange.to) : "Custom"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Branch row — owners with several branches scope the report here.
              Everyone else is implicitly scoped to their one branch. */}
          {role === "MERCHANT" && branches.length > 1 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
              <Text style={S.filterRowLabel}>Branch</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SP._6 }}
                style={{ flex: 1 }}
              >
                {([[null, "All Branches"], ...branches.map((b) => [b.id, b.name] as const)] as [string | null, string][])
                  .map(([id, label]) => (
                    <TouchableOpacity
                      key={id ?? "__all__"}
                      style={[S.basisPill, dashboardFilterBranchId === id && S.basisPillActive]}
                      onPress={() => setDashboardFilterBranch(id)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[S.basisPillText, dashboardFilterBranchId === id && S.basisPillTextActive]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}

          {/* Status row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
            <Text style={S.filterRowLabel}>Status</Text>
            <View style={[S.pillRow, { flex: 1 }]}>
              {([ ["all", "All"], ["claimed", "Completed"], ["excl_cancelled", "Excl. Cancelled"] ] as [ReportBasis, string][]).map(([v, l]) => (
                <TouchableOpacity key={v} style={[S.basisPill, basis === v && S.basisPillActive]} onPress={() => setBasis(v)} activeOpacity={0.75}>
                  <Text style={[S.basisPillText, basis === v && S.basisPillTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: C.gray100 }}
        contentContainerStyle={[S.content, { alignItems: "center" }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} />}
      >
        <View style={{ width: "100%", maxWidth: 880, gap: SP._14 }}>
          {loading ? (
            <View style={S.loadingBox}>
              <ActivityIndicator color={C.brand500} size="large" />
            </View>
          ) : (
            <>
              {/* 6 KPI cards — 2 per row, ordered by owner priority */}
              <View style={S.kpiGrid}>
                {[
                  { label: "Gross Sales",    value: fc(summary.grossSales),    color: C.brand500,   sub: "Total order value" },
                  { label: "Collected",      value: fc(summary.collected),     color: "#15803D",    sub: "Payments received" },
                  { label: "Unpaid Balance", value: fc(summary.unpaidBalance), color: C.warning600, sub: "Still receivable" },
                  { label: "Orders",         value: String(summary.orderCount),color: C.gray900,    sub: "In this period" },
                  { label: "Avg Order",      value: fc(summary.avgOrder),      color: C.gray900,    sub: "Per order" },
                  { label: "Cancelled",      value: fc(summary.cancelledValue),color: C.error500,   sub: `${summary.cancelledCount} order${summary.cancelledCount !== 1 ? "s" : ""}` },
                ].map(k => (
                  <Card key={k.label} padding={12} style={S.kpiCard}>
                    <Text style={S.kpiLabel}>{k.label}</Text>
                    <Text style={[S.kpiValue, { color: k.color }]}>{k.value}</Text>
                    <Text style={S.kpiSub}>{k.sub}</Text>
                  </Card>
                ))}
              </View>

              {/* Tab bar */}
              <View style={S.tabBar}>
                {([ ["overview", "Overview"], ["transactions", "Transactions"], ["payments", "Payments"], ["services", "Services"] ] as [ReportTab, string][]).map(([v, l]) => (
                  <TouchableOpacity key={v} style={[S.tab, activeTab === v && S.tabActive]} onPress={() => setTab(v)} activeOpacity={0.75}>
                    <Text style={[S.tabText, activeTab === v && S.tabTextActive]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Tab content */}
              {activeTab === "overview" && (
                <OverviewTab services={services} payments={payments} />
              )}
              {activeTab === "transactions" && (
                <TransactionsTab orders={summary.basisOrders} branches={branches} dashboardFilterBranchId={dashboardFilterBranchId} />
              )}
              {activeTab === "payments" && (
                <PaymentsTab payments={payments} unpaidBalance={summary.unpaidBalance} />
              )}
              {activeTab === "services" && (
                <ServicesTab services={services} />
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ExportModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        orderCount={orders.length}
        periodLabel={periodLabel}
        branchLabel={selectedBranchName ?? "All Branches"}
        basisLabel={basisLabel}
        exporting={exporting}
      />

      <CustomDateRangeModal
        visible={customModalOpen}
        initialFrom={customRange?.from}
        initialTo={customRange?.to}
        onApply={(from, to) => { setCustomRange({ from, to }); setPeriod("custom"); setCustomModalOpen(false); }}
        onClose={() => setCustomModalOpen(false)}
      />

      {/* <TourOverlay tourId="sales" /> */}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

