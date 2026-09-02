// Claim tab — look up an order by code and release it to the customer. Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { errField } from "../../utils/userError";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal, ActivityIndicator, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { Chip } from "../../components/ui";
import { gqlProcessPayment, gqlProcessPickup } from "../../services/graphql/orders";
import { ActivityLog, type LogActor } from "../../utils/logActivity";
import { type POSOrder, type POSPaymentMethod, POS_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "../../types/pos.types";
import { useAuthStore } from "../../stores/authStore";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { useCan } from "../../hooks/usePermission";
import { useFontScale } from "../../../app/_layout";
import { Icon, fp, ft } from "./shared";
import { getWaitingTime, useReceiptDownload } from "./queueHelpers";
import { P, S } from "./styles";

export function ClaimTab({
  orders,
  pendingReleaseOrder,
  onPendingReleaseHandled,
  onRefresh,
  refreshing = false,
}: Readonly<{
  orders: POSOrder[];
  pendingReleaseOrder?: POSOrder | null;
  onPendingReleaseHandled?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}>) {
  const fs = useFontScale();
  const { width: _w, height: _h } = useWindowDimensions();
  const isLandscape = _w > _h;
  const push = useNotificationStore((s) => s.push);
  const merchantId = useAuthStore((s) => s.merchantId);
  const { getActor } = useActiveStaffStore();
  const { user } = useAuthStore((s) => ({ user: s.user }));
  const canConfirmPickup = useCan("canConfirmPickup");

  const [codeInput, setCodeInput] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimedOrder, setClaimedOrder] = useState<POSOrder | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<POSOrder | null>(null);
  const [codeChecked, setCodeChecked] = useState(false);
  const [handedChecked, setHandedChecked] = useState(false);
  const [collectCashInput, setCollectCashInput] = useState("");
  const [collectPayMethod, setCollectPayMethod] = useState<POSPaymentMethod>("CASH");
  const [collectRefInput, setCollectRefInput] = useState("");
  const { download: downloadReceipt, hiddenReceipt } = useReceiptDownload();

  const actor: LogActor = getActor({
    id: user?.uid ?? merchantId ?? "owner",
    name: user?.displayName ?? "Owner",
  });

  // Reset checkboxes and payment inputs each time a new release target is selected
  useEffect(() => {
    setCodeChecked(false);
    setHandedChecked(false);
    setCollectCashInput("");
    setCollectPayMethod("CASH");
    setCollectRefInput("");
  }, [releaseTarget?.id]);

  // Queue tab (and order detail) hand off a "Release" tap here instead of
  // running their own confirmation flow, so payment collection is enforced
  // in exactly one place.
  useEffect(() => {
    if (pendingReleaseOrder) {
      setReleaseTarget(pendingReleaseOrder);
      onPendingReleaseHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReleaseOrder]);

  const ready = orders.filter((o) => o.status === "READY_FOR_PICKUP");

  const normalizedInput = codeInput.trim().toUpperCase();

  // Live match among ready orders only
  const matchedReady = normalizedInput.length >= 4
    ? ready.find((o) =>
        o.claimCode === normalizedInput ||
        o.id.slice(-6).toUpperCase() === normalizedInput ||
        o.id.slice(-3).toUpperCase() === normalizedInput
      ) ?? null
    : null;

  // Also match non-ready orders to show informative status
  const matchedAny = !matchedReady && normalizedInput.length >= 4
    ? orders.find((o) =>
        o.claimCode === normalizedInput ||
        o.id.slice(-6).toUpperCase() === normalizedInput ||
        o.id.slice(-3).toUpperCase() === normalizedInput
      ) ?? null
    : null;

  const noMatch = normalizedInput.length >= 4 && !matchedReady && !matchedAny;

  const nonReadyMessage = (() => {
    if (!matchedAny) return null;
    const st = matchedAny.status as string;
    const label = (POS_STATUS_LABELS as Record<string, string>)[st] ?? st;
    if (st === "CLAIMED") return { text: "This order has already been claimed.", color: C.success700 };
    if (st === "CANCELLED") return { text: "This order has been cancelled.", color: C.error500 };
    if (st === "CREATED" || st === "PROCESSING") return { text: `Order is still ${label}. Not ready for pickup yet.`, color: C.gray500 };
    return { text: `Order status: ${label}`, color: C.gray500 };
  })();

  const payChipLabel = (o: POSOrder) =>
    o.paymentStatus?.toLowerCase() === "paid" ? "Paid" : "Unpaid";
  const payChipVariant = (o: POSOrder): "success" | "info" | "warning" =>
    o.paymentStatus?.toLowerCase() === "paid" ? "success" : "warning";

  const doMarkClaimed = async (
    order: POSOrder,
    payment?: { method: POSPaymentMethod; amountPaid: number; referenceId?: string },
  ) => {
    setClaimingId(order.id);
    let paymentRecorded = false;
    try {
      if (payment && payment.amountPaid > 0) {
        await gqlProcessPayment(order.id, {
          paymentMethod: payment.method.toLowerCase(),
          amountPaid: payment.amountPaid,
          referenceId: payment.referenceId || undefined,
        });
        paymentRecorded = true;
      }
      await gqlProcessPickup(order.id);
      useQueueStore.getState().upsertOrder({ ...order, status: "CLAIMED", paymentStatus: paymentRecorded ? "paid" : order.paymentStatus });
      // Inventory is deducted server-side at order creation (pos-orders.service.ts
      // create() → deductInventory()), not here — claiming must not deduct again.
      push({ type: "success", title: "Claimed", message: "Pickup confirmed" });
      setCodeInput("");
      setClaimedOrder(order);
      if (merchantId) {
        await ActivityLog.orderStatusChanged(
          merchantId, actor, order.id,
          order.claimCode ?? order.id.slice(-6).toUpperCase(),
          "READY_FOR_PICKUP", "CLAIMED"
        );
      }
    } catch (err: unknown) {
      const msg = paymentRecorded
        ? `Payment was recorded but pickup confirmation failed — tap again to retry. (${errField(err, "message") ?? ""})`
        : (errField(err, "message") ?? "Try again.");
      push({ type: "error", title: "Error", message: msg });
    } finally {
      setClaimingId(null);
    }
  };

  // ── Release confirmation modal ────────────────────────────────────────────────
  const releaseModal = (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={releaseTarget !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setReleaseTarget(null)}>
      <View style={S.pmOverlay}>
        <View style={[
          S.pmCard,
          {
            maxWidth: isLandscape ? 660 : 400,
            width: isLandscape ? "80%" : "92%",
            maxHeight: _h * 0.88,
            padding: 0,
            overflow: "hidden",
          },
        ]}>
          {/* Fixed header */}
          <View style={{ paddingHorizontal: SP._20, paddingTop: SP._16, paddingBottom: SP._10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP._4 }}>
              <Text style={S.pmTitle}>{releaseTarget?.fulfillmentType === "DELIVERY" ? "Confirm Delivery?" : "Release Order?"}</Text>
              <TouchableOpacity onPress={() => setReleaseTarget(null)} hitSlop={8}>
                <Ionicons name="close" size={18} color={C.gray400} />
              </TouchableOpacity>
            </View>
            <Text style={[S.pmBody, { marginBottom: 0 }]}>{releaseTarget?.fulfillmentType === "DELIVERY" ? "Confirm before marking this order as delivered." : "Confirm before handing the order to the customer."}</Text>
          </View>

          {/* Scrollable body */}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: SP._20, paddingBottom: SP._8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {releaseTarget && (
              <View style={{ flexDirection: isLandscape ? "row" : "column", gap: SP._16 }}>
                {/* Claim verification panel */}
                <View style={{ flex: isLandscape ? 1 : undefined }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: SP._6 }}>Claim Code</Text>
                  <Text style={{ fontSize: 32, fontWeight: "900", letterSpacing: 8, color: P.blue, marginBottom: SP._16 }}>{releaseTarget.claimCode}</Text>

                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: SP._10, paddingVertical: SP._8 }} onPress={() => setCodeChecked((v) => !v)} activeOpacity={0.75}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: codeChecked ? P.blue : C.gray300, backgroundColor: codeChecked ? P.blue : C.white, alignItems: "center", justifyContent: "center" }}>
                      {codeChecked && <Ionicons name="checkmark" size={14} color={C.white} />}
                    </View>
                    <Text style={{ fontSize: 14, color: C.gray700, fontWeight: "500" }}>Claim code verified</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: SP._10, paddingVertical: SP._8 }} onPress={() => setHandedChecked((v) => !v)} activeOpacity={0.75}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: handedChecked ? P.blue : C.gray300, backgroundColor: handedChecked ? P.blue : C.white, alignItems: "center", justifyContent: "center" }}>
                      {handedChecked && <Ionicons name="checkmark" size={14} color={C.white} />}
                    </View>
                    <Text style={{ fontSize: 14, color: C.gray700, fontWeight: "500" }}>{releaseTarget?.fulfillmentType === "DELIVERY" ? "Items delivered to customer" : "Items handed to customer"}</Text>
                  </TouchableOpacity>
                </View>

                {/* Order summary panel */}
                <View style={[
                  { flex: isLandscape ? 1 : undefined },
                  isLandscape
                    ? { borderLeftWidth: 1, borderLeftColor: C.gray100, paddingLeft: SP._16 }
                    : { borderTopWidth: 1, borderTopColor: C.gray100, paddingTop: SP._14 },
                ]}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: SP._8 }}>Order Summary</Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray900, marginBottom: SP._8 }}>{releaseTarget.walkinCustomer?.name ?? "Walk-in"}</Text>
                  {(releaseTarget.items ?? []).map((it, i) => (
                    <View key={`${it.serviceId}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
                      <Text style={{ fontSize: 13, color: C.gray600 }} numberOfLines={1}>{it.serviceName} · {it.weightKg}kg</Text>
                      <Text style={{ fontSize: 13, color: C.gray800, fontWeight: "600" }}>{fp(it.lineTotal)}</Text>
                    </View>
                  ))}
                  <View style={{ height: 1, backgroundColor: C.gray100, marginVertical: SP._8 }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: SP._8 }}>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: C.gray900 }}>Total</Text>
                    <Text style={{ fontSize: 14, fontWeight: "800", color: C.gray900 }}>{fp(releaseTarget.totalAmount)}</Text>
                  </View>
                  <Chip variant={payChipVariant(releaseTarget)} size="sm">{payChipLabel(releaseTarget)}</Chip>

                  {/* Collect payment section — only shown for unpaid orders */}
                  {releaseTarget.paymentStatus?.toLowerCase() !== "paid" && (
                    <View style={{ marginTop: SP._12, backgroundColor: "#FEF3C7", borderRadius: 10, padding: SP._12, gap: SP._8 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400E" }}>⚠ Collect payment before releasing</Text>

                      {/* Payment method selector */}
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SP._6 }}>
                        {(["CASH", "GCASH", "MAYA", "CARD", "QPH", "BANK_TRANSFER"] as POSPaymentMethod[]).map((m) => (
                          <TouchableOpacity
                            key={m}
                            onPress={() => { setCollectPayMethod(m); setCollectCashInput(""); setCollectRefInput(""); }}
                            style={{ backgroundColor: collectPayMethod === m ? "#D97706" : C.white, borderRadius: 8, paddingVertical: SP._6, paddingHorizontal: SP._10, borderWidth: 1, borderColor: "#D97706" }}
                            activeOpacity={0.75}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "700", color: collectPayMethod === m ? C.white : "#92400E" }}>{PAYMENT_METHOD_LABELS[m]}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {/* Cash inputs */}
                      {collectPayMethod === "CASH" && (
                        <>
                          <View style={{ flexDirection: "row", gap: SP._6 }}>
                            {[
                              { label: "Exact", val: String(releaseTarget.totalAmount) },
                              { label: "₱500", val: "500" },
                              { label: "₱1,000", val: "1000" },
                            ].map((q) => (
                              <TouchableOpacity
                                key={q.label}
                                onPress={() => setCollectCashInput(q.val)}
                                style={{ flex: 1, backgroundColor: C.white, borderRadius: 8, paddingVertical: SP._6, alignItems: "center", borderWidth: 1, borderColor: "#D97706" }}
                                activeOpacity={0.75}
                              >
                                <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>{q.label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400E" }}>Cash Received (₱)</Text>
                          <TextInput
                            style={{ backgroundColor: C.white, borderRadius: 8, borderWidth: 1.5, borderColor: "#D97706", paddingHorizontal: SP._12, paddingVertical: SP._8, fontSize: 18, fontWeight: "700", color: C.gray900, textAlign: "center" }}
                            placeholder="0.00"
                            placeholderTextColor={C.gray400}
                            keyboardType="decimal-pad"
                            value={collectCashInput}
                            onChangeText={setCollectCashInput}
                          />
                          {Number.parseFloat(collectCashInput) >= releaseTarget.totalAmount && releaseTarget.totalAmount > 0 && (
                            <Text style={{ fontSize: 12, color: "#059669", fontWeight: "600", textAlign: "center" }}>
                              Change: {fp(Number.parseFloat(collectCashInput) - releaseTarget.totalAmount)}
                            </Text>
                          )}
                        </>
                      )}

                      {/* Reference number for digital payments */}
                      {(collectPayMethod === "GCASH" || collectPayMethod === "MAYA" || collectPayMethod === "CARD" || collectPayMethod === "QPH" || collectPayMethod === "BANK_TRANSFER") && (
                        <TextInput
                          style={{ backgroundColor: C.white, borderRadius: 8, borderWidth: 1.5, borderColor: "#D97706", paddingHorizontal: SP._12, paddingVertical: SP._8, fontSize: 14, color: C.gray900 }}
                          placeholder={`${PAYMENT_METHOD_LABELS[collectPayMethod]} reference no. (optional)`}
                          placeholderTextColor={C.gray400}
                          value={collectRefInput}
                          onChangeText={setCollectRefInput}
                          autoCapitalize="characters"
                        />
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Fixed footer buttons */}
          {(() => {
            const isUnpaid = releaseTarget?.paymentStatus?.toLowerCase() !== "paid";
            const cashAmt = Number.parseFloat(collectCashInput) || 0;
            const isCash = collectPayMethod === "CASH";
            const paymentSufficient = !isUnpaid || (isCash ? cashAmt >= (releaseTarget?.totalAmount ?? 0) : true);
            const canClaim = canConfirmPickup && codeChecked && handedChecked && paymentSufficient && claimingId === null;
            const payment = isUnpaid
              ? { method: collectPayMethod, amountPaid: isCash ? cashAmt : (releaseTarget?.totalAmount ?? 0), referenceId: collectRefInput || undefined }
              : undefined;
            return (
              <View style={[S.pmActions, { margin: SP._20, marginTop: SP._12 }]}>
                <TouchableOpacity style={S.pmCancel} onPress={() => setReleaseTarget(null)} activeOpacity={0.8}>
                  <Text style={S.pmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.pmConfirm, !canClaim && { opacity: 0.4 }]}
                  onPress={() => {
                    if (!canClaim || !releaseTarget) return;
                    const o = releaseTarget;
                    setReleaseTarget(null);
                    doMarkClaimed(o, payment);
                  }}
                  disabled={!canClaim}
                  activeOpacity={0.85}
                >
                  <Text style={S.pmConfirmText}>
                    {claimingId
                      ? (releaseTarget?.fulfillmentType === "DELIVERY" ? "Delivering…" : "Claiming…")
                      : isUnpaid
                        ? (releaseTarget?.fulfillmentType === "DELIVERY" ? "Collect & Deliver" : "Collect & Claim")
                        : (releaseTarget?.fulfillmentType === "DELIVERY" ? "Mark as Delivered" : "Mark as Claimed")}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      </View>
    </Modal>
  );

  // ── Manual mode ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.listPad}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} /> : undefined}
        automaticallyAdjustKeyboardInsets
      >
        {/* Input card */}
        <View style={S.lookupCard}>
          <Text style={S.lookupCardTitle}>Enter Claim Code</Text>
          <Text style={S.lookupCardSub}>From the customer&apos;s receipt</Text>

          <View style={[
            S.lookupInputRow,
            noMatch && S.lookupInputRowError,
            (matchedReady ?? matchedAny) && S.lookupInputRowFound,
          ]}>
            <TextInput
              style={S.lookupInputLarge}
              placeholder="A3F9"
              value={codeInput}
              onChangeText={(v) => setCodeInput(v.toUpperCase())}
              autoCapitalize="characters"
              placeholderTextColor={P.muted}
              maxLength={8}
              returnKeyType="done"
              autoFocus
            />
          </View>

          {noMatch && <Text style={S.lookupNoMatch}>No order matches &quot;{normalizedInput}&quot;</Text>}
          {matchedReady && <Text style={S.lookupFound}>✓ Order found — Ready for pickup</Text>}
          {nonReadyMessage && <Text style={[S.lookupNoMatch, { color: nonReadyMessage.color }]}>{nonReadyMessage.text}</Text>}
        </View>

        {/* Matched ready card */}
        {matchedReady && (
          <View style={S.matchedCard}>
            <View style={S.matchedTop}>
              <View style={{ flex: 1, marginRight: SP._8 }}>
                <Text style={S.matchedName} numberOfLines={1}>{matchedReady.walkinCustomer?.name ?? "Walk-in"}</Text>
                <Text style={S.matchedMeta} numberOfLines={1}>
                  {(matchedReady.items ?? []).map((it) => `${it.serviceName} · ${it.weightKg}kg`).join(", ")}
                </Text>
                <View style={{ flexDirection: "row", gap: SP._4, marginTop: SP._6 }}>
                  <Chip variant="success" size="sm">Ready</Chip>
                  <Chip variant={payChipVariant(matchedReady)} size="sm">{payChipLabel(matchedReady)}</Chip>
                </View>
              </View>
              <Text style={S.matchedAmt}>{fp((matchedReady as any).totalAmount ?? 0)}</Text>
            </View>
            <View style={S.matchedCodeRow}>
              <Text style={S.matchedCodeLabel}>CODE</Text>
              <Text style={S.matchedCodeValue}>{matchedReady.claimCode}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: SP._8 }}>
              <TouchableOpacity
                style={[S.matchedClaimBtn, { flex: 1, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 }]}
                onPress={() => downloadReceipt(matchedReady)}
                activeOpacity={0.8}
              >
                <Text style={[S.matchedClaimBtnText, { color: C.gray700 }]}>Download Slip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.matchedClaimBtn, { flex: 2, backgroundColor: P.blue }]}
                onPress={() => setReleaseTarget(matchedReady)}
                disabled={claimingId !== null}
                activeOpacity={0.85}
              >
                <Text style={S.matchedClaimBtnText}>Review Release</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Ready for pickup list */}
        <View style={S.readyHeader}>
          <Text style={S.readySectionLabel}>READY FOR PICKUP</Text>
          {ready.length > 0 && (
            <View style={S.readyBadge}><Text style={S.readyBadgeText}>{ready.length}</Text></View>
          )}
        </View>

        {ready.length === 0 ? (
          <View style={S.emptyPane}>
            <View style={S.emptyCircle}><Icon.Check c={C.gray300} s={20} /></View>
            <Text style={S.emptyTitle}>Nothing ready yet</Text>
            <Text style={S.emptyBody}>Mark orders ready from the Queue tab.</Text>
          </View>
        ) : (
          <View style={{ gap: SP._8 }}>
            {ready.map((order) => {
              const d = (order.createdAt as any)?.toDate?.() ?? new Date(((order.createdAt as any)?.seconds || 0) * 1000);
              const ticketShort = (order.claimCode ?? order.id.slice(-3)).toUpperCase().slice(-3);
              const isHighlighted = matchedReady?.id === order.id;
              const isClaiming = claimingId === order.id;
              const wt = getWaitingTime(order.createdAt);
              return (
                <View key={order.id} style={[S.qCard, isHighlighted && S.qCardHighlighted]}>
                  <View style={{ flexDirection: "row" }}>
                    <View style={[S.qStripe, { backgroundColor: P.success }]} />
                    <View style={S.qBody}>
                      <View style={S.qRowA}>
                        <View style={S.qTicketCol}>
                          <Text style={S.qTicketNum}>{ticketShort}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={S.qRowA1}>
                            <Text style={[S.qName, { fontSize: 14 * fs }]} numberOfLines={1}>{order.walkinCustomer?.name ?? "Walk-in"}</Text>
                            <Text style={[S.qAmt, { fontSize: 14 * fs }]}>{fp((order as any).totalAmount ?? 0)}</Text>
                          </View>
                          <Text style={[S.qServices, { fontSize: 11 * fs }]} numberOfLines={1}>
                            {(order.items ?? []).map((it) => `${it.serviceName} · ${it.weightKg}kg`).join(", ")}
                            {" · "}{ft(d)}{wt ? ` · ${wt} ago` : ""}
                          </Text>
                          <View style={[S.qRowA3, { marginTop: SP._4 }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: SP._6 }}>
                              <Text style={S.claimCodeInline}>{order.claimCode}</Text>
                              <Chip variant={payChipVariant(order)} size="sm">{payChipLabel(order)}</Chip>
                            </View>
                            <View style={S.qRowActions}>
                              <TouchableOpacity onPress={() => downloadReceipt(order)} hitSlop={8}>
                                <Text style={[S.qCancelText, { color: P.blue }]}>Download</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[S.qCTA, { backgroundColor: P.success }]}
                                onPress={() => setReleaseTarget(order)}
                                disabled={claimingId !== null}
                                activeOpacity={0.85}
                              >
                                {isClaiming
                                  ? <ActivityIndicator color={P.white} size="small" />
                                  : <Text style={S.qCTAText}>Review Release</Text>
                                }
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {releaseModal}
      {hiddenReceipt}

      {/* Claimed success modal */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={claimedOrder !== null} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setClaimedOrder(null)}>
        <View style={S.modalBg}>
          <View style={S.claimConfirmModal}>
            <View style={S.claimConfirmHeader}>
              <View style={S.claimConfirmCircle}><Icon.Check c={C.success700} s={24} /></View>
              <Text style={S.claimConfirmTitle}>Order Claimed</Text>
              <Text style={S.claimConfirmName}>{claimedOrder?.walkinCustomer?.name ?? "Walk-in"}</Text>
            </View>

            {claimedOrder && (
              <View style={S.claimConfirmItems}>
                {(claimedOrder.items ?? []).map((it) => (
                  <View key={it.serviceName} style={S.claimConfirmRow}>
                    <Text style={S.claimConfirmItemName} numberOfLines={1}>{it.serviceName}</Text>
                    <Text style={S.claimConfirmItemAmt}>{fp(it.lineTotal)}</Text>
                  </View>
                ))}
                <View style={[S.claimConfirmRow, S.claimConfirmTotalRow]}>
                  <Text style={S.claimConfirmTotalLabel}>Total</Text>
                  <Text style={S.claimConfirmTotalValue}>{fp(claimedOrder.totalAmount)}</Text>
                </View>
              </View>
            )}

            <View style={[S.claimConfirmActions, { gap: SP._8 }]}>
              {claimedOrder && (
                <TouchableOpacity
                  style={[S.claimConfirmDoneBtn, { backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 }]}
                  onPress={() => { downloadReceipt(claimedOrder); setClaimedOrder(null); }}
                  activeOpacity={0.8}
                >
                  <Text style={[S.claimConfirmDoneText, { color: C.gray700 }]}>Download Receipt</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={S.claimConfirmDoneBtn} onPress={() => setClaimedOrder(null)} activeOpacity={0.85}>
                <Text style={S.claimConfirmDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
