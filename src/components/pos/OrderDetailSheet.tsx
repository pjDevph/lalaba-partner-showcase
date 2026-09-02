// src/components/pos/OrderDetailSheet.tsx
// Full order detail. variant="modal" (default) renders as a pageSheet Modal;
// variant="inline" renders as a plain panel for master-detail layouts
// (e.g. the landscape Queue tab), with its own "nothing selected" empty state.

import React from "react";
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  POS_STATUS_LABELS,
  POS_STATUS_COLORS,
  POS_STATUS_BG,
  POS_STATUS_TEXT,
  PAYMENT_METHOD_LABELS,
} from "../../types/pos.types";
import type { POSOrder, POSStatus } from "../../types/pos.types";
import { C, RADIUS, SP } from "../../theme/tokens";

const STATUS_FLOW: POSStatus[] = ["CREATED", "PROCESSING", "READY_FOR_PICKUP", "CLAIMED"];

function toDate(t: any): Date | null {
  if (!t) return null;
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  return null;
}

function money(v?: number): string {
  return typeof v === "number" && !Number.isNaN(v) ? `₱${v.toFixed(2)}` : "—";
}

function dateTime(d: Date | null): string {
  if (!d) return "";
  return `${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`;
}

export function OrderDetailSheet({
  order,
  onClose,
  footer,
  variant = "modal",
}: Readonly<{ order: POSOrder | null; onClose: () => void; footer?: React.ReactNode; variant?: "modal" | "inline" }>) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  if (variant === "inline") {
    if (!order) {
      return (
        <View style={s.inlineEmpty}>
          <Text style={s.inlineEmptyText}>Select an order to see its details</Text>
        </View>
      );
    }
    return <SafeAreaView style={s.safe} edges={["top", "bottom"]}>{renderInner(order, onClose, footer)}</SafeAreaView>;
  }

  if (!order) return null;

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible
      transparent={isTablet}
      // Android's transparent+fade Modal briefly flashes an opaque black
      // window before the JS content paints — "none" skips that flash.
      animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"}
      presentationStyle={isTablet ? "overFullScreen" : "pageSheet"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {isTablet ? (
        <View style={s.tabletOverlay}>
          <SafeAreaView style={[s.tabletCardBg, s.tabletCard]}>{renderInner(order, onClose, footer)}</SafeAreaView>
        </View>
      ) : (
        <SafeAreaView style={s.safe}>{renderInner(order, onClose, footer)}</SafeAreaView>
      )}
    </Modal>
  );
}

