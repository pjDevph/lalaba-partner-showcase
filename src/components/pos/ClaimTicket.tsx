// src/components/pos/ClaimTicket.tsx
// Order-success modal shown after a POS order is created.
// Displayed as a centered overlay card (not a full page).
// Portrait: stacked claim-code + receipt. Landscape: two-column.
// Claim code always fits one line via adjustsFontSizeToFit.

import React, { useEffect, useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import { C, RADIUS, SP } from "../../theme/tokens";
import { usePrinterStore } from "../../stores/printerStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useReceiptImageCapture } from "../../hooks/useReceiptImageCapture";
import type { CreatePOSOrderResponse } from "../../types/pos.types";
import type { GqlOrder } from "../../services/graphql/orders";

// ─── Props ─────────────────────────────────────────────────────────────────────

interface ClaimTicketProps {
  visible:      boolean;
  order:        CreatePOSOrderResponse | null;
  orderFull?:   GqlOrder | null;
  cashierName?: string;
  onClose:      () => void;
  onNewOrder:   () => void;
  /** "Back to Queue" — resets and switches to the Queue tab. The X / backdrop /
   *  hardware back keep using onClose (dismiss only, stay on Terminal).
   *  Falls back to onClose when not supplied. */
  onBackToQueue?: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fp = (v: number) =>
  `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Icons ─────────────────────────────────────────────────────────────────────

function IconX({ color = C.gray500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="close" size={16} color={color} />;
}

function IconCheck() {
  return <Ionicons name="checkmark" size={17} color={C.brand500} />;
}

function IconDownload({ color = C.white }: Readonly<{ color?: string }>) {
  return <Ionicons name="download-outline" size={16} color={color} />;
}

function IconMail({ color = C.brand500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="mail-outline" size={16} color={color} />;
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function TotalRow({
  label, value, bold, green,
}: Readonly<{ label: string; value: string; bold?: boolean; green?: boolean }>) {
  return (
    <View style={S.totalRow}>
      <Text style={[S.totalLabel, green && S.green]}>{label}</Text>
      <Text style={[S.totalValue, bold && S.totalBold, green && S.green]}>{value}</Text>
    </View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function ClaimTicket({
  visible, order, orderFull, cashierName, onClose, onNewOrder, onBackToQueue,
}: Readonly<ClaimTicketProps>) {
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = winW > winH;

  const printerSettings = usePrinterStore();
  const profile     = useMerchantStore((s) => s.profile);
  const branches    = useMerchantStore((s) => s.branches);
  const selectedId  = useMerchantStore((s) => s.selectedBranchId);
  const branch      = branches.find((b) => b.id === selectedId) ?? branches[0] ?? null;

  const businessName    = printerSettings.businessName.trim() || (profile as any)?.businessName || "LALABA LAUNDRY";
  const businessPhone   = printerSettings.businessPhone.trim() || branch?.phone || (profile as any)?.phone || "";
  const businessAddress = printerSettings.businessAddress.trim() || branch?.address || "";
  const branchName      = branch?.name ?? "";

  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const { captureReceipt, hiddenReceipt } = useReceiptImageCapture();

  // Reset status on new order
  useEffect(() => {
    if (visible) setActionStatus(null);
  }, [visible]);

  if (!order) return null;

  // ── Derived receipt data ──────────────────────────────────────────────────────
  const PM_LABELS: Record<string, string> = { cash: "Cash", gcash: "GCash", maya: "Maya", card: "Card", qph: "QPay", split: "Split" };
  const payMethod      = order.paymentMethod ?? "cash";
  const payLabel       = PM_LABELS[payMethod.toLowerCase()] ?? payMethod.toUpperCase();
  const isUnpaid       = (orderFull?.paymentStatus ?? "unpaid") === "unpaid";
  const isDelivery     = orderFull?.fulfillmentType?.toUpperCase() === "DELIVERY";
  const items          = orderFull?.items ?? [];
  // A product-only sale (no laundry service items) is already complete once
  // paid — there's nothing to "pick up later", the customer walks out with
  // it now. Swap the pickup-oriented copy below for that case.
  const isProductOnly  = items.length > 0 && items.every((it: any) => it.type === "product");
  const subtotal       = orderFull?.subtotal ?? order.totalAmount;
  const discountAmt    = orderFull?.discountValue ?? 0;
  const discountCode   = undefined;
  const discountSuffix = discountCode ? ` (${discountCode})` : "";
  const customerName   = orderFull?.customerName;
  const customerPhone  = orderFull?.customerPhone;
  const customerAddr   = orderFull?.customerAddress;
  const orderNumber    = undefined;
  const amtReceived    = order.amountReceived ?? 0;
  const createdAt      = orderFull?.createdAt ? new Date(orderFull.createdAt) : new Date();
  const dateStr        = createdAt.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const timeStr        = createdAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

  // ── Receipt image (download / email) ──────────────────────────────────────────
  const receiptOpts = {
    order, orderFull: orderFull ?? null, copyType: "both" as const,
    cashierName, businessName, businessPhone, businessAddress, branchName,
    paperWidth:              printerSettings.paperWidth,
    documentLabel:           printerSettings.documentLabel,
    customerCopyLabel:       printerSettings.customerCopyLabel,
    merchantCopyLabel:       printerSettings.merchantCopyLabel,
    footerText:              printerSettings.footerText,
    claimCodeSize:           printerSettings.claimCodeSize,
    showClaimCodeOnMerchant: printerSettings.showClaimCodeOnMerchant,
    showCustomerPhone:       printerSettings.showCustomerPhone,
    showCashierName:         printerSettings.showCashierName,
    showBranchName:          printerSettings.showBranchName,
    showPickupInstructions:  printerSettings.showPickupInstructions,
    taxModeEnabled:          printerSettings.taxModeEnabled,
  };

  const handleDownload = async () => {
    setDownloading(true);
    setActionStatus(null);
    try {
      const uri = await captureReceipt(receiptOpts);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save Receipt" });
        setActionStatus("✓ Receipt ready to save");
      } else {
        setActionStatus(`Saved: ${uri}`);
      }
    } catch {
      setActionStatus("Could not create the receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleEmail = async () => {
    setEmailing(true);
    setActionStatus(null);
    try {
      const uri = await captureReceipt(receiptOpts);
      const canEmail = await MailComposer.isAvailableAsync();
      if (canEmail) {
        await MailComposer.composeAsync({
          subject: `Receipt — ${order.claimCode}`,
          body: `Attached is the receipt for order ${order.claimCode}.`,
          attachments: [uri],
        });
        setActionStatus("✓ Email ready to send");
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Email Receipt" });
        } else {
          setActionStatus("No email app configured on this device.");
        }
      }
    } catch {
      setActionStatus("Could not create the receipt. Please try again.");
    } finally {
      setEmailing(false);
    }
  };

  // ── Card sizing ───────────────────────────────────────────────────────────────
  // Landscape: fixed height so landscapeBody flex:1 doesn't collapse.
  // Portrait: single-column, capped at 420px with auto height.
  const cardWidth = isLandscape
    ? Math.min(winW * 0.82, 720)
    : Math.min(winW * 0.92, 420);
  const cardMaxH = winH * 0.92;
  // Landscape needs a set height so the two-column body can flex into it.
  const cardH: number | undefined = isLandscape
    ? Math.min(winH * 0.88, 510)
    : undefined;

  // ── Claim code card ───────────────────────────────────────────────────────────
  const claimCodeSection = (
    <View style={[S.codeCard, isLandscape && S.codeCardLandscape]}>
      <View style={S.fulfillmentRow}>
        <View style={[S.fulfillmentBadge, isDelivery ? S.fulfillmentDelivery : S.fulfillmentPickup]}>
          <Text style={[S.fulfillmentText, isDelivery ? S.fulfillmentDeliveryText : S.fulfillmentPickupText]}>
            {isDelivery ? "🚚  Delivery" : "🛍  Pick-up"}
          </Text>
        </View>
      </View>
      <Text style={S.codeEyebrow}>CLAIM CODE</Text>
      <Text
        style={[S.codeText, isLandscape && S.codeTextLandscape]}
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.35}
      >
        {order.claimCode}
      </Text>
      <Text style={S.codeHint}>
        {isDelivery
          ? "Will be delivered to the customer"
          : isProductOnly
          ? "Sale complete"
          : "Customer shows this when picking up"}
      </Text>

      {isLandscape && (
        <>
          {/* Dashed ticket divider */}
          <View style={S.ticketDash} />

          {orderNumber ? (
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>Order</Text>
              <Text style={S.summaryValue}>#{orderNumber}</Text>
            </View>
          ) : null}
          <View style={S.summaryRow}>
            <Text style={S.summaryLabel}>Total</Text>
            <Text style={[S.summaryValue, S.summaryTotal]}>{fp(order.totalAmount)}</Text>
          </View>
          {order.changeGiven > 0 && (
            <View style={S.summaryRow}>
              <Text style={S.summaryLabel}>Change</Text>
              <Text style={[S.summaryValue, S.green]}>{fp(order.changeGiven)}</Text>
            </View>
          )}
          {/* Already said via codeHint above the claim code — repeating it
              here would just add height this fixed, non-scrolling column
              doesn't have room for. */}
          {!isProductOnly && (
            <>
              <View style={S.ticketDash} />
              <Text style={S.ticketPickup}>
                {isDelivery ? "Will be delivered to the customer" : "Show code at counter for pickup"}
              </Text>
            </>
          )}
        </>
      )}
    </View>
  );

  // ── Receipt summary ───────────────────────────────────────────────────────────
  const receiptContent = (
    <View style={S.receiptPad}>
      {isLandscape && <Text style={S.receiptColumnHeader}>MERCHANT COPY</Text>}
      <Text style={S.receiptDate}>{dateStr} · {timeStr}</Text>
      {cashierName  ? <Text style={S.receiptMeta}>Cashier: {cashierName}</Text> : null}
      {customerName ? <Text style={S.receiptMeta}>Customer: {customerName}</Text> : null}
      {customerPhone ? <Text style={S.receiptMeta}>Phone: {customerPhone}</Text> : null}
      {isDelivery && customerAddr ? <Text style={S.receiptMeta}>Address: {customerAddr}</Text> : null}

      <View style={S.divider} />

      {items.map((it, i) => (
        <View key={`${it.serviceId}-${i}`} style={S.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={S.itemName}>{it.serviceName}</Text>
            <Text style={S.itemQty}>{it.quantity} × {fp(it.unitPrice)}</Text>
          </View>
          <Text style={S.itemTotal}>{fp(it.subtotal)}</Text>
        </View>
      ))}

      {items.length > 0 && <View style={S.divider} />}

      {subtotal !== order.totalAmount && <TotalRow label="Subtotal" value={fp(subtotal)} />}
      {discountAmt > 0 && (
        <TotalRow label={`Discount${discountSuffix}`} value={`-${fp(discountAmt)}`} />
      )}
      <TotalRow label="Total" value={fp(order.totalAmount)} bold />
      {isUnpaid ? (
        <View style={S.unpaidBadge}>
          <Text style={S.unpaidText}>
            UNPAID — {isDelivery ? "Collect at delivery" : isProductOnly ? "Collect at counter" : "Collect at pickup"}
          </Text>
        </View>
      ) : (
        <>
          <TotalRow label="Payment" value={payLabel} />
          {payMethod.toUpperCase() === "CASH" && amtReceived > 0 && (
            <TotalRow label="Cash received" value={fp(amtReceived)} />
          )}
          {order.changeGiven > 0 && <TotalRow label="Change" value={fp(order.changeGiven)} green />}
        </>
      )}
    </View>
  );

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <View style={S.backdrop}>
        {/* tap outside to close */}
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          activeOpacity={1}
        />

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <View style={[
          S.card,
          {
            width: cardWidth,
            maxHeight: cardMaxH,
            marginBottom: Math.max(insets.bottom, 8),
          },
          cardH !== undefined && { height: cardH },
        ]}>

          {/* Header */}
          <View style={S.header}>
            <View style={S.headerLeft}>
              <View style={S.successBadge}><IconCheck /></View>
              <View>
                <Text style={S.headerTitle}>Order Created</Text>
                <Text style={S.headerSub}>
                  {orderNumber ? `#${orderNumber}` : ""}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={S.closeBtn} activeOpacity={0.7}>
              <IconX />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {isLandscape ? (
            <View style={S.landscapeBody}>
              {/* Left: claim code — a product-only sale has nothing to claim later */}
              {!isProductOnly && (
                <ScrollView
                  style={S.codeColumn}
                  contentContainerStyle={S.codeColumnContent}
                  showsVerticalScrollIndicator={false}
                >
                  {claimCodeSection}
                </ScrollView>
              )}
              {/* Right: receipt */}
              <ScrollView
                style={S.receiptColumn}
                contentContainerStyle={{ paddingBottom: SP._8 }}
                showsVerticalScrollIndicator={false}
              >
                {receiptContent}
              </ScrollView>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: SP._4 }}
            >
              {!isProductOnly && claimCodeSection}
              {receiptContent}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={S.footer}>
            {/* Inner container — constrained in landscape so buttons don't span wall-to-wall */}
            <View style={isLandscape ? S.footerInnerLandscape : { gap: 8 }}>
              {/* Download / Email — a plain receipt, not a claim slip, so this
                  stays available even for product-only sales that have
                  nothing to claim later. */}
              {actionStatus ? (
                <Text style={[S.actionStatusText, actionStatus.startsWith("✓") && S.actionStatusSuccess]}>
                  {actionStatus}
                </Text>
              ) : null}

              <View style={S.actionRow}>
                <TouchableOpacity
                  style={[S.downloadBtn, (downloading || emailing) && S.disabled]}
                  onPress={handleDownload}
                  disabled={downloading || emailing}
                  activeOpacity={0.85}
                >
                  {downloading
                    ? <ActivityIndicator color={C.white} size="small" />
                    : <View style={S.actionBtnInner}><IconDownload /><Text style={S.downloadText}>Download</Text></View>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.emailBtn, (downloading || emailing) && S.disabled]}
                  onPress={handleEmail}
                  disabled={downloading || emailing}
                  activeOpacity={0.85}
                >
                  {emailing
                    ? <ActivityIndicator color={C.brand500} size="small" />
                    : <View style={S.actionBtnInner}><IconMail /><Text style={S.emailText}>Email</Text></View>
                  }
                </TouchableOpacity>
              </View>

              {/* Navigation */}
              <View style={S.navRow}>
                <TouchableOpacity style={S.newOrderBtn} onPress={onNewOrder} activeOpacity={0.85}>
                  <Text style={S.newOrderText}>New Order</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.queueBtn} onPress={onBackToQueue ?? onClose} activeOpacity={0.75}>
                  <Text style={S.queueText}>Back to Queue</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

        </View>

        {hiddenReceipt}
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  // Backdrop
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10,18,30,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Card
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  // Header
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100,
  },
  headerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  headerSub:   { fontSize: 12, color: C.gray500, marginTop: 1 },
  successBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.brand50, alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: C.brand100,
  },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.gray100, alignItems: "center", justifyContent: "center",
  },

  // Landscape layout
  landscapeBody: { flex: 1, flexDirection: "row", minHeight: 0 },
  codeColumn:    { width: 220, backgroundColor: C.brand50, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#c3d6f0" },
  codeColumnContent: { flexGrow: 1 },
  receiptColumn: { flex: 1, backgroundColor: C.white },

  // Claim code card
  codeCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brand50,
    paddingHorizontal: 20,
    paddingTop: 24, paddingBottom: 20,
  },
  codeCardLandscape: {
    flex: 1, paddingTop: 24, justifyContent: "flex-start",
  },
  fulfillmentRow: { alignItems: "center", marginBottom: 10 },
  fulfillmentBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  fulfillmentPickup:  { backgroundColor: C.brand50 },
  fulfillmentDelivery: { backgroundColor: C.warning100 },
  fulfillmentText: { fontSize: 12, fontWeight: "700" },
  fulfillmentPickupText:  { color: C.brand700 },
  fulfillmentDeliveryText: { color: C.warning700 },

  unpaidBadge: { marginTop: 6, alignSelf: "flex-start", backgroundColor: C.warning100, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  unpaidText: { fontSize: 12, fontWeight: "700", color: C.warning700 },

  codeEyebrow: {
    fontSize: 10, fontWeight: "700", letterSpacing: 2,
    textTransform: "uppercase", color: C.brand500, marginBottom: 10,
  },
  codeText: {
    fontSize: 52,
    fontWeight: "800",
    color: "#0e2a4e",
    letterSpacing: 6,
    textAlign: "center",
    width: "100%",
  },
  codeTextLandscape: {
    fontSize: 40,
    letterSpacing: 4,
  },
  codeHint: {
    fontSize: 11, color: C.gray500,
    textAlign: "center", marginTop: 8, lineHeight: 16,
  },

  // Ticket dashed divider + pickup note (landscape claim panel)
  ticketDash: {
    width: "90%", borderTopWidth: 1, borderStyle: "dashed",
    borderTopColor: "#93b9d8", marginVertical: 12,
  },
  ticketPickup: {
    fontSize: 10, color: C.brand400, textAlign: "center",
    fontWeight: "600", letterSpacing: 0.4,
  },

  // Landscape quick summary (inside code column)
  summaryRow:   { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 3, width: "100%" },
  summaryLabel: { fontSize: 12, color: C.gray500 },
  summaryValue: { fontSize: 12, color: C.gray700 },
  summaryTotal: { fontWeight: "800", fontSize: 14, color: "#0e2a4e" },

  // Receipt summary
  receiptPad:   { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 },
  receiptDate:  { fontSize: 12, color: C.gray500, marginBottom: 2 },
  receiptMeta:  { fontSize: 12, color: C.gray500 },
  divider:      { height: 1, backgroundColor: C.gray100, marginVertical: 10 },
  itemRow:      { flexDirection: "row", alignItems: "flex-start", paddingVertical: 4 },
  itemName:     { fontSize: 13, fontWeight: "600", color: C.gray800 },
  itemQty:      { fontSize: 11, color: C.gray500, marginTop: 1 },
  itemTotal:    { fontSize: 13, fontWeight: "700", color: C.gray900, minWidth: 72, textAlign: "right" },
  totalRow:     { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalLabel:   { fontSize: 13, color: C.gray500 },
  totalValue:   { fontSize: 13, fontWeight: "600", color: C.gray800 },
  totalBold:    { fontSize: 16, fontWeight: "800", color: C.gray900 },
  green:        { color: "#059669" },

  // Footer
  footer: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.gray100,
  },
  // In landscape: center-align and cap button width so they don't span wall-to-wall
  footerInnerLandscape: {
    maxWidth: 540, alignSelf: "center", width: "100%", gap: 8,
  },
  actionStatusText: {
    fontSize: 11, color: C.gray500, textAlign: "center",
    marginBottom: 4,
  },
  actionStatusSuccess: {
    color: "#059669", fontWeight: "600",
  },
  receiptColumnHeader: {
    fontSize: 10, fontWeight: "700", letterSpacing: 2,
    textTransform: "uppercase", color: C.brand500, marginBottom: 10,
  },

  // Download / Email — equal-weight action row
  actionRow: {
    flexDirection: "row", gap: 8, height: 48, marginBottom: 8,
  },
  actionBtnInner: { flexDirection: "row", alignItems: "center", gap: 6 },
  downloadBtn: {
    flex: 1, borderRadius: RADIUS.lg,
    backgroundColor: C.brand500,
    alignItems: "center", justifyContent: "center",
  },
  downloadText: { fontSize: 14, fontWeight: "700", color: C.white },
  emailBtn: {
    flex: 1, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: C.brand500,
    alignItems: "center", justifyContent: "center",
  },
  emailText: { fontSize: 14, fontWeight: "700", color: C.brand500 },

  // Navigation row
  navRow: { flexDirection: "row", gap: 8 },
  newOrderBtn: {
    flex: 1, height: 46, borderRadius: RADIUS.lg,
    backgroundColor: C.gray900, alignItems: "center", justifyContent: "center",
  },
  newOrderText: { fontSize: 14, fontWeight: "700", color: C.white },
  queueBtn: {
    flex: 1, height: 46, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: C.gray300,
    alignItems: "center", justifyContent: "center",
  },
  queueText: { fontSize: 14, fontWeight: "600", color: C.gray700 },

  disabled: { opacity: 0.55 },
});
