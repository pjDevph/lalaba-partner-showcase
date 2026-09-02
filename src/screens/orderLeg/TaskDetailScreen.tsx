// src/screens/orderLeg/TaskDetailScreen.tsx
// One pickup or return leg of an online order, wired to the real leg state
// machine:
//   PICKUP:  pickup_assigned → startPickupRoute → pickup_en_route →
//            arriveAtPickup → pickup_arrived → recordPickupWeight(weigh) →
//            pickup_weighed → recordPickupPayment(collect/defer) →
//            laundry_in_progress (leg complete)
//            The weigh and payment steps are split so the customer's own
//            tracking screen can show the confirmed weight/price BEFORE the
//            courier collects any money.
//   RETURN:  return_assigned → startReturnRoute → return_en_route →
//            arriveAtReturn → return_arrived → recordDelivery
//            → delivered_to_customer
// The BE validates every transition and that the caller owns the leg.
//
// Originally app/(courier)/task-detail.tsx — moved here so a provider who
// self-assigns their own pickup/return leg (a Home Washer running her own
// delivery; the BE explicitly allows this — see LALABA_BE_DEV's
// assertAssignableCourier) gets the EXACT same screen a real courier uses,
// not a re-implementation. `app/(courier)/task-detail.tsx`,
// `app/(washer)/task-detail.tsx` and `app/(tabs)/task-detail.tsx` are all
// thin re-exports of this file, so it renders inside each role's OWN Tabs
// shell (courier's indigo bar, washer's teal bar, merchant's blue bar)
// instead of always dragging in the courier stack's chrome.
//
// `taskRoute`/`chatRoute`/`backTo` are optional params that let a caller
// outside `(courier)` override where this screen and its chat thread link
// back to; omitted, they default to the original `(courier)` paths so the
// courier stack's own navigation (dashboard/map/history → here) is unchanged.

import React, { useEffect, useMemo, useState } from "react";
import { errField } from "../../utils/userError";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { C, RADIUS, SP, SHADOW } from "../../theme/tokens";
import { notify } from "../../stores/notificationStore";
import { useOnlineOrdersStore, STATUS_LABEL } from "../../stores/onlineOrdersStore";
import { useAuthStore } from "../../stores/authStore";
import { customerAddressLine, customerExactAddressLine, customerLatLng, courierLegLive, pesos, gqlUpdateCourierLocation, type GqlOnlineOrder } from "../../services/graphql/onlineOrders";
import { openMaps, effectiveNavApp } from "../../utils/maps";
import { LEG_CHIP } from "../../utils/courierTasks";
import { toUserMessage } from "../../utils/userError";
import { useCourierPrefsStore, NAV_APP_LABEL } from "../../stores/courierPrefsStore";
import { callNumber } from "../../utils/contact";
import { gqlStartCourierConversation } from "../../services/graphql/chat";
import HandoverProofCapture, { type ProofShot } from "../../components/HandoverProofCapture";
import { pesosOrPending } from "../../lib/pricingLabels";

const DEFAULT_TASK_ROUTE = "/(courier)/task-detail";
const DEFAULT_CHAT_ROUTE = "/(courier)/message-thread";

// Statuses during which the courier is physically moving toward / at the
// address — the window we stream GPS to the customer's tracking map.
const STREAMING_STATUSES = new Set([
  "pickup_en_route", "pickup_arrived", "return_en_route", "return_arrived",
]);

const SKY    = C.courier500;
const SKY_BG  = C.courier100;
const MONO = "monospace";

// What the rider captures for a service line, from its pricing type.
// "weight" → kilograms, "piece" → item count, "load" → nothing (flat price).
function lineUnit(pricingType: string): "weight" | "piece" | "load" {
  const t = (pricingType ?? "").toUpperCase();
  if (t.includes("PIECE")) return "piece";
  if (t.includes("LOAD")) return "load";
  return "weight"; // PER_KILO / PER_KILO_WITH_BASE
}

// Build the recordPickupWeight `lineActuals` payload from the per-line inputs.
// Shared by the original weigh step and the pickup_weighed correction flow so
// both submit through the exact same shape/validation.
type LineActual = { serviceRefId: string; actualWeightKg?: number; actualPieceCount?: number };
function buildLineActuals(order: GqlOnlineOrder, lineQty: Record<string, string>): (LineActual | null)[] {
  return order.serviceLines.map((l) => {
    const unit = lineUnit(l.pricingType);
    if (unit === "load") return { serviceRefId: l.serviceRefId };
    const n = parseFloat(lineQty[l.serviceRefId] ?? "");
    if (!(n > 0)) return null;
    return unit === "piece"
      ? { serviceRefId: l.serviceRefId, actualPieceCount: Math.round(n) }
      : { serviceRefId: l.serviceRefId, actualWeightKg: n };
  });
}

