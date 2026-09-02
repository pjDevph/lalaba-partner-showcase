// src/components/pos/QueueCard.tsx
// Single row in the live order queue.
// Shows status chip, claim code, customer name, total, and an advance button.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { POSOrder } from "../../types/pos.types";
import { POS_STATUS_LABELS, POS_STATUS_COLORS } from "../../types/pos.types";

interface QueueCardProps {
  order: POSOrder;
  onPress: (order: POSOrder) => void;
  onAdvance?: (order: POSOrder) => void;
  isAdvancing?: boolean;
}

export function QueueCard({ order, onPress, onAdvance, isAdvancing }: Readonly<QueueCardProps>) {
  const isClaimed = order.status === "CLAIMED";
  const canAdvance = isClaimed === false && order.status !== "READY_FOR_PICKUP" && onAdvance;
  const statusColor = POS_STATUS_COLORS[order.status];

  const customerLabel =
    order.walkinCustomer?.name?.trim() || order.walkinCustomer?.phone?.trim() || "Walk-in"; // NOSONAR — intentional: catches empty string

  return (
    <TouchableOpacity
      style={[styles.card, isClaimed && styles.cardClaimed]}
      onPress={() => onPress(order)}
      activeOpacity={0.8}
    >
      {/* Left: status stripe */}
      <View style={[styles.stripe, { backgroundColor: statusColor }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Text style={styles.claimCode}>{order.claimCode}</Text>
          <StatusChip status={order.status} color={statusColor} />
        </View>

        {/* Customer + time */}
        <Text style={styles.customerName}>{customerLabel}</Text>
        <Text style={styles.items}>
          {order.items.map((i) => `${i.serviceName} (${i.weightKg}kg)`).join(" · ")}
        </Text>

        {/* Bottom row */}
        <View style={styles.bottomRow}>
          <Text style={styles.amount}>₱{order.totalAmount.toFixed(2)}</Text>
          <Text style={styles.paymentBadge}>{order.paymentMethod}</Text>

          {canAdvance && (
            <TouchableOpacity
              style={[styles.advanceBtn, isAdvancing && styles.advanceBtnDisabled]}
              onPress={() => onAdvance?.(order)}
              disabled={isAdvancing}
            >
              <Text style={styles.advanceBtnText}>
                {isAdvancing ? "…" : "Advance →"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StatusChip({ status, color }: Readonly<{ status: string; color: string }>) {
  return (
    <View style={[styles.chip, { backgroundColor: color + "20" }]}>
      <Text style={[styles.chipText, { color }]}>
        {POS_STATUS_LABELS[status as keyof typeof POS_STATUS_LABELS] ?? status}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    overflow: "hidden",
  },
  cardClaimed: {
    opacity: 0.55,
  },
  stripe: {
    width: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  claimCode: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0ea5e9",
    letterSpacing: 3,
  },
  chip: {
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 2,
  },
  items: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  paymentBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  advanceBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  advanceBtnDisabled: {
    backgroundColor: "#bae6fd",
  },
  advanceBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