function renderInner(order: POSOrder, onClose: () => void, footer?: React.ReactNode) {
  const fg = (POS_STATUS_TEXT as Record<string, string>)[order.status] ?? C.gray600;
  const bg = (POS_STATUS_BG as Record<string, string>)[order.status] ?? C.gray100;
  const created = toDate(order.createdAt);
  const items = order.items ?? [];
  const discountSuffix = order.discountCode ? ` (${order.discountCode})` : "";

  const inner = (
    <>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{order.walkinCustomer?.name?.trim() || "Walk-in"/* NOSONAR */}</Text>
          <Text style={s.sub}>{dateTime(created)}</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={s.close}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Status + fulfillment + claim code */}
        <View style={s.topRow}>
          <View style={[s.badge, { backgroundColor: bg }]}>
            <Text style={[s.badgeText, { color: fg }]}>{POS_STATUS_LABELS[order.status] ?? order.status}</Text>
          </View>
          <View style={[s.fulfillPill, order.fulfillmentType === "DELIVERY" ? s.fulfillDelivery : s.fulfillPickup]}>
            <Text style={[s.fulfillPillText, order.fulfillmentType === "DELIVERY" ? s.fulfillDeliveryText : s.fulfillPickupText]}>
              {order.fulfillmentType === "DELIVERY" ? "🚚 Delivery" : "🛍 Pick-up"}
            </Text>
          </View>
          {!!order.claimCode && (
            <View style={s.claimPill}>
              <Text style={s.claimPillText}>Claim {order.claimCode}</Text>
            </View>
          )}
        </View>

        {/* Customer */}
        <Text style={s.section}>Customer</Text>
        <View style={s.card}>
          <Line label="Name" value={order.walkinCustomer?.name?.trim() || "Walk-in" /* NOSONAR */} />
          {!!order.walkinCustomer?.phone?.trim() && (
            <Line label="Phone" value={order.walkinCustomer.phone.trim()} />
          )}
          {!!order.walkinCustomer?.address?.trim() && (
            <Line label="Address" value={order.walkinCustomer.address.trim()} />
          )}
        </View>

        {/* Notes */}
        {!!order.notes?.trim() && (
          <>
            <Text style={s.section}>Notes</Text>
            <View style={s.notesCard}>
              <Text style={s.notesText}>{order.notes.trim()}</Text>
            </View>
          </>
        )}

        {/* Items */}
        <Text style={s.section}>Items</Text>
        <View style={s.card}>
          {items.map((it, idx) => (
            <View key={`${it.serviceId}-${idx}`} style={[s.itemRow, idx > 0 && s.itemRowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{it.serviceName}</Text>
                <Text style={s.itemMeta}>{it.weightKg} × {money(it.unitPrice)}</Text>
              </View>
              <Text style={s.itemTotal}>{money(it.lineTotal)}</Text>
            </View>
          ))}
          {items.length === 0 && <Text style={s.itemMeta}>No line items.</Text>}
        </View>

        {/* Payment */}
        <Text style={s.section}>Payment</Text>
        <View style={s.card}>
          <Line label="Subtotal" value={money(order.subtotal)} />
          {order.discountAmount > 0 && (
            <Line label={`Discount${discountSuffix}`} value={`−${money(order.discountAmount)}`} />
          )}
          <Line label="Total" value={money(order.totalAmount)} strong />
          {order.paymentStatus === "unpaid" ? (
            <View style={s.unpaidBadge}>
              <Text style={s.unpaidText}>Unpaid</Text>
            </View>
          ) : (
            <>
              <Line label="Method" value={PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod} />
              {order.paymentMethod === "CASH" && order.amountReceived > 0 && (
                <>
                  <Line label="Received" value={money(order.amountReceived)} />
                  <Line label="Change" value={money(order.changeGiven)} />
                </>
              )}
            </>
          )}
        </View>

        {/* Timeline — only if at least one status timestamp exists */}
        {STATUS_FLOW.some((st) => !!toDate(order.statusHistory?.[st])) && (
          <>
            <Text style={s.section}>Timeline</Text>
            <View style={s.card}>
              {STATUS_FLOW.map((st) => {
                const at = toDate(order.statusHistory?.[st]);
                if (!at) return null;
                return (
                  <View key={st} style={s.timelineRow}>
                    <View style={[s.timelineDot, { backgroundColor: (POS_STATUS_COLORS as Record<string, string>)[st] ?? C.gray400 }]} />
                    <Text style={s.timelineLabel}>{POS_STATUS_LABELS[st]}</Text>
                    <Text style={s.timelineTime}>{dateTime(at)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {footer ? (
        <View style={s.footer}>
          {footer}
        </View>
      ) : null}
    </>
  );

  return inner;
}

function Line({ label, value, strong }: Readonly<{ label: string; value: string; strong?: boolean }>) {
  return (
    <View style={s.line}>
      <Text style={[s.lineLabel, strong && s.lineStrong]}>{label}</Text>
      <Text style={[s.lineValue, strong && s.lineStrong]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.gray100 },
  inlineEmpty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100, padding: SP._24 },
  inlineEmptyText: { fontSize: 14, color: C.gray400, textAlign: "center" },
  // Tablet/landscape: center as a capped-width, fixed-height card instead of
  // taking over the whole screen like a phone-style page sheet.
  tabletOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 32,
  },
  // maxHeight (not height) so short orders hug their content instead of
  // stretching to fill 86% of the screen with empty space below the footer.
  tabletCard: {
    width: "100%", maxWidth: 480, maxHeight: "86%",
    borderRadius: RADIUS.xl, overflow: "hidden",
  },
  // Same background as `safe` but WITHOUT flex:1 — a flex:1 child of the
  // centered tabletOverlay would grow to fill all available space regardless
  // of maxHeight, defeating the hug-content sizing above.
  tabletCardBg: { backgroundColor: C.gray100 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SP._20, paddingVertical: SP._14, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  title: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  sub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 14, color: C.gray600, fontWeight: "700" },
  content: { padding: SP._16, paddingBottom: 240 },

  topRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  claimPill: { backgroundColor: C.brand100, borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 3 },
  claimPillText: { fontSize: 12, fontWeight: "800", color: C.brand700, letterSpacing: 0.5 },

  fulfillPill: { borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 3 },
  fulfillDelivery: { backgroundColor: "#EEF2FF" },
  fulfillPickup: { backgroundColor: C.gray100 },
  fulfillPillText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  fulfillDeliveryText: { color: "#4338CA" },
  fulfillPickupText: { color: C.gray600 },

  section: { fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginTop: SP._20, marginBottom: SP._8, marginLeft: SP._2 },
  card: { backgroundColor: C.white, borderRadius: RADIUS.md, padding: SP._14 },

  notesCard: { backgroundColor: C.warning100, borderRadius: RADIUS.md, padding: SP._14, borderWidth: 1, borderColor: C.warning300 },
  notesText: { fontSize: 14, color: C.warning700, lineHeight: 20, fontWeight: "500" },

  itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: SP._8 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: C.gray100 },
  itemName: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  itemMeta: { fontSize: 12, color: C.gray400, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: "700", color: C.gray900 },

  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SP._6 },
  lineLabel: { fontSize: 13, color: C.gray500 },
  lineValue: { fontSize: 13, color: C.gray900, fontWeight: "600" },
  lineStrong: { fontSize: 15, fontWeight: "800", color: C.gray900 },

  unpaidBadge: { marginTop: SP._6, alignSelf: "flex-start", backgroundColor: C.warning100, borderRadius: 20, paddingHorizontal: SP._10, paddingVertical: 3 },
  unpaidText: { fontSize: 12, fontWeight: "700", color: C.warning700 },

  timelineRow: { flexDirection: "row", alignItems: "center", gap: SP._8, paddingVertical: SP._6 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLabel: { fontSize: 13, fontWeight: "600", color: C.gray800, flex: 1 },
  timelineTime: { fontSize: 12, color: C.gray400 },

  footer: { padding: SP._16, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100, gap: SP._8 },
});
