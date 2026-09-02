// src/components/pos/ReceiptSnapshot.tsx
// Renders a receipt as an actual RN view (not HTML) so it can be captured as
// a PNG image via react-native-view-shot for the "Download" actions.

import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import ViewShot from "react-native-view-shot";
import type { ReceiptOptions } from "../../utils/printReceipt";

const fp = (v: number) =>
  `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAPER_PX: Record<string, number> = { "58mm": 300, "72mm": 380, "80mm": 420 };
const CODE_FONT_SIZE: Record<string, number> = { large: 26, medium: 20, small: 16 };

const PAY_LABELS: Record<string, string> = {
  CASH: "Cash", GCASH: "GCash", MAYA: "Maya", CARD: "Card", QPH: "QPH",
  cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qph: "QPH",
};

function Row({ label, value, bold }: Readonly<{ label: string; value: string; bold?: boolean }>) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, bold && s.rowBold]}>{label}</Text>
      <Text style={[s.rowValue, bold && s.rowBold]}>{value}</Text>
    </View>
  );
}

function Dash() {
  return <View style={s.dash} />;
}

export const ReceiptSnapshot = forwardRef<ViewShot, ReceiptOptions>(function ReceiptSnapshot(opts, ref) {
  const {
    order, orderFull, cashierName,
    businessName = "LALABA LAUNDRY", businessAddress = "", businessPhone = "", branchName = "",
    paperWidth, customerCopyLabel, merchantCopyLabel, footerText, claimCodeSize,
    showClaimCodeOnMerchant, showCashierName, showBranchName, showPickupInstructions,
  } = opts;

  const width = PAPER_PX[paperWidth] ?? 300;
  const codeFontSize = CODE_FONT_SIZE[claimCodeSize] ?? 26;
  const payMethod = String(opts.paymentMethod ?? order.paymentMethod ?? "CASH");
  const payLabel = PAY_LABELS[payMethod] ?? payMethod;
  const items = orderFull?.items ?? [];
  const subtotal = orderFull?.subtotal ?? order.totalAmount;
  const discountAmt = orderFull?.discountValue ?? 0;
  const discountType = orderFull?.discountType as string | undefined;
  const discountLabel = discountType === "PWD" ? "PWD Disc. (20%)" : discountType === "SENIOR" ? "Senior Disc. (20%)" : "Discount";
  const customerName = orderFull?.customerName;
  const customerPhone = orderFull?.customerPhone ?? null;
  const amtReceived = opts.amountReceived ?? order.amountReceived ?? 0;
  const createdAt = orderFull?.createdAt ? new Date(orderFull.createdAt) : new Date();
  const dateStr = createdAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = createdAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <ViewShot ref={ref} options={{ format: "png", quality: 1 }}>
      <View style={[s.page, { width }]}>
        {/* Customer copy */}
        <View style={s.section}>
          <Text style={s.bizName}>{businessName}</Text>
          {showBranchName && branchName ? <Text style={s.bizInfo}>{branchName}</Text> : null}
          {businessAddress ? <Text style={s.bizInfo}>{businessAddress}</Text> : null}
          {businessPhone ? <Text style={s.bizInfo}>{businessPhone}</Text> : null}
          <Text style={s.copyLabel}>{customerCopyLabel}</Text>
          <Dash />
          <Row label="Date" value={dateStr} />
          <Row label="Time" value={timeStr} />
          {showCashierName && cashierName ? <Row label="Cashier" value={cashierName} /> : null}
          {customerName ? <Row label="Customer" value={customerName} /> : null}
          <Dash />
          {items.map((it, i) => (
            <View key={`c-${it.serviceId}-${i}`} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{it.serviceName}</Text>
                <Text style={s.itemQty}>{it.quantity} × {fp(it.unitPrice)}</Text>
              </View>
              <Text style={s.itemTotal}>{fp(it.subtotal)}</Text>
            </View>
          ))}
          <Dash />
          {subtotal !== order.totalAmount ? <Row label="Subtotal" value={fp(subtotal)} /> : null}
          {discountAmt > 0 ? <Row label={discountLabel} value={`-${fp(discountAmt)}`} /> : null}
          <Row label="TOTAL" value={fp(order.totalAmount)} bold />
          {payMethod.toUpperCase() === "CASH" && amtReceived > 0 ? <Row label="Cash paid" value={fp(amtReceived)} /> : null}
          {order.changeGiven > 0 ? <Row label="Change" value={fp(order.changeGiven)} /> : null}
          <Row label="Payment" value={payLabel} />
          <Dash />
          <View style={s.claimBox}>
            <Text style={s.claimEyebrow}>CLAIM CODE</Text>
            <Text style={[s.claimCode, { fontSize: codeFontSize }]}>{order.claimCode}</Text>
            {showPickupInstructions ? <Text style={s.claimHint}>Show this when picking up your order</Text> : null}
          </View>
          {footerText ? <Text style={s.footer}>{footerText}</Text> : null}
        </View>

        <View style={s.cut}><Text style={s.cutText}>✂ ——— CUT HERE ——— ✂</Text></View>

        {/* Merchant copy */}
        <View style={s.section}>
          <Text style={s.copyLabel}>{merchantCopyLabel}</Text>
          <Dash />
          <Text style={[s.bizName, { fontSize: 12 }]}>{businessName}</Text>
          {showBranchName && branchName ? <Text style={s.bizInfo}>{branchName}</Text> : null}
          <Dash />
          <Row label="Date/Time" value={`${dateStr} ${timeStr}`} />
          {showCashierName && cashierName ? <Row label="Cashier" value={cashierName} /> : null}
          {customerName ? <Row label="Customer" value={customerName} /> : null}
          {customerPhone ? <Row label="Phone" value={customerPhone} /> : null}
          <Dash />
          {items.map((it, i) => (
            <View key={`m-${it.serviceId}-${i}`} style={s.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{it.serviceName}</Text>
                <Text style={s.itemQty}>{it.quantity} × {fp(it.unitPrice)}</Text>
              </View>
              <Text style={s.itemTotal}>{fp(it.subtotal)}</Text>
            </View>
          ))}
          <Dash />
          <Row label="TOTAL" value={fp(order.totalAmount)} bold />
          <Row label="Payment" value={payLabel} />
          {showClaimCodeOnMerchant ? (
            <>
              <Dash />
              <Text style={s.merchantClaim}>Claim: <Text style={{ fontWeight: "800" }}>{order.claimCode}</Text></Text>
            </>
          ) : null}
        </View>
      </View>
    </ViewShot>
  );
});

const s = StyleSheet.create({
  page: { backgroundColor: "#fff", paddingVertical: 12 },
  section: { paddingHorizontal: 10, paddingVertical: 6 },
  bizName: { fontSize: 15, fontWeight: "800", textAlign: "center", textTransform: "uppercase", letterSpacing: 1, color: "#000" },
  bizInfo: { fontSize: 10, color: "#555", textAlign: "center" },
  copyLabel: { fontSize: 12, fontWeight: "700", textAlign: "center", letterSpacing: 2, marginVertical: 5, color: "#000" },
  dash: { borderTopWidth: 1, borderStyle: "dashed", borderTopColor: "#000", marginVertical: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  rowLabel: { fontSize: 11, color: "#555" },
  rowValue: { fontSize: 11, color: "#000" },
  rowBold: { fontWeight: "800", fontSize: 13, color: "#000" },
  itemRow: { flexDirection: "row", paddingTop: 4 },
  itemName: { fontSize: 11, fontWeight: "700", color: "#000" },
  itemQty: { fontSize: 9, color: "#555" },
  itemTotal: { fontSize: 11, fontWeight: "700", color: "#000" },
  claimBox: { alignItems: "center", paddingVertical: 6 },
  claimEyebrow: { fontSize: 10, letterSpacing: 1, color: "#666" },
  claimCode: { fontWeight: "800", letterSpacing: 6, marginVertical: 4, color: "#000" },
  claimHint: { fontSize: 9, color: "#888" },
  footer: { fontSize: 9, color: "#555", textAlign: "center", marginTop: 6, lineHeight: 14 },
  cut: { paddingVertical: 4 },
  cutText: { fontSize: 9, color: "#666", textAlign: "center" },
  merchantClaim: { fontSize: 11, textAlign: "center", color: "#000" },
});
