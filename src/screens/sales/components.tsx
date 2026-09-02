// Sales report presentational pieces — icons, badges, the four report tabs, export modal.
// Extracted from sales.tsx.
import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { Card } from "../../components/ui";
import { fc, timeAgo, STATUS_STYLE, PM_LABEL, type SaleOrder } from "./model";
import type { Branch } from "../../stores/merchantStore";
import { S } from "./styles";

export const IcoBack = () => (
  <Ionicons name="chevron-back" size={20} color="#fff" />
);

export const IcoExport = () => (
  <Ionicons name="download-outline" size={20} color="#fff" />
);

export const IcoClose = () => (
  <Ionicons name="close" size={18} color={C.gray500} />
);

// ─── Sub-components ───────────────────────────────────────────────────────────

export function StatusBadge({ status }: Readonly<{ status: SaleOrder["status"] }>) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.CREATED;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", color: s.text, letterSpacing: 0.2 }}>{s.label.toUpperCase()}</Text>
    </View>
  );
}

export function PaymentBadge({ method }: Readonly<{ method: string | null }>) {
  if (!method) return null;
  return (
    <View style={{ backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: "600", color: C.gray600 }}>{PM_LABEL[method] ?? method}</Text>
    </View>
  );
}

export function BranchTag({ name }: Readonly<{ name: string }>) {
  return (
    <View style={{ backgroundColor: C.brand50, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text style={{ fontSize: 9, fontWeight: "700", color: C.brand700 }} numberOfLines={1}>{name}</Text>
    </View>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

export type ServiceRow  = { name: string; count: number; revenue: number };
export type PaymentRow  = { method: string; label: string; amount: number; count: number };

export function OverviewTab({ services, payments }: Readonly<{
  services: ServiceRow[];
  payments: PaymentRow[];
}>) {
  const maxSvcRev  = services[0]?.revenue  ?? 1;
  const maxPmAmt   = payments[0]?.amount   ?? 1;

  return (
    <View style={{ gap: SP._14 }}>
      {/* Top services */}
      <Card>
        <Text style={S.sectionTitle}>Top Services</Text>
        {services.length === 0 ? (
          <View>
            <Text style={S.emptyHint}>No service sales for this period.</Text>
            <Text style={[S.emptyHint, { marginTop: 4, fontSize: 12, color: C.gray400 }]}>Try switching to &quot;All&quot; or a longer date range.</Text>
          </View>
        ) : (
          <View style={{ gap: SP._12 }}>
            {services.map(svc => (
              <View key={svc.name}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 5 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.rowName}>{svc.name}</Text>
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{svc.count.toFixed(1)} kg</Text>
                  </View>
                  <Text style={[S.rowValue, { color: C.brand500 }]}>{fc(svc.revenue)}</Text>
                </View>
                <View style={S.track}>
                  <View style={[S.fill, { width: `${Math.round((svc.revenue / maxSvcRev) * 100)}%` as any }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Payment breakdown */}
      <Card>
        <Text style={S.sectionTitle}>Payment Breakdown</Text>
        {payments.length === 0 ? (
          <View>
            <Text style={S.emptyHint}>No payments recorded yet.</Text>
            <Text style={[S.emptyHint, { marginTop: 4, fontSize: 12, color: C.gray400 }]}>Collected payments will appear here by method.</Text>
          </View>
        ) : (
          <View style={{ gap: SP._10 }}>
            {payments.map(pm => (
              <View key={pm.method}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                  <Text style={S.rowName}>{pm.label}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 11, color: C.gray400 }}>{pm.count} order{pm.count !== 1 ? "s" : ""}</Text>
                    <Text style={S.rowValue}>{fc(pm.amount)}</Text>
                  </View>
                </View>
                <View style={S.track}>
                  <View style={[S.fill, { width: `${Math.round((pm.amount / maxPmAmt) * 100)}%` as any, backgroundColor: C.accent500 }]} />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

// ─── Tab: Transactions ────────────────────────────────────────────────────────

const TX_PAGE = 20;

export function TransactionsTab({ orders, branches, dashboardFilterBranchId }: Readonly<{
  orders: SaleOrder[];
  branches: Branch[];
  dashboardFilterBranchId: string | null;
}>) {
  const [visible, setVisible] = React.useState(TX_PAGE);

  // Reset page when the order list changes (period / basis switch)
  React.useEffect(() => { setVisible(TX_PAGE); }, [orders]);

  const shown   = orders.slice(0, visible);
  const hasMore = visible < orders.length;

  if (orders.length === 0) {
    return (
      <Card>
        <Text style={[S.emptyHint, { textAlign: "center", paddingVertical: SP._24 }]}>
          No orders found for this period.
        </Text>
      </Card>
    );
  }

  return (
    <Card padding={0}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SP._14, paddingVertical: SP._12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <Text style={S.sectionTitle}>All Orders</Text>
        <View style={{ backgroundColor: C.brand500, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.white }}>{orders.length}</Text>
        </View>
      </View>
      {shown.map((order, idx) => {
        const branchName = !dashboardFilterBranchId && order.branchId
          ? (branches.find(b => b.id === order.branchId)?.name ?? null)
          : null;
        const balance = Math.max(0, order.total - order.amountReceived);
        const isLast  = idx === shown.length - 1;

        return (
          <View key={order.id} style={[{ paddingHorizontal: SP._14, paddingVertical: SP._12 }, !isLast && { borderBottomWidth: 1, borderBottomColor: C.gray100 }]}>
            {/* Row 1: Claim code + customer + status badge */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray500, fontVariant: ["tabular-nums"] as any }}>
                #{order.claimCode}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.gray900, flex: 1 }} numberOfLines={1}>
                {order.customerName}
              </Text>
              <StatusBadge status={order.status} />
            </View>

            {/* Row 2: Time + branch tag + payment badge */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6, marginBottom: SP._8 }}>
              <Text style={{ fontSize: 11, color: C.gray400 }}>{timeAgo(order.createdAt)}</Text>
              {branchName && <BranchTag name={branchName} />}
              {order.paymentMethod && <PaymentBadge method={order.paymentMethod} />}
            </View>

            {/* Row 3: Amounts */}
            <View style={{ flexDirection: "row", gap: SP._20 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, color: C.gray400, fontWeight: "600", marginBottom: 1 }}>TOTAL</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900 }}>{fc(order.total)}</Text>
              </View>
              {order.amountReceived > 0 && (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: C.gray400, fontWeight: "600", marginBottom: 1 }}>COLLECTED</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#15803D" }}>{fc(order.amountReceived)}</Text>
                </View>
              )}
              {balance > 0 && order.status !== "CANCELLED" && (
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: C.warning600, fontWeight: "600", marginBottom: 1 }}>BALANCE</Text>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.warning600 }}>{fc(balance)}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
      {/* Pagination footer */}
      {hasMore ? (
        <TouchableOpacity
          onPress={() => setVisible(v => v + TX_PAGE)}
          style={{ paddingVertical: SP._14, alignItems: "center", borderTopWidth: 1, borderTopColor: C.gray100 }}
          activeOpacity={0.75}
        >
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.brand500 }}>
            Load more ({orders.length - visible} remaining)
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ textAlign: "center", fontSize: 12, color: C.gray400, paddingVertical: SP._12 }}>
          {orders.length} order{orders.length !== 1 ? "s" : ""}
        </Text>
      )}
    </Card>
  );
}

// ─── Tab: Payments ────────────────────────────────────────────────────────────

export function PaymentsTab({ payments, unpaidBalance }: Readonly<{
  payments: PaymentRow[];
  unpaidBalance: number;
}>) {
  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <View style={{ gap: SP._14 }}>
      <Card padding={0}>
        <View style={{ paddingHorizontal: SP._14, paddingVertical: SP._12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
          <Text style={S.sectionTitle}>Payment Methods</Text>
        </View>
        {payments.length === 0 ? (
          <Text style={[S.emptyHint, { padding: SP._24, textAlign: "center" }]}>No payment data.</Text>
        ) : (
          <>
            {payments.map((pm, idx) => {
              const pct = totalCollected > 0 ? (pm.amount / totalCollected) * 100 : 0;
              const isLast = idx === payments.length - 1;
              return (
                <View key={pm.method} style={[{ paddingHorizontal: SP._14, paddingVertical: SP._12 }, !isLast && { borderBottomWidth: 1, borderBottomColor: C.gray100 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900, flex: 1 }}>{pm.label}</Text>
                    <Text style={{ fontSize: 11, color: C.gray400, marginRight: SP._12 }}>{pm.count} order{pm.count !== 1 ? "s" : ""}</Text>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: C.gray900 }}>{fc(pm.amount)}</Text>
                  </View>
                  <View style={S.track}>
                    <View style={[S.fill, { width: `${Math.round(pct)}%` as any, backgroundColor: C.brand500 }]} />
                  </View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginTop: 3 }}>{pct.toFixed(1)}% of collected</Text>
                </View>
              );
            })}
            {/* Summary footer */}
            <View style={{ paddingHorizontal: SP._14, paddingVertical: SP._12, backgroundColor: C.gray50, borderTopWidth: 1, borderTopColor: C.gray100, gap: SP._6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, color: C.gray600, fontWeight: "600" }}>Total Collected</Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: "#15803D" }}>{fc(totalCollected)}</Text>
              </View>
              {unpaidBalance > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: C.warning600, fontWeight: "600" }}>Unpaid Balance</Text>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: C.warning600 }}>{fc(unpaidBalance)}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </Card>
    </View>
  );
}

// ─── Tab: Services ────────────────────────────────────────────────────────────

export function ServicesTab({ services }: Readonly<{ services: ServiceRow[] }>) {
  const maxRev = services[0]?.revenue ?? 1;

  return (
    <Card padding={0}>
      <View style={{ paddingHorizontal: SP._14, paddingVertical: SP._12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <Text style={S.sectionTitle}>Services Sold</Text>
      </View>
      {services.length === 0 ? (
        <Text style={[S.emptyHint, { padding: SP._24, textAlign: "center" }]}>No service data for this period.</Text>
      ) : (
        services.map((svc, idx) => (
          <View key={svc.name} style={[{ paddingHorizontal: SP._14, paddingVertical: SP._12 }, idx < services.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.gray100 }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.gray900 }}>{svc.name}</Text>
                <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>{svc.count.toFixed(1)} kg total</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "800", color: C.brand500 }}>{fc(svc.revenue)}</Text>
            </View>
            <View style={S.track}>
              <View style={[S.fill, { width: `${Math.round((svc.revenue / maxRev) * 100)}%` as any }]} />
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

// ─── Export modal ─────────────────────────────────────────────────────────────

const FORMAT_LABEL = { csv: "CSV", excel: "Excel" } as const;
const FORMAT_HINT: Record<"csv" | "excel", string> = {
  csv:   "Saves as .csv · share via Files, Drive, Gmail…",
  excel: "Saves as .xlsx · share via Files, Drive, Gmail…",
};

export function ExportModal({ visible, onClose, onExport, orderCount, periodLabel, branchLabel, basisLabel, exporting }: Readonly<{
  visible: boolean;
  onClose: () => void;
  onExport: (format: "csv" | "excel") => void;
  orderCount: number;
  periodLabel: string;
  branchLabel: string;
  basisLabel: string;
  exporting: boolean;
}>) {
  const [format, setFormat] = useState<"csv" | "excel">("csv");
  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={S.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={S.modalCard}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: SP._16 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: C.gray900, flex: 1 }}>Export Sales Report</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
              <IcoClose />
            </TouchableOpacity>
          </View>

          {/* Report details */}
          {[
            ["Date Range", periodLabel],
            ["Branch",     branchLabel],
            ["Report Basis", basisLabel],
            ["Orders",     `${orderCount} order${orderCount !== 1 ? "s" : ""}`],
          ].map(([label, value]) => (
            <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: SP._6, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
              <Text style={{ fontSize: 13, color: C.gray500 }}>{label}</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.gray900 }}>{value}</Text>
            </View>
          ))}

          {/* Format */}
          <View style={{ marginTop: SP._16, marginBottom: SP._4 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 }}>Format</Text>
            <View style={{ flexDirection: "row", gap: SP._8 }}>
              {(["csv", "excel"] as const).map(f => {
                const active = format === f;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFormat(f)}
                    activeOpacity={0.75}
                    style={{ flex: 1, borderRadius: RADIUS.md, borderWidth: active ? 2 : 1, borderColor: active ? C.brand500 : C.gray200, backgroundColor: active ? C.brand50 : C.gray50, paddingVertical: SP._10, alignItems: "center" }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "700", color: active ? C.brand700 : C.gray600 }}>{FORMAT_LABEL[f]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Text style={{ fontSize: 11, color: C.gray400, marginBottom: SP._16 }}>
            {FORMAT_HINT[format]}
          </Text>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: SP._10 }}>
            <TouchableOpacity onPress={onClose} style={[S.modalBtn, { backgroundColor: C.gray100, flex: 1 }]} activeOpacity={0.75}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.gray700 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onExport(format)}
              style={[S.modalBtn, { backgroundColor: orderCount === 0 ? C.gray300 : C.brand500, flex: 2 }]}
              activeOpacity={0.8}
              disabled={exporting || orderCount === 0}
            >
              {exporting
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={{ fontSize: 14, fontWeight: "700", color: C.white }}>Export {FORMAT_LABEL[format]}</Text>
              }
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