// Per-line weight/piece inputs — used both by the original pickup_arrived
// weigh step and by the pickup_weighed "Edit weight" correction flow, so a fix
// to one input's behavior can't drift between the two call sites.
function WeighInputs({
  order, lineQty, setLineQty,
}: Readonly<{
  order: GqlOnlineOrder;
  lineQty: Record<string, string>;
  setLineQty: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}>) {
  return (
    <>
      {order.serviceLines.map((l) => {
        const unit = lineUnit(l.pricingType);
        if (unit === "load") {
          return (
            <View key={l.serviceRefId} style={styles.lineRow}>
              <Text style={styles.lineName} numberOfLines={1}>{l.serviceName}</Text>
              <Text style={styles.lineFlat}>1 load</Text>
            </View>
          );
        }
        const isKg = unit === "weight";
        return (
          <View key={l.serviceRefId} style={styles.lineBlock}>
            <Text style={styles.lineName} numberOfLines={1}>{l.serviceName}</Text>
            <View style={styles.weighRow}>
              <TextInput
                style={styles.weighInput}
                value={lineQty[l.serviceRefId] ?? ""}
                onChangeText={(v) => setLineQty((p) => ({ ...p, [l.serviceRefId]: v }))}
                placeholder={isKg ? "0.0" : "0"}
                keyboardType={isKg ? "decimal-pad" : "number-pad"}
                placeholderTextColor={C.gray300}
              />
              <Text style={styles.weighUnit}>{isKg ? "kg" : "pcs"}</Text>
              {(isKg ? [3, 5, 8] : [1, 2, 5]).map((n) => (
                <TouchableOpacity key={n} style={styles.kgChip} onPress={() => setLineQty((p) => ({ ...p, [l.serviceRefId]: String(n) }))}>
                  <Text style={styles.kgChipText}>{n}{isKg ? " kg" : " pcs"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

// Pay Now vs Pay Later, shown only when the shop opted in to deferred
// settlement. The customer picks AFTER seeing the weighed total, which is why
// this lives here and not in the booking flow — at booking there is only an
// estimate to defer.
function TimingPicker({
  defer, setDefer,
}: Readonly<{ defer: boolean; setDefer: (v: boolean) => void }>) {
  return (
    <>
      <Text style={styles.weighTitle}>When is the customer paying?</Text>
      <View style={styles.payRow}>
        {([false, true] as const).map((v) => {
          const active = defer === v;
          return (
            <TouchableOpacity
              key={String(v)}
              style={[styles.payChip, active && styles.payChipActive]}
              onPress={() => setDefer(v)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={v ? "time-outline" : "checkmark-circle-outline"}
                size={15}
                color={active ? C.white : C.gray600}
              />
              <Text style={[styles.payChipText, active && { color: C.white }]}>
                {v ? "Pay later" : "Pay now"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

// Cash/e-wallet picker for the pickup weigh-and-collect step. For CASH, an
// optional tendered amount lets the server compute the change (GAP-H-017).
function PaymentPicker({
  payMethod, setPayMethod, reference, setReference,
}: Readonly<{
  payMethod: "CASH" | "EWALLET_OUTSIDE_APP";
  setPayMethod: (m: "CASH" | "EWALLET_OUTSIDE_APP") => void;
  reference: string;
  setReference: (v: string) => void;
}>) {
  return (
    <>
      <Text style={styles.weighTitle}>Payment</Text>
      <View style={styles.payRow}>
        {(["CASH", "EWALLET_OUTSIDE_APP"] as const).map((m) => {
          const active = payMethod === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.payChip, active && styles.payChipActive]}
              onPress={() => setPayMethod(m)}
              activeOpacity={0.8}
            >
              <Ionicons name={m === "CASH" ? "cash-outline" : "phone-portrait-outline"} size={15} color={active ? C.white : C.gray600} />
              <Text style={[styles.payChipText, active && { color: C.white }]}>{m === "CASH" ? "Cash" : "E-wallet"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {payMethod === "EWALLET_OUTSIDE_APP" ? (
        <TextInput
          style={styles.refInput}
          value={reference}
          onChangeText={setReference}
          placeholder="E-wallet reference no."
          placeholderTextColor={C.gray300}
          autoCapitalize="characters"
        />
      ) : null}
    </>
  );
}

export default function TaskDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id, leg, from, taskRoute, chatRoute, backTo } = useLocalSearchParams<{
    id: string; leg: "PICKUP" | "RETURN"; from?: string;
    taskRoute?: string; chatRoute?: string; backTo?: string;
  }>();
  const thisRoute = taskRoute || DEFAULT_TASK_ROUTE;
  const chatRouteResolved = chatRoute || DEFAULT_CHAT_ROUTE;

  // task-detail is registered as a hidden TAB (href: null), not a stack screen,
  // so router.back() unwinds to the tab navigator's initial route — Tasks —
  // regardless of which tab pushed us here. Route back to the actual origin
  // instead; `replace` so we don't leave the hidden tab in history. A caller
  // outside `(courier)` (a provider managing their own self-assigned leg)
  // supplies `backTo` explicitly since it has no Tasks/Map screens to fall
  // back to.
  const goBack = () => {
    if (backTo) { router.replace(backTo); return; }
    router.replace(from === "map" ? "/(courier)/map" : "/(courier)/dashboard");
  };
  const myUid = useAuthStore((st) => st.user?.uid) ?? "";
  // Subscribed, not read once — the label must follow a preference change made
  // in Profile without needing this screen to remount.
  const navApp = useCourierPrefsStore((st) => st.navApp);

  const {
    myLegs, myCompletedLegs, startPickup, arrivePickup, recordPickupWeight, recordPickupPayment,
    startReturn, arriveReturn, recordDelivery, fetchAssigned,
  } = useOnlineOrdersStore();

  // Seed `myLegs` on mount. The courier stack keeps this fresh via polling on
  // its Tasks/Map screens; a provider opening this screen straight from their
  // own Orders list (self-assigned leg) never visits those, so without this
  // the lookup below would find nothing and show "Task not found".
  useEffect(() => { void fetchAssigned(); }, [fetchAssigned]);

  // Look in both feeds: a task opened from History or the Completed tab lives
  // only in the completed slice, and a task completed while this screen is open
  // moves from one to the other. Live copy first — it's the fresher of the two.
  const order = useMemo(
    () => myLegs.find((o) => o._id === id) ?? myCompletedLegs.find((o) => o._id === id),
    [myLegs, myCompletedLegs, id],
  );
  const [busy, setBusy] = useState(false);
  // Per-service-line measured quantity (kg for weight lines, pcs for per-piece).
  const [lineQty, setLineQty] = useState<Record<string, string>>({});
  const [payMethod, setPayMethod] = useState<"CASH" | "EWALLET_OUTSIDE_APP">("CASH");
  const [reference, setReference] = useState("");
  const [tendered, setTendered] = useState("");
  // Pay Now vs Pay Later, chosen by the customer AFTER they see the real
  // weighed total. Only offered when the shop opted in (snapshotted on the
  // order at booking, so it can't be retracted mid-order).
  const [deferPayment, setDeferPayment] = useState(false);
  // Handover photos for whichever leg this screen is working, uploaded as they
  // are taken; only the storage keys travel with the collection mutation.
  const [proofShots, setProofShots] = useState<ProofShot[]>([]);
  const [openingChat, setOpeningChat] = useState(false);
  // Toggled on at pickup_weighed to let the courier correct a fat-fingered
  // weigh-in before payment is collected — reuses the same per-line inputs
  // and lineQty state the original weigh step wrote (never cleared on
  // success), so it pre-fills with what was last entered.
  const [editingWeight, setEditingWeight] = useState(false);

  // Seed per-piece lines with their estimated count once the order loads.
  useEffect(() => {
    if (!order) return;
    setLineQty((prev) => {
      const next = { ...prev };
      for (const l of order.serviceLines) {
        if (next[l.serviceRefId] === undefined && lineUnit(l.pricingType) === "piece" && l.estimatedPieceCount != null) {
          next[l.serviceRefId] = String(l.estimatedPieceCount);
        }
      }
      return next;
    });
  }, [order]);

  // Live GPS: while the courier is en route / at the address, stream the device
  // location to the BE every 10s so the customer's tracking map follows the
  // rider. Best-effort — silently no-ops if permission is denied.
  const streaming = !!order && STREAMING_STATUSES.has(order.status);
  const orderId = order?._id;
  const seqRef = React.useRef(0);
  useEffect(() => {
    if (!streaming || !orderId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      const ping = async () => {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await gqlUpdateCourierLocation(orderId, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            recordedAt: new Date(pos.timestamp).toISOString(),
            sequence: seqRef.current++,
          });
        } catch { /* best-effort; ignore transient GPS/network errors */ }
      };
      void ping();
      timer = setInterval(ping, 10_000);
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [streaming, orderId]);

  if (!order || !leg) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.missing}>Task not found (it may have moved on).</Text>
        <TouchableOpacity onPress={goBack}>
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPickup = leg === "PICKUP";
  const s = order.status;

  // Current step index for the stepper UI. (Pay-on-delivery was removed from
  // the schema — collection always happens at the pickup weigh step.)
  // What the customer still owes, straight from the server. Non-zero on a
  // Pay Later order at the door, or on one left short by an approved surcharge.
  const amountDue = order.amountDueCentavos ?? 0;
  const mustCollectOnReturn = !isPickup && amountDue > 0;
  const canDefer = order.provider.allowsPayAtHandover === true;

  const steps = isPickup
    ? ["Start navigation", "Arrive at customer", "Weigh & confirm price", "Collect payment", "Handover complete"]
    : [
        "Start navigation",
        "Arrive at customer",
        mustCollectOnReturn ? "Collect balance & hand over" : "Hand over laundry",
        "Delivery complete",
      ];
  const stepIdx = isPickup
    ? s === "pickup_assigned" ? 0
      : s === "pickup_en_route" ? 1
      : s === "pickup_arrived" ? 2
      : s === "pickup_weighed" ? 3
      : 4
    : s === "return_assigned" ? 0 : s === "return_en_route" ? 1 : s === "return_arrived" ? 2 : 3;
  const legDone = isPickup ? stepIdx >= 4 : stepIdx >= 3;

  // `navigateAway`: true (default) matches the old atomic behavior — success
  // toast then goBack(), since the leg is genuinely done. The weigh-only step
  // passes false: the courier stays on this screen for the payment step that
  // follows, so it just shows the toast in place.
  const run = async (fn: () => Promise<unknown>, done?: string, navigateAway = true) => {
    setBusy(true);
    try {
      await fn();
      if (done) {
        notify.success(done);
        if (navigateAway) goBack(); // same reason as the header button — see goBack above
      }
    } catch (e: unknown) {
      notify.error("Action failed", toUserMessage(e, "Try again."));
      await fetchAssigned();
    } finally {
      setBusy(false);
    }
  };

  // Exact address + pin resolve ONLY while this leg is live (the BE redaction
  // gate). Before "Start navigation" they're null — the mutation that starts
  // the leg returns the un-redacted order, so navigation reads the FRESH copy
  // from the store rather than this pre-start snapshot.
  const exactAddress = customerExactAddressLine(order);
  const destination = customerAddressLine(order); // exact, or areaLabel fallback
  const destinationAt = customerLatLng(order);

  // Open turn-by-turn from the freshest store copy of this order — right after
  // startPickup/startReturn the just-patched order carries the now-unlocked
  // exact address and pin.
  const openMapsFresh = () => {
    const latest: GqlOnlineOrder =
      useOnlineOrdersStore.getState().myLegs.find((o) => o._id === order._id) ?? order;
    openMaps(customerAddressLine(latest), customerLatLng(latest));
  };

  // Turn-by-turn only becomes available once this leg is actually under way.
  // Handing the rider directions before "Start navigation" would let them drive
  // off without the BE recording enRouteAt — the customer's tracking map would
  // show them still idle at the branch. Keyed off enRouteAt (the same field
  // deriveTasks uses for the ACTIVE bucket) rather than the step index, so it
  // reflects the server's record of the transition.
  const routeStarted = isPickup
    ? !!order.pickupAssignment?.enRouteAt
    : !!order.returnAssignment?.enRouteAt;

  // Calling and messaging share the navigation window: live once the rider sets
  // off, closed again at handover. Uses the same helper the chat thread does,
  // which mirrors the BE's activeCourierLeg guard — so the UI never offers an
  // action the server would reject.
  const canContact = courierLegLive(order, myUid) === leg;

  const openChat = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      // Find-or-create: returns the existing thread when the customer already
      // started one, so this never produces a duplicate.
      const convo = await gqlStartCourierConversation(order._id, leg);
      router.push({
        pathname: chatRouteResolved,
        params: {
          id: convo._id, name: order.customer.displayName, orderId: order._id, leg,
          from: "task-detail", taskRoute: thisRoute, chatRoute: chatRouteResolved, backTo,
        },
      });
    } catch (e: unknown) {
      notify.error("Couldn't open chat", errField(e, "message") ?? "Try again.");
    } finally {
      setOpeningChat(false);
    }
  };

  const primaryAction = () => {
    if (isPickup) {
      if (s === "pickup_assigned") return { label: "Start navigation", go: () => run(async () => { await startPickup(order._id); openMapsFresh(); }) };
      if (s === "pickup_en_route") return { label: "I've arrived", go: () => run(() => arrivePickup(order._id)) };
      if (s === "pickup_arrived") {
        // Build one measured quantity per line, from each line's pricing type.
        // Payment happens one step later (pickup_weighed) so the customer sees
        // the confirmed weight/price on their tracking screen before the
        // courier collects anything.
        const lineActuals = buildLineActuals(order, lineQty);
        const complete = lineActuals.every((la) => la !== null);
        return {
          label: "Confirm weight",
          disabled: !complete,
          go: () =>
            run(async () => {
              const updated = await recordPickupWeight(order._id, {
                lineActuals: lineActuals.filter(Boolean) as { serviceRefId: string; actualWeightKg?: number; actualPieceCount?: number }[],
                proofObjectKeys: proofShots.map((p) => p.objectKey),
              });
              notify.success(
                "Weight confirmed",
                `${pesos(updated.pricing.customerTotalCentavos)}. The customer can now see this.`,
              );
            }, undefined, false), // stay on screen — payment is the next step
        };
      }
      if (s === "pickup_weighed" && editingWeight) {
        // Self-loop transition: recordPickupWeight can be called again while
        // still in pickup_weighed (added server-side specifically for this
        // correction path) — it re-finalizes pricing from scratch and credits
        // back any platform-fee delta, so this is just the confirm-weight call
        // a second time with the corrected inputs.
        const lineActuals = buildLineActuals(order, lineQty);
        const complete = lineActuals.every((la) => la !== null);
        return {
          label: "Save correction",
          disabled: !complete,
          go: () =>
            run(async () => {
              const updated = await recordPickupWeight(order._id, {
                lineActuals: lineActuals.filter(Boolean) as LineActual[],
                proofObjectKeys: proofShots.map((p) => p.objectKey),
              });
              setEditingWeight(false);
              notify.success(
                "Weight corrected",
                `${pesos(updated.pricing.customerTotalCentavos)}.`,
              );
            }, undefined, false), // stay on screen — payment is still the next step
        };
      }
      if (s === "pickup_weighed") {
        const eWalletNeedsRef =
          !deferPayment && payMethod === "EWALLET_OUTSIDE_APP" && reference.trim().length === 0;
        const tenderedPesos = Number.parseFloat(tendered);
        const tenderedCentavos =
          !deferPayment && payMethod === "CASH" && Number.isFinite(tenderedPesos) && tenderedPesos > 0
            ? Math.round(tenderedPesos * 100)
            : undefined;
        const label = deferPayment
          ? "Record pickup (pay later)"
          : payMethod === "CASH"
            ? "Record pickup (cash)"
            : "Record pickup (e-wallet)";
        return {
          label,
          disabled: eWalletNeedsRef,
          go: () =>
            run(
              async () => {
                // Deferring and collecting are exclusive — the server rejects
                // an input carrying both, so send one or the other.
                const updated = await recordPickupPayment(order._id, deferPayment
                  ? { paymentTiming: "AT_FINAL_HANDOVER" as const }
                  : {
                      paymentTiming: "ON_PICKUP" as const,
                      paymentMethod: payMethod,
                      referenceId: payMethod === "EWALLET_OUTSIDE_APP" ? reference.trim() : undefined,
                      tenderedCentavos,
                    });
                if (deferPayment) {
                  notify.info(
                    "Pay later recorded",
                    `${pesos(updated.amountDueCentavos)} is due when the laundry goes back.`,
                  );
                  return;
                }
                // Server-computed change (GAP-H-017) — tell the rider before
                // they leave the doorstep.
                const change = updated.paymentSummary.changeCentavos;
                if (change != null && change > 0) {
                  notify.info("Change due", `Give the customer ${pesos(change)} change.`);
                }
              },
              deferPayment
                ? "Pickup recorded — balance is due at handover."
                : "Pickup recorded — deliver the laundry to the shop.",
            ),
        };
      }
    } else {
      if (s === "return_assigned") return { label: "Start navigation", go: () => run(async () => { await startReturn(order._id); openMapsFresh(); }) };
      if (s === "return_en_route") return { label: "I've arrived", go: () => run(() => arriveReturn(order._id)) };
      if (s === "return_arrived") {
        // An order with a balance cannot be handed over until it is settled —
        // the server enforces this too, and refuses the transition without a
        // payment method. If the customer can't pay, the rider records a failed
        // attempt instead and the laundry goes back to the shop.
        if (mustCollectOnReturn) {
          const eWalletNeedsRef =
            payMethod === "EWALLET_OUTSIDE_APP" && reference.trim().length === 0;
          const tenderedPesos = Number.parseFloat(tendered);
          const tenderedCentavos =
            payMethod === "CASH" && Number.isFinite(tenderedPesos) && tenderedPesos > 0
              ? Math.round(tenderedPesos * 100)
              : undefined;
          return {
            label: `Collect ${pesos(amountDue)} & hand over`,
            disabled: eWalletNeedsRef,
            go: () =>
              run(async () => {
                const updated = await recordDelivery(order._id, {
                  paymentMethod: payMethod,
                  referenceId: payMethod === "EWALLET_OUTSIDE_APP" ? reference.trim() : undefined,
                  tenderedCentavos,
                  proofObjectKeys: proofShots.map((p) => p.objectKey),
                });
                const change = updated.paymentSummary.changeCentavos;
                if (change != null && change > 0) {
                  notify.info("Change due", `Give the customer ${pesos(change)} change.`);
                }
              }, "Paid and delivered! Laundry is back with the customer."),
          };
        }
        return {
          label: "Confirm delivery complete",
          go: () =>
            run(async () => {
              await recordDelivery(order._id, {
                proofObjectKeys: proofShots.map((p) => p.objectKey),
              });
            }, "Delivered! Laundry is back with the customer."),
        };
      }
    }
    return null;
  };
  const action = primaryAction();

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + SP._8 }]}>
        <TouchableOpacity onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.gray900} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>#LB-{order._id.slice(-4).toUpperCase()}</Text>
        <View style={[styles.legPill, { backgroundColor: LEG_CHIP[leg].bg }]}>
          <Text style={[styles.legPillText, { color: LEG_CHIP[leg].fg }]}>{leg}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Address / contact card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{isPickup ? "Pick up from" : "Deliver to"}</Text>
          <Text style={styles.contactName}>{order.customer.displayName}</Text>
          <Text style={styles.address}>{destination || "Location not shared yet"}</Text>
          {!exactAddress && !legDone ? (
            <Text style={styles.lockedHint}>
              The exact address and map pin are shared when you start this leg.
            </Text>
          ) : null}
          <Text style={styles.provider}>
            {isPickup ? "Bring to" : "From"} {order.provider.providerName}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>{STATUS_LABEL[s] ?? s}</Text>
            </View>
            <Text style={styles.amount}>
              {pesosOrPending(
                order.pricing.customerTotalCentavos ?? order.pricing.estimatedTotalCentavos,
                pesos,
              )}
            </Text>
          </View>
          {order.instructions.pickupInstructions && isPickup ? (
            <View style={styles.noteBox}>
              <Ionicons name="information-circle-outline" size={15} color={C.gray500} />
              <Text style={styles.noteText}>{order.instructions.pickupInstructions}</Text>
            </View>
          ) : null}

          {/* Reach the customer. Both unlock with navigation and lock again at
              handover — the BE applies the same window (activeCourierLeg), so a
              tap outside it would be rejected server-side anyway. */}
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[styles.contactBtn, !canContact && styles.contactBtnOff]}
              onPress={() => callNumber(order.contactPhone)}
              disabled={!canContact}
              accessibilityState={{ disabled: !canContact }}
              activeOpacity={0.8}
            >
              <Ionicons name="call-outline" size={16} color={canContact ? SKY : C.gray400} />
              <Text style={[styles.contactBtnText, !canContact && styles.contactBtnTextOff]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, !canContact && styles.contactBtnOff]}
              onPress={openChat}
              disabled={!canContact || openingChat}
              accessibilityState={{ disabled: !canContact }}
              activeOpacity={0.8}
            >
              {openingChat ? (
                <ActivityIndicator size="small" color={SKY} />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color={canContact ? SKY : C.gray400} />
                  <Text style={[styles.contactBtnText, !canContact && styles.contactBtnTextOff]}>Chat</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {!canContact ? (
            <Text style={styles.contactHint}>
              {legDone
                ? "This task is complete — contact details are no longer shared."
                : "Start navigation to call or message the customer."}
            </Text>
          ) : null}
        </View>

        {/* Navigation — opens the device's maps app for turn-by-turn */}
        <TouchableOpacity
          style={[styles.mapBanner, !routeStarted && styles.mapBannerOff]}
          onPress={() => openMaps(destination, destinationAt)}
          activeOpacity={0.85}
          disabled={!routeStarted}
          accessibilityState={{ disabled: !routeStarted }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.mapTitle, !routeStarted && styles.mapTitleOff]}>
              Navigate to {order.customer.displayName}
            </Text>
            <Text style={styles.mapSub} numberOfLines={1}>
              {routeStarted ? destination : "Tap Start navigation below to begin"}
            </Text>
          </View>
          <View style={[styles.mapBtn, !routeStarted && styles.mapBtnOff]}>
            <Ionicons name="navigate" size={13} color={routeStarted ? C.white : C.gray400} />
            <Text style={[styles.mapBtnText, !routeStarted && styles.mapBtnTextOff]}>
              Open {NAV_APP_LABEL[effectiveNavApp(navApp)]}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Steps */}
        <Text style={styles.sectionTitle}>Steps</Text>
        {steps.map((label, i) => (
          <View key={label} style={[styles.stepRow, i === stepIdx && !legDone && styles.stepRowActive]}>
            <View style={[
              styles.stepBubble,
              i < stepIdx || legDone ? styles.stepDone : i === stepIdx ? styles.stepActive : styles.stepIdle,
            ]}>
              {i < stepIdx || legDone
                ? <Ionicons name="checkmark" size={14} color={C.white} />
                : <Text style={[styles.stepNum, i === stepIdx && { color: C.white }]}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, (i < stepIdx || legDone) && styles.stepLabelDone]}>{label}</Text>
          </View>
        ))}

        {/* Weigh / count each service line — payment happens one step later,
            once the customer can see the confirmed price. */}
        {isPickup && s === "pickup_arrived" && (
          <View style={styles.weighCard}>
            <Text style={styles.weighTitle}>Confirm each service</Text>
            <WeighInputs order={order} lineQty={lineQty} setLineQty={setLineQty} />
            <Text style={styles.weighNote}>
              {order.pricing.estimatedTotalCentavos
                ? `Estimated ${pesos(order.pricing.estimatedTotalCentavos)} — the final amount `
                : "The amount "}
              recalculates from what you enter and is shown to the customer next.
            </Text>
            <View style={styles.proofBlock}>
              <HandoverProofCapture
                orderId={order._id}
                leg="PICKUP"
                accent={SKY}
                shots={proofShots}
                onChange={setProofShots}
              />
            </View>
          </View>
        )}

        {/* Confirmed weight/price summary + collect (or defer) payment. Pricing
            was finalized by the previous step, so this reads the real numbers
            instead of estimates. Editable via "Edit weight" — the BE allows
            recordPickupWeight to be called again while still pickup_weighed,
            specifically so a fat-fingered entry can be corrected before any
            money changes hands. */}
        {isPickup && s === "pickup_weighed" && !editingWeight && (
          <View style={styles.weighCard}>
            <View style={styles.weighHeaderRow}>
              <Text style={styles.weighTitle}>Confirmed weight & price</Text>
              <TouchableOpacity
                style={styles.editWeightBtn}
                onPress={() => setEditingWeight(true)}
                hitSlop={8}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil-outline" size={13} color={SKY} />
                <Text style={styles.editWeightBtnText}>Edit weight</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dueAmount}>{pesos(order.pricing.customerTotalCentavos)}</Text>
            {order.pricing.actualWeightKg != null ? (
              <Text style={styles.weighNote}>{order.pricing.actualWeightKg} kg weighed</Text>
            ) : null}
            <View style={styles.paymentBlock}>
              {canDefer ? <TimingPicker defer={deferPayment} setDefer={setDeferPayment} /> : null}
              {deferPayment ? (
                <Text style={styles.weighNote}>
                  Take the laundry now — the full amount is collected when it goes back to
                  the customer. Don&apos;t take any money at this stop.
                </Text>
              ) : (
                <>
                  <PaymentPicker payMethod={payMethod} setPayMethod={setPayMethod} reference={reference} setReference={setReference} />
                  {payMethod === "CASH" ? (
                    <>
                      {/* Optional cash tender — the server computes the change. */}
                      <TextInput
                        style={styles.refInput}
                        value={tendered}
                        onChangeText={setTendered}
                        placeholder="Cash received (₱, optional)"
                        placeholderTextColor={C.gray300}
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.weighNote}>
                        Enter what the customer hands you and the change is computed for you.
                      </Text>
                    </>
                  ) : null}
                </>
              )}
            </View>
            {deferPayment ? null : (
              <Text style={styles.weighNote}>
                Collect {pesos(order.pricing.customerTotalCentavos)}.
              </Text>
            )}
          </View>
        )}

        {/* Correction view — same per-line inputs as the original weigh step,
            pre-filled from the lineQty the courier already entered (never
            cleared on success). "Cancel" just collapses back to the summary
            without submitting; "Save correction" is the primary action below. */}
        {isPickup && s === "pickup_weighed" && editingWeight && (
          <View style={styles.weighCard}>
            <View style={styles.weighHeaderRow}>
              <Text style={styles.weighTitle}>Correct weight</Text>
              <TouchableOpacity
                style={styles.editWeightBtn}
                onPress={() => setEditingWeight(false)}
                hitSlop={8}
                activeOpacity={0.8}
              >
                <Ionicons name="close-outline" size={15} color={C.gray500} />
                <Text style={styles.cancelWeightBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <WeighInputs order={order} lineQty={lineQty} setLineQty={setLineQty} />
            <Text style={styles.weighNote}>
              Currently confirmed at {pesos(order.pricing.customerTotalCentavos)} — saving
              recalculates the price and updates what the customer sees.
            </Text>
          </View>
        )}

        {/* Already-paid return: no money to collect, but the handover itself is
            still worth photographing. */}
        {!mustCollectOnReturn && s === "return_arrived" && (
          <View style={styles.weighCard}>
            <HandoverProofCapture
              orderId={order._id}
              leg="RETURN"
              accent={SKY}
              shots={proofShots}
              onChange={setProofShots}
            />
          </View>
        )}

        {/* Return leg with a balance — the mirror of the pickup collect block.
            Shown for a Pay Later order and for one left short by an approved
            surcharge; the handover is blocked until this is settled. */}
        {mustCollectOnReturn && s === "return_arrived" && (
          <View style={styles.weighCard}>
            <Text style={styles.weighTitle}>Balance due</Text>
            <Text style={styles.dueAmount}>{pesos(amountDue)}</Text>
            <Text style={styles.weighNote}>
              Collect this before handing the laundry over. If the customer can&apos;t pay,
              record a failed attempt instead and bring the laundry back.
            </Text>
            <View style={styles.paymentBlock}>
              <PaymentPicker payMethod={payMethod} setPayMethod={setPayMethod} reference={reference} setReference={setReference} />
              {payMethod === "CASH" ? (
                <TextInput
                  style={styles.refInput}
                  value={tendered}
                  onChangeText={setTendered}
                  placeholder="Cash received (₱, optional)"
                  placeholderTextColor={C.gray300}
                  keyboardType="decimal-pad"
                />
              ) : null}
            </View>
            <View style={styles.proofBlock}>
              <HandoverProofCapture
                orderId={order._id}
                leg="RETURN"
                accent={SKY}
                shots={proofShots}
                onChange={setProofShots}
              />
            </View>
          </View>
        )}

        <View style={{ height: SP._24 }} />
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + SP._12 }]}>
        {legDone ? (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-circle" size={18} color={C.success500} />
            <Text style={styles.doneText}>This task is complete</Text>
          </View>
        ) : action ? (
          <TouchableOpacity
            style={[styles.primaryBtn, (busy || action.disabled) && { opacity: 0.5 }]}
            onPress={action.go}
            disabled={busy || action.disabled}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={styles.primaryBtnText}>{action.label}</Text>}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  center: { alignItems: "center", justifyContent: "center", gap: SP._12 },
  missing: { fontSize: 15, color: C.gray600 },
  backLink: { fontSize: 14, color: SKY, fontWeight: "600" },

  topBar: { flexDirection: "row", alignItems: "center", gap: SP._12, paddingHorizontal: SP._12, paddingBottom: SP._12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  backBtn: { padding: 2 },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  legPill: { borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 4 },
  legPillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  scroll: { maxWidth: 880, width: "100%", alignSelf: "center", paddingHorizontal: SP._16, paddingTop: SP._16 },

  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._16, marginBottom: SP._16, gap: 3 },
  cardLabel: { fontSize: 11, fontWeight: "700", color: C.gray400, letterSpacing: 0.6, textTransform: "uppercase" },
  contactName: { fontSize: 18, fontWeight: "700", color: C.gray900, marginTop: 2 },
  address: { fontSize: 14, color: C.gray600, lineHeight: 20 },
  provider: { fontSize: 13, color: C.gray500, marginTop: SP._4 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SP._8 },
  statusChip: { height: 22, paddingHorizontal: SP._10, borderRadius: RADIUS.full, backgroundColor: SKY_BG, alignItems: "center", justifyContent: "center" },
  statusChipText: { fontSize: 11, fontWeight: "700", color: SKY },
  amount: { fontSize: 16, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  noteBox: { flexDirection: "row", gap: SP._8, backgroundColor: C.gray50, borderRadius: RADIUS.md, padding: SP._12, marginTop: SP._8 },
  noteText: { flex: 1, fontSize: 13, color: C.gray600, lineHeight: 19 },

  mapBanner: { flexDirection: "row", alignItems: "center", gap: SP._12, backgroundColor: SKY_BG, borderWidth: 1, borderColor: C.courier200, borderRadius: 16, padding: SP._12, marginBottom: SP._16 },
  contactRow: { flexDirection: "row", gap: SP._8, marginTop: SP._12 },
  contactBtn: { flex: 1, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._6, borderRadius: RADIUS.md, backgroundColor: SKY_BG, borderWidth: 1, borderColor: C.courier200 },
  contactBtnOff: { backgroundColor: C.gray50, borderColor: C.gray200 },
  contactBtnText: { fontSize: 14, fontWeight: "700", color: SKY },
  contactBtnTextOff: { color: C.gray400 },
  contactHint: { fontSize: 11, color: C.gray500, marginTop: SP._6 },

  mapTitle: { fontSize: 14, fontWeight: "700", color: C.courier700 },
  mapSub: { fontSize: 12, color: C.gray600, marginTop: 1 },
  mapBtn: { flexDirection: "row", alignItems: "center", gap: SP._6, backgroundColor: SKY, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._8 },
  // Locked until the leg is en route — greyed rather than hidden so the rider
  // can see navigation is coming and what unlocks it.
  mapBannerOff: { backgroundColor: C.gray50, borderColor: C.gray200 },
  mapTitleOff: { color: C.gray600 },
  mapBtnOff: { backgroundColor: C.gray200 },
  mapBtnTextOff: { color: C.gray400 },
  mapBtnText: { fontSize: 12, fontWeight: "700", color: C.white },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: C.gray900, marginBottom: SP._10 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: SP._12, paddingVertical: SP._8, paddingHorizontal: SP._8, borderRadius: RADIUS.md },
  stepRowActive: { backgroundColor: C.white, ...SHADOW.xs },
  stepBubble: { width: 28, height: 28, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  stepIdle: { backgroundColor: C.gray100 },
  stepActive: { backgroundColor: SKY },
  stepDone: { backgroundColor: C.success500 },
  stepNum: { fontSize: 13, fontWeight: "700", color: C.gray500 },
  stepLabel: { fontSize: 15, fontWeight: "600", color: C.gray900 },
  stepLabelDone: { color: C.gray400 },

  weighCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._16, marginTop: SP._12, gap: SP._10 },
  weighTitle: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  weighHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editWeightBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editWeightBtnText: { fontSize: 13, fontWeight: "700", color: SKY },
  cancelWeightBtnText: { fontSize: 13, fontWeight: "700", color: C.gray500 },
  weighRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  weighInput: { width: 84, height: 44, borderWidth: 1.5, borderColor: SKY, borderRadius: RADIUS.md, textAlign: "center", fontSize: 18, fontWeight: "700", color: C.gray900, fontFamily: MONO },
  weighUnit: { fontSize: 14, fontWeight: "700", color: C.gray500, marginRight: SP._8 },
  kgChip: { height: 32, paddingHorizontal: SP._10, borderRadius: RADIUS.full, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center" },
  kgChipText: { fontSize: 12, fontWeight: "700", color: C.gray600 },
  weighNote: { fontSize: 12, color: C.gray400 },
  proofBlock: { marginTop: SP._12, gap: SP._8 },
  // The one number the rider must read correctly at the door, so it gets the
  // same weight as the amount chip in the header.
  dueAmount: { fontSize: 26, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  lineBlock: { gap: SP._8, paddingVertical: SP._8, borderTopWidth: 1, borderTopColor: C.gray100 },
  lineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SP._8, borderTopWidth: 1, borderTopColor: C.gray100 },
  lineName: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  lineFlat: { fontSize: 13, fontWeight: "600", color: C.gray500 },
  payRow: { flexDirection: "row", gap: SP._8 },
  payChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 42, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  payChipActive: { backgroundColor: SKY, borderColor: SKY },
  payChipText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  refInput: { height: 44, borderWidth: 1, borderColor: C.gray200, borderRadius: RADIUS.md, paddingHorizontal: SP._12, fontSize: 14, color: C.gray900 },
  paymentBlock: { marginTop: SP._12, gap: SP._8 },
  lockedHint: { fontSize: 12, color: C.gray400, marginTop: 2, lineHeight: 16 },

  actionBar: { paddingHorizontal: SP._16, paddingTop: SP._12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100 },
  primaryBtn: { height: 48, borderRadius: RADIUS.md, backgroundColor: SKY, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: C.white },
  doneRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8, paddingVertical: SP._8 },
  doneText: { fontSize: 14, fontWeight: "700", color: C.success700 },
});
