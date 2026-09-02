import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP, RADIUS } from "../../theme/tokens";
import type { POSLineItem, POSSplit, WalkinCustomer } from "../../types/pos.types";
import { PAYMENT_METHOD_LABELS } from "../../types/pos.types";

const fp = (v: number) => `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

interface POSSummaryModalProps {
  visible:         boolean;
  onClose:         () => void;
  onConfirm:       () => void;
  isSubmitting:    boolean;
  walkinCustomer:  WalkinCustomer;
  items:           POSLineItem[];
  notes?:          string;
  paymentMethod:   string;
  paymentTiming?:  "now" | "later";
  fulfillmentType?: "PICKUP" | "DELIVERY";
  amountReceived:  number;
  subtotal:        number;
  discountAmount:  number;
  discountCode?:   string;
  discountType?:   string;
  total:           number;
  splits:          POSSplit[];
}

export function POSSummaryModal({
  visible,
  onClose,
  onConfirm,
  isSubmitting,
  walkinCustomer,
  items,
  notes,
  paymentMethod,
  paymentTiming,
  fulfillmentType,
  amountReceived,
  subtotal,
  discountAmount,
  discountCode,
  discountType,
  total,
  splits,
}: Readonly<POSSummaryModalProps>) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  const isSplit       = splits.length > 0;
  const changeGiven   = paymentMethod === "CASH" && !isSplit
    ? Math.max(0, amountReceived - total)
    : 0;
  const customerLabel = [walkinCustomer.name, walkinCustomer.phone].filter(Boolean).join("  ·  ") || "Walk-in";
  const discountLabel = discountType
    ? ({ PWD: "PWD Discount", SENIOR: "Senior Discount", PERCENT: "Discount", FLAT: "Discount" }[discountType] ?? "Discount")
    : "Discount";

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[S.backdrop, isTablet && S.backdropTablet]}>
        <View style={[S.sheet, isTablet && S.sheetTablet, { paddingBottom: Math.max(insets.bottom, SP._16) }]}>
          {!isTablet && <View style={S.handle} />}
          <Text style={S.title}>Order Summary</Text>

          <ScrollView
            style={S.body}
            contentContainerStyle={S.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* ── Customer ── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>Customer</Text>
              <Text style={S.customerText}>{customerLabel}</Text>
            </View>

            <View style={S.divider} />

            {/* ── Items ── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>Items</Text>
              {items.map((item, idx) => {
                const isPerKg  = item.pricingType === "PER_KG";
                const qtyLabel = isPerKg
                  ? `${item.weightKg} kg × ${fp(item.unitPrice)}`
                  : fp(item.unitPrice);
                return (
                  <View key={`${item.serviceId}-${idx}`} style={S.itemRow}>
                    <View style={S.itemLeft}>
                      <Text style={S.itemName} numberOfLines={2}>{item.serviceName}</Text>
                      <Text style={S.itemQty}>{qtyLabel}</Text>
                    </View>
                    <Text style={S.itemTotal}>{fp(item.lineTotal)}</Text>
                  </View>
                );
              })}
            </View>

            {!!notes && (
              <>
                <View style={S.divider} />
                <View style={S.section}>
                  <Text style={S.sectionLabel}>Notes</Text>
                  <Text style={S.notesText}>{notes}</Text>
                </View>
              </>
            )}

            <View style={S.divider} />

            {/* ── Totals ── */}
            <View style={S.section}>
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Subtotal</Text>
                <Text style={S.totalValue}>{fp(subtotal)}</Text>
              </View>
              {discountAmount > 0 && (
                <View style={S.totalRow}>
                  <Text style={S.discountLabel}>
                    {discountLabel}{discountCode ? ` (${discountCode})` : ""}
                  </Text>
                  <Text style={S.discountValue}>-{fp(discountAmount)}</Text>
                </View>
              )}
              <View style={[S.totalRow, S.grandTotalRow]}>
                <Text style={S.grandTotalLabel}>Total</Text>
                <Text style={S.grandTotalValue}>{fp(total)}</Text>
              </View>
            </View>

            <View style={S.divider} />

            {/* ── Payment ── */}
            <View style={S.section}>
              <Text style={S.sectionLabel}>Payment</Text>
              {paymentTiming === "later" ? (
                <Text style={{ fontSize: 13, color: C.warning700, fontWeight: "600" }}>
                  {fulfillmentType === "DELIVERY" ? "Collect at delivery (Unpaid)" : "Collect at pickup (Unpaid)"}
                </Text>
              ) : isSplit ? (
                splits.map((sp, i) => (
                  <View key={`sp-${i}`} style={S.totalRow}>
                    <Text style={S.totalLabel}>{PAYMENT_METHOD_LABELS[sp.method] ?? sp.method}</Text>
                    <Text style={S.totalValue}>{fp(sp.amount)}</Text>
                  </View>
                ))
              ) : (
                <>
                  <View style={S.totalRow}>
                    <Text style={S.totalLabel}>Method</Text>
                    <Text style={S.totalValue}>{PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod}</Text>
                  </View>
                  {paymentMethod === "CASH" && amountReceived > 0 && (
                    <>
                      <View style={S.totalRow}>
                        <Text style={S.totalLabel}>Received</Text>
                        <Text style={S.totalValue}>{fp(amountReceived)}</Text>
                      </View>
                      <View style={S.totalRow}>
                        <Text style={S.totalLabel}>Change</Text>
                        <Text style={[S.totalValue, { color: C.success500, fontWeight: "600" }]}>
                          {fp(changeGiven)}
                        </Text>
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          </ScrollView>

          {/* ── Footer buttons ── */}
          <View style={S.footer}>
            <TouchableOpacity
              style={S.cancelBtn}
              onPress={onClose}
              disabled={isSubmitting}
              activeOpacity={0.75}
            >
              <Text style={S.cancelText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.confirmBtn, isSubmitting && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting
                ? <ActivityIndicator color={C.white} />
                : (
                  <Text style={S.confirmText}>
                    Place Order  {fp(total)}
                  </Text>
                )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdropTablet: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingTop: SP._12,
  },
  sheetTablet: {
    borderRadius: RADIUS.xl,
    width: "100%",
    maxWidth: 480,
    maxHeight: "82%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.gray300,
    marginBottom: SP._12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: C.gray900,
    textAlign: "center",
    marginBottom: SP._12,
    paddingHorizontal: SP._20,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: SP._20,
    paddingBottom: SP._8,
  },
  divider: {
    height: 1,
    backgroundColor: C.gray100,
    marginVertical: SP._8,
  },
  section: {
    gap: SP._6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.gray400,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SP._2,
  },
  customerText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray800,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SP._8,
    paddingVertical: SP._2,
  },
  itemLeft: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray800,
  },
  itemQty: {
    fontSize: 12,
    color: C.gray500,
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray800,
  },
  notesText: {
    fontSize: 13,
    color: C.gray600,
    fontStyle: "italic",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SP._2,
  },
  totalLabel: {
    fontSize: 13,
    color: C.gray600,
  },
  totalValue: {
    fontSize: 13,
    color: C.gray800,
    fontWeight: "500",
  },
  discountLabel: {
    fontSize: 13,
    color: C.success700,
  },
  discountValue: {
    fontSize: 13,
    color: C.success700,
    fontWeight: "500",
  },
  grandTotalRow: {
    marginTop: SP._4,
    paddingTop: SP._8,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: C.gray900,
  },
  grandTotalValue: {
    fontSize: 15,
    fontWeight: "700",
    color: C.gray900,
  },
  footer: {
    flexDirection: "row",
    gap: SP._10,
    paddingHorizontal: SP._20,
    paddingTop: SP._12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: C.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: C.gray700,
  },
  confirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.white,
  },
});
