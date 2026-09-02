// Transaction history screen (orders list + filters + detail) — extracted from settings.tsx.
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, ActivityIndicator, Share } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import { C, SP } from "../../theme/tokens";
import { HeroHeader } from "../../components/ui";
import { CustomDateRangeModal, formatRangeLabel } from "../../components/CustomDateRangeModal";
import { gqlMyOrders, type GqlOrder } from "../../services/graphql/orders";
import { gqlOrderToPOS } from "../../services/queueService";
import { OrderDetailSheet } from "../../components/pos/OrderDetailSheet";
import type { POSOrder, CreatePOSOrderResponse } from "../../types/pos.types";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { usePrinterStore } from "../../stores/printerStore";
import { useReceiptImageCapture } from "../../hooks/useReceiptImageCapture";
import { useFontScale } from "../../../app/_layout";
import { I } from "./shared";
import { S, TH } from "./styles";
import { toUserMessage } from "../../utils/userError";

const TX_PAGE = 50;
const TX_PAY_METHODS = ["cash", "gcash", "maya", "card", "qph", "bank_transfer"] as const;
const TX_PAY_LABELS: Record<string, string> = {
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qph: "QPH", bank_transfer: "Bank Transfer",
};
const TX_STATUS_LABEL: Record<string, string> = {
  pending: "Created", in_progress: "Processing", ready: "Ready",
  completed: "Claimed", claimed: "Claimed", cancelled: "Cancelled", void: "Void",
  refunded: "Refunded",
};
const TX_STATUS_COLOR: Record<string, string> = {
  pending: C.warning500, in_progress: C.info500, ready: C.brand500,
  completed: C.success500, claimed: C.success500, cancelled: C.gray400, void: C.gray400,
  refunded: C.error500,
};
const TX_STATUS_BG: Record<string, string> = {
  pending: C.warning100, in_progress: C.info100, ready: C.brand100,
  completed: C.success100, claimed: C.success100, cancelled: C.gray100, void: C.gray100,
  refunded: C.error100,
};

