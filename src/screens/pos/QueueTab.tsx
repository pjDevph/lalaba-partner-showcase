// Queue tab — live order queue with status filters + advance/release actions. Extracted from pos.tsx.
import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, RefreshControl, useWindowDimensions } from "react-native";
import { C, SP } from "../../theme/tokens";
import { Chip } from "../../components/ui";
import { OrderDetailSheet } from "../../components/pos/OrderDetailSheet";
import { gqlMarkOrderInProgress, gqlMarkOrderReady } from "../../services/graphql/orders";
import { type POSOrder, POS_STATUS_LABELS } from "../../types/pos.types";
import { ActivityLog, type LogActor } from "../../utils/logActivity";
import { useAuthStore } from "../../stores/authStore";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { useCan } from "../../hooks/usePermission";
import { useFontScale } from "../../../app/_layout";
import { Icon, fd, fp, ft } from "./shared";
import { useReceiptDownload } from "./queueHelpers";
import { CancelOrderModal } from "./CancelOrderModal";
import { RefundModal } from "./RefundModal";
import { EditOrderModal } from "./EditOrderModal";
import { P, S } from "./styles";
import { toUserMessage } from "../../utils/userError";

const QUEUE_FILTERS = ["All", "New", "In Progress", "Ready", "Claimed"] as const;
type QueueFilter = (typeof QUEUE_FILTERS)[number];

const STATUS_FROM_FILTER: Record<QueueFilter, string | null> = {
  All:          null,
  New:          "CREATED",
  "In Progress": "PROCESSING",
  Ready:        "READY_FOR_PICKUP",
  Claimed:      "CLAIMED",
};

const QUEUE_ACCENT_COLOR: Partial<Record<string, string>> = {
  CREATED:          P.warning,
  PROCESSING:       P.blue,
  READY_FOR_PICKUP: P.success,
  CLAIMED:          P.muted,
};

const QUEUE_CHIP_VARIANT: Record<string, "warning" | "info" | "brand" | "success" | "gray"> = {
  CREATED:          "warning",
  PROCESSING:       "info",
  READY_FOR_PICKUP: "success",
  CLAIMED:          "gray",
};

// CTA color = what the order BECOMES
const ADV_BTN_COLOR: Partial<Record<string, string>> = {
  CREATED:          P.blue,
  PROCESSING:       P.success,
  READY_FOR_PICKUP: P.text,  // "Release Order" — dark
};


// Product-only orders have nothing to wash/process — they don't belong in the queue.
function hasServiceItem(o: POSOrder): boolean {
  return (o.items ?? []).some((i) => (i.type ?? "service") === "service");
}

function filterCount(f: QueueFilter, allOrders: POSOrder[]): number {
  if (f === "All") return allOrders.filter((o) => (o.status as string) !== "CANCELLED").length;
  const s = STATUS_FROM_FILTER[f];
  if (!s) return 0;
  return allOrders.filter((o) => o.status === s).length;
}

// Converts a Firestore POSOrder into the GqlOrder shape for receipt generation

// ─── Order detail footer ────────────────────────────────────────────────────────
function renderDetailFooter(
  order: POSOrder | null,
  role: string | null,
  handlers: Readonly<{
    onCancel: (o: POSOrder) => void;
    onAdvance: (o: POSOrder) => void;
    onRefund: (o: POSOrder) => void;
    onDownload: (o: POSOrder) => void;
    onClaim: (o: POSOrder) => void;
    onEdit?: (o: POSOrder) => void;
  }>,
  perms: Readonly<{
    canCancelUnpaidOrder: boolean;
    canCancelPaidOrder: boolean;
    canUpdateOrderStatus: boolean;
    canConfirmPickup: boolean;
  }>,
): React.ReactNode {
  if (!order || order.status === "CANCELLED" || order.status === "VOID") return null;

  const isPaid = (order.paymentStatus as string)?.toLowerCase() === "paid";
  const canRefund = perms.canCancelPaidOrder && isPaid && (order.paymentStatus as string)?.toLowerCase() !== "refunded";
  const isClaimed = order.status === "CLAIMED";
  const isReady = order.status === "READY_FOR_PICKUP";
  const canCancel = isPaid ? perms.canCancelPaidOrder : perms.canCancelUnpaidOrder;

  let nextLabel: string | null = null;
  if (order.status === "CREATED") nextLabel = "Start Processing";
  else if (order.status === "PROCESSING") nextLabel = "Mark Ready";
  const ctaColor = ADV_BTN_COLOR[order.status];

  const primaryCta = isReady ? (
    <TouchableOpacity
      style={[S.detailAdvanceBtn, { backgroundColor: P.text }, !perms.canConfirmPickup && { opacity: 0.4 }]}
      onPress={() => handlers.onClaim(order)}
      disabled={!perms.canConfirmPickup}
      activeOpacity={0.85}
    >
      <Text style={S.detailAdvanceText}>Release Order</Text>
    </TouchableOpacity>
  ) : nextLabel && ctaColor ? (
    <TouchableOpacity
      style={[S.detailAdvanceBtn, { backgroundColor: ctaColor }, !perms.canUpdateOrderStatus && { opacity: 0.4 }]}
      onPress={() => handlers.onAdvance(order)}
      disabled={!perms.canUpdateOrderStatus}
      activeOpacity={0.85}
    >
      <Text style={S.detailAdvanceText}>{nextLabel}</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <>
      {/* Secondary actions row */}
      <View style={S.detailSecondaryRow}>
        {order.status === "CREATED" && handlers.onEdit && (role === "MERCHANT" || role === "STAFF") && (
          <TouchableOpacity
            style={[S.detailSecondaryBtn, { borderColor: P.blue, backgroundColor: P.blueTint }]}
            onPress={() => handlers.onEdit!(order)}
            activeOpacity={0.8}
          >
            <Text style={[S.detailSecondaryText, { color: P.blue }]}>Edit</Text>
          </TouchableOpacity>
        )}
        {canRefund && (
          <TouchableOpacity
            style={[S.detailSecondaryBtn, { borderColor: P.success, backgroundColor: "#F0FBF6" }]}
            onPress={() => handlers.onRefund(order)}
            activeOpacity={0.8}
          >
            <Text style={[S.detailSecondaryText, { color: P.success }]}>Refund</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[S.detailSecondaryBtn, { borderColor: P.muted }]}
          onPress={() => handlers.onDownload(order)}
          activeOpacity={0.8}
        >
          <Text style={[S.detailSecondaryText, { color: P.muted }]}>Download</Text>
        </TouchableOpacity>
        {!isClaimed && (
          <TouchableOpacity
            style={[S.detailSecondaryBtn, !canCancel && { opacity: 0.4 }]}
            onPress={() => handlers.onCancel(order)}
            disabled={!canCancel}
            activeOpacity={0.8}
          >
            <Text style={S.detailSecondaryText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Primary CTA — full width */}
      {primaryCta}
    </>
  );
}

export function QueueTab({
  orders,
  onReleaseOrder,
  onRefresh,
  refreshing = false,
}: Readonly<{
  orders: POSOrder[];
  onReleaseOrder: (o: POSOrder) => void;
  /** Pull-to-refresh — refetches the queue (it is not polled in the background). */
  onRefresh?: () => void;
  refreshing?: boolean;
}>) {
  const fs = useFontScale();
  const { width: _qw, height: _qh } = useWindowDimensions();
  const isLandscape = _qw > _qh;
  const push = useNotificationStore((s) => s.push);
  const merchantId = useAuthStore((s) => s.merchantId);
  const role = useAuthStore((s) => s.role);
  const { getActor } = useActiveStaffStore();
  const { user } = useAuthStore((s) => ({ user: s.user }));
  const canCancelUnpaidOrder = useCan("canCancelUnpaidOrder");
  const canCancelPaidOrder = useCan("canCancelPaidOrder");
  const canUpdateOrderStatus = useCan("canUpdateOrderStatus");
  const canConfirmPickup = useCan("canConfirmPickup");

  const [cancelOrder, setCancelOrder] = useState<POSOrder | null>(null);
  const [refundOrder, setRefundOrder] = useState<POSOrder | null>(null);
  const [pendingAdvance, setPendingAdvance] = useState<POSOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<POSOrder | null>(null);
  const { download: downloadReceipt, hiddenReceipt } = useReceiptDownload();
  const [editOrder, setEditOrder] = useState<POSOrder | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("All");
  const [searchQ, setSearchQ] = useState("");
  const actor: LogActor = getActor({
    id: user?.uid ?? merchantId ?? "owner",
    name: user?.displayName ?? "Owner",
  });

  // Always stay in sync with live Firestore data
  const liveDetailOrder = detailOrder
    ? (orders.find((o) => o.id === detailOrder.id) ?? detailOrder)
    : null;

  const queueOrders = useMemo(() => orders.filter(hasServiceItem), [orders]);

  const q = searchQ.trim().toLowerCase();
  const displayOrders = (() => {
    const byStatus = activeFilter === "All"
      ? queueOrders.filter((o) => (o.status as string) !== "CANCELLED")
      : queueOrders.filter((o) => o.status === STATUS_FROM_FILTER[activeFilter]);
    if (!q) return byStatus;
    return byStatus.filter((o) =>
      o.walkinCustomer?.name?.toLowerCase().includes(q) ||
      o.walkinCustomer?.phone?.includes(q) ||
      (o.claimCode ?? "").toLowerCase().includes(q) ||
      ((o as any).orderNumber ?? "").toLowerCase().includes(q)
    );
  })();

  const advance = async (order: POSOrder) => {
    const NEXT: Partial<Record<string, string>> = {
      CREATED:    "PROCESSING",
      PROCESSING: "READY_FOR_PICKUP",
    };
    const next = NEXT[order.status];
    if (!next) return;
    try {
      if (order.status === "CREATED") {
        await gqlMarkOrderInProgress(order.id);
      } else if (order.status === "PROCESSING") {
        await gqlMarkOrderReady(order.id);
      }
      useQueueStore.getState().upsertOrder({ ...order, status: next as POSOrder["status"] });
      push({ type: "success", title: "Status updated" });
      if (merchantId) {
        await ActivityLog.orderStatusChanged(
          merchantId, actor, order.id,
          order.claimCode ?? order.id.slice(-6).toUpperCase(),
          order.status, next
        );
      }
    } catch (err: unknown) {
      push({ type: "error", title: "Error", message: toUserMessage(err, "Try again.") });
    }
  };

  // Close the detail modal first to avoid stacking modals.
  const footerHandlers = {
    onCancel: (o: POSOrder) => { setDetailOrder(null); setCancelOrder(o); },
    onRefund: (o: POSOrder) => { setDetailOrder(null); setRefundOrder(o); },
    onAdvance: (o: POSOrder) => { setDetailOrder(null); setPendingAdvance(o); },
    onDownload: (o: POSOrder) => downloadReceipt(o),
    onClaim: (o: POSOrder) => { setDetailOrder(null); onReleaseOrder(o); },
    onEdit: (o: POSOrder) => { setDetailOrder(null); setEditOrder(o); },
  };

  const searchBlock = (
    <View style={[S.searchRow, isLandscape ? { flex: 1, margin: 0 } : { margin: SP._12, marginBottom: 0 }]}>
      <Icon.Search />
      <TextInput
        style={S.searchInput}
        placeholder="Search by name, code..."
        value={searchQ}
        onChangeText={setSearchQ}
        placeholderTextColor={C.gray400}
        returnKeyType="search"
      />
      {searchQ.length > 0 && (
        <TouchableOpacity onPress={() => setSearchQ("")} hitSlop={8}>
          <Icon.X s={13} />
        </TouchableOpacity>
      )}
    </View>
  );

  const filterBlock = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={S.filterRow}
      style={S.filterScroll}
    >
      {QUEUE_FILTERS.map((f) => {
        const cnt = filterCount(f, queueOrders);
        return (
          <TouchableOpacity
            key={f}
            style={[S.filterChip, activeFilter === f && S.filterChipActive, { flexDirection: "row", alignItems: "center", gap: 4 }]}
            onPress={() => setActiveFilter(f)}
            activeOpacity={0.75}
          >
            <Text style={[S.filterChipText, activeFilter === f && S.filterChipTextActive]}>{f}</Text>
            {cnt > 0 && (
              <View style={[S.filterBadge, activeFilter === f && S.filterBadgeActive]}>
                <Text style={[S.filterBadgeText, activeFilter === f && S.filterBadgeTextActive]}>{cnt}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const queueList = (
    <>
      {/* Search + filters — one row in landscape, stacked in portrait */}
      {isLandscape ? (
        <View style={S.qLandscapeControlRow}>
          {searchBlock}
          {filterBlock}
        </View>
      ) : (
        <>
          {searchBlock}
          {filterBlock}
        </>
      )}

      {displayOrders.length === 0 ? (
        <View style={S.emptyPane}>
          <View style={S.emptyCircle}><Icon.Clock c={C.gray300} /></View>
          <Text style={S.emptyTitle}>{q ? "No results" : "Queue is clear"}</Text>
          <Text style={S.emptyBody}>
            {q ? `No orders match "${searchQ}"` : "New orders will appear here in real time."}
          </Text>
        </View>
      ) : (
        // A plain ScrollView + map instead of FlatList — this list is at most a
        // few dozen orders (not thousands), so virtualization isn't needed for
        // performance.
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[S.listPad, isLandscape && S.listPadLandscape]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} />
              : undefined
          }
        >
          {displayOrders.map((o) => {
            const createdAt = (o.createdAt as any)?.toDate?.() ?? new Date(((o.createdAt as any)?.seconds || 0) * 1000);
            const ticketShort = (o.claimCode ?? o.id.slice(-3)).toUpperCase().slice(-3);
            const accentColor = QUEUE_ACCENT_COLOR[o.status];
            const chipVariant = QUEUE_CHIP_VARIANT[o.status] ?? "gray";
            const statusLabel = POS_STATUS_LABELS[o.status] ?? o.status;
            const payChip = o.paymentStatus?.toLowerCase() === "paid" ? "Paid" : "Unpaid";
            let nextLabel: string | null = null;
            if (o.status === "CREATED") nextLabel = "Start Processing";
            else if (o.status === "PROCESSING") nextLabel = "Mark Ready";
            else if (o.status === "READY_FOR_PICKUP") nextLabel = o.fulfillmentType === "DELIVERY" ? "Deliver" : "Release";
            const ctaColor = ADV_BTN_COLOR[o.status];
            const showCancel = o.status !== "CLAIMED" && o.status !== "VOID" && (o.paymentStatus as string)?.toLowerCase() !== "paid";
            const canAdvanceThis = o.status === "READY_FOR_PICKUP" ? canConfirmPickup : canUpdateOrderStatus;
            const cancelLabel = o.status === "PROCESSING" ? "Cancel Processing" : "Cancel Order";
            const handleAdvancePress = () => {
              if (o.status === "READY_FOR_PICKUP") onReleaseOrder(o);
              else setPendingAdvance(o);
            };
            const serviceLine = (o.items ?? []).map((it) => {
              const qty = it.weightKg ?? 0;
              const unit = it.pricingType?.toLowerCase() === "per_load" ? `×${qty}` : `${qty}kg`;
              return `${it.serviceName ?? ""} · ${unit}`;
            }).join(", ");

            const isSelected = isLandscape && liveDetailOrder?.id === o.id;

            return (
              <TouchableOpacity
                key={o.id}
                style={[S.qCard, isSelected && S.qCardSelected]}
                activeOpacity={0.85}
                onPress={() => setDetailOrder(o)}
              >
                {isLandscape ? (
                  // Compact single-row layout, three zones separated by dividers:
                  // identity / status+waiting / price+action.
                  <View style={{ flexDirection: "row", minHeight: 100 }}>
                    {accentColor && <View style={[S.qStripe, { backgroundColor: accentColor }]} />}
                    <View style={S.qLsRow}>
                      <View style={S.qLsLeft}>
                        <View style={S.qTicketTile}>
                          <Text style={S.qTicketNum}>{ticketShort}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[S.qName, { fontSize: 14 * fs }]} numberOfLines={1}>
                            {o.walkinCustomer?.name ?? "Walk-in"}
                          </Text>
                          <Text style={[S.qServices, { fontSize: 11 * fs, marginBottom: 0 }]} numberOfLines={1}>
                            {serviceLine}
                          </Text>
                        </View>
                      </View>

                      <View style={S.qLsDivider} />

                      <View style={S.qLsMid}>
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP._6, rowGap: 4 }}>
                          <Chip variant={chipVariant} size="sm">{statusLabel}</Chip>
                          <Chip variant={o.paymentStatus?.toLowerCase() === "paid" ? "success" : "warning"} size="sm">{payChip}</Chip>
                        </View>
                        <Text style={S.qLsWaiting}>{fd(createdAt)}</Text>
                      </View>

                      <View style={S.qLsDivider} />

                      <View style={S.qLsRight}>
                        <Text style={[S.qAmt, { fontSize: 14 * fs }]}>{fp((o as any).totalAmount ?? 0)}</Text>
                        <View style={S.qLsActionsRow}>
                          {showCancel && (
                            <TouchableOpacity
                              style={[S.qCancelLandscapeBtn, { flex: 1 }]}
                              onPress={() => setCancelOrder(o)}
                              activeOpacity={0.75}
                            >
                              <Text style={S.qCancelLandscapeText}>{cancelLabel}</Text>
                            </TouchableOpacity>
                          )}
                          {nextLabel && ctaColor && (
                            <TouchableOpacity
                              style={[S.qCTA, S.qCTALandscape, { flex: 1, backgroundColor: ctaColor }, !canAdvanceThis && { opacity: 0.4 }]}
                              onPress={handleAdvancePress}
                              disabled={!canAdvanceThis}
                              activeOpacity={0.8}
                            >
                              <Text style={S.qCTAText}>{nextLabel}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  // Stacked layout — identity row, badges on their own row, full-width CTA anchoring the bottom.
                  <View style={{ flexDirection: "row" }}>
                    {accentColor && <View style={[S.qStripe, { backgroundColor: accentColor }]} />}
                    <View style={[S.qBody, { paddingHorizontal: SP._14 }]}>
                      <View style={[S.qRowA, { alignItems: "center" }]}>
                        <View style={S.qTicketTile}>
                          <Text style={S.qTicketNum}>{ticketShort}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={S.qRowA1}>
                            <Text style={[S.qName, { fontSize: 14 * fs }]} numberOfLines={1}>
                              {o.walkinCustomer?.name ?? "Walk-in"}
                            </Text>
                            <Text style={[S.qAmt, { fontSize: 14 * fs }]}>{fp((o as any).totalAmount ?? 0)}</Text>
                          </View>
                          <Text style={[S.qServices, { fontSize: 11 * fs }]} numberOfLines={1}>
                            {serviceLine}
                            {" · "}{ft(createdAt)}
                            {" · "}{fd(createdAt)}
                          </Text>
                        </View>
                      </View>

                      <View style={S.qBadgeRow}>
                        <View style={{ flexDirection: "row", gap: SP._8, flexWrap: "wrap", flex: 1 }}>
                          <Chip variant={chipVariant} size="sm">{statusLabel}</Chip>
                          <Chip variant={o.paymentStatus?.toLowerCase() === "paid" ? "success" : "warning"} size="sm">{payChip}</Chip>
                        </View>
                      </View>

                      {nextLabel && ctaColor && (
                        <TouchableOpacity
                          style={[S.qCTA, S.qCTAPortrait, { backgroundColor: ctaColor }, !canAdvanceThis && { opacity: 0.4 }]}
                          onPress={handleAdvancePress}
                          disabled={!canAdvanceThis}
                          activeOpacity={0.8}
                        >
                          <Text style={S.qCTAText}>{nextLabel}</Text>
                        </TouchableOpacity>
                      )}

                      {showCancel && (
                        <TouchableOpacity
                          style={{ alignSelf: "center", marginTop: SP._8, padding: SP._4 }}
                          onPress={() => setCancelOrder(o)}
                          hitSlop={8}
                          activeOpacity={0.7}
                        >
                          <Text style={S.qCancelOutlineText}>{cancelLabel}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </>
  );

  const detailFooter = renderDetailFooter(liveDetailOrder, role, footerHandlers, {
    canCancelUnpaidOrder, canCancelPaidOrder, canUpdateOrderStatus, canConfirmPickup,
  });

  return (
    <View style={{ flex: 1, flexDirection: isLandscape ? "row" : "column" }}>
      <View style={isLandscape ? { flex: 1, minWidth: 460, maxWidth: 560 } : { flex: 1 }}>
        {queueList}
      </View>
      {hiddenReceipt}

      {isLandscape ? (
        <View style={{ flex: 1, minWidth: 380, borderLeftWidth: 1, borderLeftColor: C.gray200 }}>
          <OrderDetailSheet
            variant="inline"
            order={liveDetailOrder}
            onClose={() => setDetailOrder(null)}
            footer={detailFooter}
          />
        </View>
      ) : (
        <OrderDetailSheet
          order={liveDetailOrder}
          onClose={() => setDetailOrder(null)}
          footer={detailFooter}
        />
      )}

      <CancelOrderModal order={cancelOrder} onClose={() => setCancelOrder(null)} merchantId={merchantId ?? ""} actor={actor} />
      <RefundModal order={refundOrder} onClose={() => setRefundOrder(null)} merchantId={merchantId ?? ""} actor={actor} />
      <EditOrderModal order={editOrder} onClose={() => setEditOrder(null)} merchantId={merchantId ?? ""} actor={actor} />

      {/* Status-advance confirmation */}
      {(() => {
        const advancingToReady = pendingAdvance?.status === "PROCESSING";
        const titleText   = advancingToReady ? "Mark as Ready?" : "Start Processing?";
        const newStateTxt = advancingToReady
          ? (pendingAdvance?.fulfillmentType === "DELIVERY" ? "Ready for Delivery" : "Ready for Pickup")
          : "Processing";
        const ctaText     = advancingToReady ? "Mark Ready" : "Start Processing";
        return (
          <Modal supportedOrientations={["portrait", "landscape"]} visible={pendingAdvance !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setPendingAdvance(null)}>
            <View style={S.pmOverlay}>
              <View style={S.pmCard}>
                <Text style={S.pmTitle}>{titleText}</Text>
                <Text style={S.pmBody}>
                  Mark order{" "}
                  <Text style={{ fontWeight: "700" }}>
                    {(pendingAdvance?.claimCode ?? pendingAdvance?.id?.slice(-6) ?? "").toUpperCase()}
                  </Text>{" "}
                  as {newStateTxt}? This action cannot be undone.
                </Text>
                <View style={S.pmActions}>
                  <TouchableOpacity style={S.pmCancel} onPress={() => setPendingAdvance(null)} activeOpacity={0.8}>
                    <Text style={S.pmCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={S.pmConfirm}
                    onPress={() => { if (pendingAdvance) { advance(pendingAdvance); } setPendingAdvance(null); }}
                    activeOpacity={0.8}
                  >
                    <Text style={S.pmConfirmText}>{ctaText}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </View>
  );
}