export function TransactionHistoryScreenInline({ onBack }: Readonly<{ onBack: () => void }>) {
  const branchId         = useAuthStore((s) => s.branchId);
  const role             = useAuthStore((s) => s.role);
  const activeBranchId   = useAuthStore((s) => s.activeBranchId);
  const userName         = useAuthStore((s) => s.user?.displayName ?? "Merchant");
  const fs               = useFontScale();
  const insets           = useSafeAreaInsets();
  const merchant         = useMerchantStore((s) => s.profile);
  const branches         = useMerchantStore((s) => s.branches);
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const printerStore     = usePrinterStore();

  const [orders, setOrders]           = useState<GqlOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [exporting, setExporting]     = useState(false);
  const [search, setSearch]           = useState("");
  const [period, setPeriod]           = useState<"today" | "7d" | "30d" | "custom">("7d");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | null>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [payFilters, setPayFilters]     = useState<string[]>([]);
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [selectedTx, setSelectedTx]   = useState<{ pos: POSOrder; gql: GqlOrder } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const { captureReceipt, hiddenReceipt } = useReceiptImageCapture();
  const offsetRef = useRef(0);

  // MERCHANT: all branches by default (BE scopes by merchantId from JWT),
  // optional branch filter. STAFF: the branch they are working, which their
  // approved device pins — the same branch the backend scopes them to.
  const txBranchId: string | undefined =
    role === "MERCHANT"
      ? (branchFilter ?? undefined)
      : (activeBranchId ?? branchId ?? undefined);

  const canFilterBranch = role === "MERCHANT" && branches.length > 1;
  const branchFilterLabel = branchFilter
    ? (branches.find(b => b.id === branchFilter)?.name ?? "Branch")
    : "All Branches";

  const [dateFrom, dateTo] = useMemo((): [string, string | undefined] => {
    if (period === "custom" && customRange) {
      return [customRange.from.toISOString(), customRange.to.toISOString()];
    }
    if (period === "today") {
      const d = new Date(); d.setHours(0, 0, 0, 0); return [d.toISOString(), undefined];
    }
    const daysCount = period === "7d" ? 7 : 30;
    return [new Date(Date.now() - daysCount * 86_400_000).toISOString(), undefined];
  }, [period, customRange]);

  const fetchPage = useCallback(async (offset: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const page = await gqlMyOrders({
        branchId: txBranchId,
        dateFrom,
        dateTo,
        limit: TX_PAGE,
        offset,
      });
      // Keep only orders that were ever paid (paid = retained, refunded = returned)
      const txPage = page.filter(o => o.paymentStatus === "paid" || o.paymentStatus === "refunded");
      setOrders(prev => replace ? txPage : [...prev, ...txPage]);
      setHasMore(page.length === TX_PAGE);
      offsetRef.current = offset + page.length;
    } catch {
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load transactions." });
    } finally {
      if (replace) setLoading(false); else setLoadingMore(false);
    }
  }, [txBranchId, dateFrom, dateTo]);

  useEffect(() => {
    offsetRef.current = 0;
    void fetchPage(0, true);
  }, [fetchPage]);

  const togglePayFilter = (m: string) => {
    setPayFilters(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const payFilterLabel =
    payFilters.length === 0 ? "All Methods" :
    payFilters.length === 1 ? TX_PAY_LABELS[payFilters[0]] :
    `${payFilters.length} methods`;

  const filtered = useMemo(() => {
    let result = orders;
    if (payFilters.length > 0) {
      result = result.filter(o =>
        o.transactions?.some(t => !!t.paymentMethod && payFilters.includes(t.paymentMethod.toLowerCase()))
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(o =>
        o.claimCode.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, search, payFilters]);

  const totalValue = useMemo(() =>
    filtered.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0),
  [filtered]);

  const peso = (n: number) =>
    `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const exportCSV = async () => {
    setExporting(true);
    try {
      const withBranch = canFilterBranch && !branchFilter;
      const header = withBranch
        ? "Claim Code,Customer,Branch,Date,Total,Payment Method,Status\n"
        : "Claim Code,Customer,Date,Total,Payment Method,Status\n";
      const rows = filtered.map(o => {
        const method = o.transactions?.[0]?.paymentMethod ?? "";
        const date   = o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-PH") : "";
        const name   = (o.customerName ?? "Walk-in").replace(/,/g, " ");
        const bCol   = withBranch
          ? `,${(branches.find(b => b.id === o.branchId)?.name ?? "").replace(/,/g, " ")}`
          : "";
        return `${o.claimCode},${name}${bCol},${date},${o.totalAmount.toFixed(2)},${method},${o.laundryStatus}`;
      }).join("\n");
      await Share.share({ message: header + rows, title: "Lalaba Transactions" });
    } catch {
      useNotificationStore.getState().push({ type: "error", title: "Export failed", message: "Could not export transactions." });
    } finally {
      setExporting(false);
    }
  };

  const onEndReached = () => {
    if (!hasMore || loadingMore || loading || search.trim() || payFilters.length > 0) return;
    void fetchPage(offsetRef.current, false);
  };

  const buildTxReceiptOpts = () => {
    if (!selectedTx) return null;
    const { pos: order, gql } = selectedTx;
    const branch = branches.find((b) => b.id === selectedBranchId);
    const orderResp: CreatePOSOrderResponse = {
      orderId: order.id, claimCode: order.claimCode,
      totalAmount: order.totalAmount, amountReceived: order.amountReceived ?? 0,
      changeGiven: order.changeGiven, paymentMethod: order.paymentMethod ?? "cash", status: "CREATED",
    };
    return {
      order: orderResp,
      orderFull: gql,
      copyType: "both" as const,
      cashierName: userName,
      businessName: printerStore.businessName || merchant?.businessName || "LALABA LAUNDRY",
      businessAddress: printerStore.businessAddress,
      businessPhone: printerStore.businessPhone,
      branchName: branch?.name ?? "",
      paperWidth: printerStore.paperWidth,
      documentLabel: printerStore.documentLabel,
      customerCopyLabel: printerStore.customerCopyLabel,
      merchantCopyLabel: printerStore.merchantCopyLabel,
      footerText: printerStore.footerText,
      claimCodeSize: printerStore.claimCodeSize,
      showClaimCodeOnMerchant: printerStore.showClaimCodeOnMerchant,
      showCustomerPhone: printerStore.showCustomerPhone,
      showCashierName: printerStore.showCashierName,
      showBranchName: printerStore.showBranchName,
      showPickupInstructions: printerStore.showPickupInstructions,
      taxModeEnabled: printerStore.taxModeEnabled,
      paymentMethod: order.paymentMethod,
      amountReceived: order.amountReceived,
    };
  };

  const handleDownload = async () => {
    const opts = buildTxReceiptOpts();
    if (!opts) return;
    setDownloading(true);
    try {
      const uri = await captureReceipt(opts);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save Receipt" });
      } else {
        useNotificationStore.getState().push({ type: "info", title: "Receipt saved", message: uri });
      }
    } catch (err: unknown) {
      useNotificationStore.getState().push({ type: "error", title: "Download failed", message: toUserMessage(err, "Try again.") });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={["top"]}>
      <HeroHeader
        compact
        noWave
        title="Transaction History"
        subtitle="Browse and export your order history"
        onBack={onBack}
        right={
          <TouchableOpacity
            onPress={() => void exportCSV()}
            disabled={exporting || filtered.length === 0}
            activeOpacity={0.7}
            style={TH.exportBtn}
          >
            {exporting
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={TH.exportBtnText}>Export CSV</Text>
            }
          </TouchableOpacity>
        }
      />

      <View style={TH.filtersWrap}>
        <View style={TH.searchRow}>
          <I.Search c={C.gray400} />
          <TextInput
            style={[TH.searchInput, { fontSize: 14 * fs }]}
            placeholder="Claim code or customer name…"
            placeholderTextColor={C.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} activeOpacity={0.7}>
              <I.X c={C.gray400} s={14} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={TH.pillsRow}>
          {(["today", "7d", "30d"] as const).map(p => (
            <TouchableOpacity
              key={p}
              style={[TH.pill, period === p && TH.pillActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.75}
            >
              <Text style={[TH.pillText, period === p && TH.pillTextActive, { fontSize: 13 * fs }]}>
                {p === "today" ? "Today" : p === "7d" ? "7 Days" : "30 Days"}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[TH.pill, period === "custom" && TH.pillActive]}
            onPress={() => setCustomModalOpen(true)}
            activeOpacity={0.75}
          >
            <Text style={[TH.pillText, period === "custom" && TH.pillTextActive, { fontSize: 13 * fs }]} numberOfLines={1}>
              {period === "custom" && customRange ? formatRangeLabel(customRange.from, customRange.to) : "Custom"}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={{ flexDirection: "row", gap: SP._6 }}>
        <View>
          <TouchableOpacity
            style={[TH.pill, TH.payDropdownBtn, payFilters.length > 0 && TH.pillActive]}
            onPress={() => { setPayDropdownOpen(o => !o); setBranchDropdownOpen(false); }}
            activeOpacity={0.75}
          >
            <Text style={[TH.pillText, payFilters.length > 0 && TH.pillTextActive, { fontSize: 12 * fs }]}>
              {payFilterLabel}
            </Text>
            <Text style={[TH.pillText, payFilters.length > 0 && TH.pillTextActive, { fontSize: 10 * fs, marginLeft: 6 }]}>
              {payDropdownOpen ? "▴" : "▾"}
            </Text>
          </TouchableOpacity>

          {payDropdownOpen && (
            <View style={TH.payDropdownPanel}>
              <TouchableOpacity
                style={TH.payDropdownRow}
                onPress={() => setPayFilters([])}
                activeOpacity={0.7}
              >
                <View style={[TH.checkbox, payFilters.length === 0 && TH.checkboxChecked]}>
                  {payFilters.length === 0 && <Text style={TH.checkboxMark}>✓</Text>}
                </View>
                <Text style={[TH.payDropdownRowText, { fontSize: 13 * fs }]}>All Methods</Text>
              </TouchableOpacity>
              {TX_PAY_METHODS.map(m => {
                const checked = payFilters.includes(m);
                return (
                  <TouchableOpacity
                    key={m}
                    style={TH.payDropdownRow}
                    onPress={() => togglePayFilter(m)}
                    activeOpacity={0.7}
                  >
                    <View style={[TH.checkbox, checked && TH.checkboxChecked]}>
                      {checked && <Text style={TH.checkboxMark}>✓</Text>}
                    </View>
                    <Text style={[TH.payDropdownRowText, { fontSize: 13 * fs }]}>{TX_PAY_LABELS[m]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {canFilterBranch && (
          <View>
            <TouchableOpacity
              style={[TH.pill, TH.payDropdownBtn, branchFilter != null && TH.pillActive]}
              onPress={() => { setBranchDropdownOpen(o => !o); setPayDropdownOpen(false); }}
              activeOpacity={0.75}
            >
              <Text style={[TH.pillText, branchFilter != null && TH.pillTextActive, { fontSize: 12 * fs }]} numberOfLines={1}>
                {branchFilterLabel}
              </Text>
              <Text style={[TH.pillText, branchFilter != null && TH.pillTextActive, { fontSize: 10 * fs, marginLeft: 6 }]}>
                {branchDropdownOpen ? "▴" : "▾"}
              </Text>
            </TouchableOpacity>

            {branchDropdownOpen && (
              <View style={TH.payDropdownPanel}>
                <TouchableOpacity
                  style={TH.payDropdownRow}
                  onPress={() => { setBranchFilter(null); setBranchDropdownOpen(false); }}
                  activeOpacity={0.7}
                >
                  <View style={[TH.checkbox, branchFilter == null && TH.checkboxChecked]}>
                    {branchFilter == null && <Text style={TH.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={[TH.payDropdownRowText, { fontSize: 13 * fs }]}>All Branches</Text>
                </TouchableOpacity>
                {branches.map(b => {
                  const checked = branchFilter === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={TH.payDropdownRow}
                      onPress={() => { setBranchFilter(b.id); setBranchDropdownOpen(false); }}
                      activeOpacity={0.7}
                    >
                      <View style={[TH.checkbox, checked && TH.checkboxChecked]}>
                        {checked && <Text style={TH.checkboxMark}>✓</Text>}
                      </View>
                      <Text style={[TH.payDropdownRowText, { fontSize: 13 * fs }]} numberOfLines={1}>{b.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
        </View>
      </View>

      {!loading && (
        <View style={TH.summaryRow}>
          <Text style={[TH.summaryCount, { fontSize: 12 * fs }]}>
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}
            {(search.trim() || payFilters.length > 0) ? " (filtered)" : ""}
          </Text>
          <Text style={[TH.summaryTotal, { fontSize: 13 * fs }]}>{peso(totalValue)}</Text>
        </View>
      )}

      {loading ? (
        <View style={TH.center}><ActivityIndicator color={C.brand500} /></View>
      ) : filtered.length === 0 ? (
        <View style={TH.center}>
          <Text style={[TH.emptyText, { fontSize: 14 * fs }]}>No transactions found</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={o => o._id}
          style={{ backgroundColor: C.gray50 }}
          contentContainerStyle={{ paddingTop: SP._12, paddingBottom: insets.bottom + 24, paddingHorizontal: SP._16 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator color={C.brand500} />
              </View>
            ) : !hasMore && !search.trim() && !payFilters.length ? (
              <Text style={S.auditEndOfList}>— End of results —</Text>
            ) : null
          }
          renderItem={({ item: o }) => {
            const tx        = o.transactions?.[0];
            const method    = tx?.paymentMethod?.toLowerCase() ?? null;
            const refId     = tx?.referenceId;
            const statusKey = o.paymentStatus === "refunded" ? "refunded" : (o.laundryStatus ?? "pending");
            const date = o.createdAt
              ? new Date(o.createdAt).toLocaleDateString("en-PH", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })
              : "—";
            const serviceNames = (o.items ?? [])
              .filter((i) => i.serviceName)
              .map((i) => i.quantity > 1 ? `${i.serviceName} ×${i.quantity}` : i.serviceName!)
              .join(" · ");
            const branchName = canFilterBranch && !branchFilter
              ? branches.find(b => b.id === o.branchId)?.name
              : undefined;
            return (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setSelectedTx({ pos: gqlOrderToPOS(o), gql: o })}
              >
                <View style={TH.card}>
                  <View style={[TH.stripe, { backgroundColor: TX_STATUS_COLOR[statusKey] ?? C.gray300 }]} />
                  <View style={TH.cardContent}>
                    <View style={TH.cardTop}>
                      <Text style={[TH.cardCode, { fontSize: 15 * fs }]}>#{o.claimCode}</Text>
                      <View style={[TH.statusPill, { backgroundColor: TX_STATUS_BG[statusKey] ?? C.gray100 }]}>
                        <Text style={[TH.statusText, { color: TX_STATUS_COLOR[statusKey] ?? C.gray500, fontSize: 10 * fs }]}>
                          {TX_STATUS_LABEL[statusKey] ?? o.laundryStatus}
                        </Text>
                      </View>
                    </View>
                    <View style={TH.cardMid}>
                      <Text style={[TH.cardCustomer, { fontSize: 13 * fs }]}>{o.customerName ?? "Walk-in"}</Text>
                      <Text style={[TH.cardDate, { fontSize: 11 * fs }]}>{date}</Text>
                    </View>
                    {branchName ? (
                      <Text style={[TH.cardRef, { fontSize: 10 * fs }]} numberOfLines={1}>{branchName}</Text>
                    ) : null}
                    {serviceNames ? (
                      <Text style={[TH.cardItems, { fontSize: 11 * fs }]} numberOfLines={2}>{serviceNames}</Text>
                    ) : null}
                    <View style={TH.cardBot}>
                      <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                        {method && (
                          <Text style={[TH.cardMethod, { fontSize: 11 * fs }]}>
                            {TX_PAY_LABELS[method] ?? method}
                          </Text>
                        )}
                        {refId && (
                          <Text style={[TH.cardRef, { fontSize: 10 * fs }]}>ref: {refId}</Text>
                        )}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[TH.cardAmount, { fontSize: 16 * fs }]}>{peso(o.totalAmount)}</Text>
                        {tx && tx.amountPaid > 0 && (
                          <Text style={[TH.cardTendered, { fontSize: 10 * fs }]}>
                            Tendered {peso(tx.amountPaid)} · Chg {peso(tx.change)}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
      <OrderDetailSheet
        order={selectedTx?.pos ?? null}
        onClose={() => setSelectedTx(null)}
        footer={
          <View style={TH.txFooterRow}>
            <TouchableOpacity
              onPress={() => void handleDownload()}
              disabled={downloading}
              style={TH.downloadBtn}
              activeOpacity={0.85}
            >
              {downloading
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={TH.downloadBtnText}>Download</Text>
              }
            </TouchableOpacity>
          </View>
        }
      />
      {hiddenReceipt}
      <CustomDateRangeModal
        visible={customModalOpen}
        initialFrom={customRange?.from}
        initialTo={customRange?.to}
        onApply={(from, to) => { setCustomRange({ from, to }); setPeriod("custom"); setCustomModalOpen(false); }}
        onClose={() => setCustomModalOpen(false)}
      />
    </SafeAreaView>
  );
}
