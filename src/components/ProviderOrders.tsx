// src/components/ProviderOrders.tsx
// Provider view of the shared online-orders domain, used by BOTH partner roles:
//   • Home washer  → app/(washer)/orders.tsx  (teal accent, profile.branchId)
//   • Merchant     → app/(tabs)/online-orders.tsx (brand accent, activeBranchId)
// A customer's createOnlineOrder lands here (incomingOnlineOrders on the
// provider's branch). The provider drives the happy path:
//   accept → assign pickup courier → (courier collects) → laundry in progress
//   → mark ready → assign return courier → (courier delivers) → completed.
//
// This screen is an OPERATIONAL INBOX, not an order history: the primary
// segmentation is "what is blocked on me" (Needs action) rather than a flat
// Active/Completed split, and search is first-class because a busy shop can
// accumulate hundreds of orders.

import React, { useMemo, useState, useCallback } from "react";
import { errField } from "../utils/userError";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";
import { notify } from "../stores/notificationStore";
import { useAuthStore } from "../stores/authStore";
import { useOnlineOrdersStore, STATUS_LABEL, ONLINE_ORDERS_POLL_MS } from "../stores/onlineOrdersStore";
import { usePoll } from "../hooks/usePoll";
import { pesos, customerAddressLine, type GqlOnlineOrder } from "../services/graphql/onlineOrders";
import CounterCollectModal, { type CounterMode } from "./CounterCollectModal";
import { PartnerFeeBreakdown } from "./PartnerFeeBreakdown";
import QualityHoldSheet from "./QualityHoldSheet";
import CourierPickerSheet from "./CourierPickerSheet";
import { pesosOrPending } from "../lib/pricingLabels";

const MONO = "monospace";

export type ProviderAccent = { base: string; bg: string; dark: string };

type Action = { label: string; run: (o: GqlOnlineOrder) => Promise<void> | void };
type TabKey = "NEEDS_ACTION" | "ACTIVE" | "DONE";

const ACTIVE_STATUSES = new Set([
  "pending_provider_acceptance", "accepted_by_provider",
  "awaiting_pickup_assignment", "pickup_assigned", "pickup_en_route", "pickup_arrived", "pickup_weighed",
  "picked_up_from_customer", "received_by_provider",
  "laundry_in_progress", "laundry_quality_hold", "laundry_ready",
  "awaiting_return_assignment", "return_assigned", "return_en_route", "return_arrived",
]);

// Orders the provider is personally blocking: they can't advance without a
// decision from this screen. Deliberately excludes laundry_in_progress — that's
// work already underway, not an inbox item, and it would otherwise flood the
// bucket for the whole wash cycle.
const NEEDS_ACTION_STATUSES = new Set([
  "pending_provider_acceptance",
  "awaiting_pickup_assignment",
  "awaiting_return_assignment",
  "laundry_quality_hold",
]);

const statusLabel = (status: string) => STATUS_LABEL[status] ?? status;

// Order ref, customer, address and services — everything a counter staffer
// would plausibly type when a customer calls in about their laundry.
function haystack(o: GqlOnlineOrder): string {
  return [
    `LB-${o._id.slice(-4)}`,
    o.customer.displayName,
    customerAddressLine(o),
    o.serviceLines.map((l) => l.serviceName).join(" "),
    statusLabel(o.status),
  ].join(" ").toLowerCase();
}

function matchesQuery(o: GqlOnlineOrder, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  return q ? haystack(o).includes(q) : true;
}

export function ProviderOrders({
  branchId,
  accent,
  title = "Orders",
  subtitle = "Manage customer laundry orders",
  headerAccessory,
  headerRight,
  acceptingOrders,
  onEnableOrders,
  selfCourierBasePath,
  ordersRoute,
}: Readonly<{
  branchId: string | null;
  accent: ProviderAccent;
  title?: string;
  subtitle?: string;
  /** Optional element under the subtitle (e.g. a branch selector for owners). */
  headerAccessory?: React.ReactNode;
  /** Rendered at the end of the title row — the staff notification bell. */
  headerRight?: React.ReactNode;
  /**
   * Whether this branch is currently visible to customers. When explicitly
   * false the empty state says so (and offers `onEnableOrders`) instead of
   * implying orders will just turn up. Leave undefined when the role has no
   * such switch — the neutral "all caught up" copy is used.
   */
  acceptingOrders?: boolean;
  onEnableOrders?: () => void;
  /**
   * This role's own route group (e.g. "/(washer)" or "/(tabs)"), which hosts
   * a re-export of the real courier task-detail/chat screens
   * (src/screens/orderLeg/*). Used to route a provider into THOSE screens 1:1
   * when they've self-assigned their own pickup/return leg (a Home Washer
   * running her own delivery — the BE explicitly allows this). Required for
   * the "Manage pickup"/"Manage return" action to appear at all.
   */
  selfCourierBasePath: string;
  /** This screen's own route (e.g. "/(washer)/orders"), so the task-detail
   *  screen's back button and step-completion redirects land back here
   *  instead of the courier stack's Tasks/Map screens. */
  ordersRoute: string;
}>) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const {
    incoming, couriers, isLoadingIncoming, error: loadError,
    fetchIncoming, loadCouriers,
    accept, assignPickup, markReady, assignReturn,
  } = useOnlineOrdersStore();

  const [tab, setTab] = useState<TabKey>("NEEDS_ACTION");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The counter's weigh/settle sheet — drop-off receipt and self-pickup
  // handover, the two collection points that never had a screen.
  const [counter, setCounter] = useState<{ order: GqlOnlineOrder; mode: CounterMode } | null>(null);
  // Reporting a problem mid-wash (§12) — the only route by which a hold can be
  // raised at all; before this there was no UI for it anywhere.
  const [holdTarget, setHoldTarget] = useState<GqlOnlineOrder | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The courier picker sheet — holds the callback for whichever leg
  // (pickup/return) triggered it, so the sheet itself stays leg-agnostic.
  const [courierPicker, setCourierPicker] = useState<{ title: string; order: GqlOnlineOrder; onPick: (uid: string) => void } | null>(null);

  usePoll(
    () => (branchId ? fetchIncoming(branchId) : undefined),
    ONLINE_ORDERS_POLL_MS,
    !!branchId,
  );

  // Courier roster changes rarely — refresh on focus, not on the poll tick.
  useFocusEffect(
    useCallback(() => {
      if (branchId) void loadCouriers(branchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branchId])
  );

  // Search narrows every bucket, so the counts on the tabs always match what
  // the tab will actually render.
  const matching = useMemo(
    () => incoming.filter((o) => matchesQuery(o, query)),
    [incoming, query],
  );

  const buckets = useMemo(() => {
    const needsAction: GqlOnlineOrder[] = [];
    const active: GqlOnlineOrder[] = [];
    const done: GqlOnlineOrder[] = [];
    for (const o of matching) {
      if (!ACTIVE_STATUSES.has(o.status)) done.push(o);
      else if (NEEDS_ACTION_STATUSES.has(o.status)) needsAction.push(o);
      else active.push(o);
    }
    return { NEEDS_ACTION: needsAction, ACTIVE: active, DONE: done };
  }, [matching]);

  // Only the statuses actually present in this tab become filter chips — no
  // dead chips for lifecycle states the shop has nothing sitting in.
  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const o of buckets[tab]) seen.add(o.status);
    return [...seen];
  }, [buckets, tab]);

  // A chip whose status is no longer present in this tab (search narrowed it
  // away, or the order advanced) must not silently hide everything.
  const activeStatusFilter = statusFilter && statusOptions.includes(statusFilter) ? statusFilter : null;

  const visible = useMemo(() => {
    const list = buckets[tab];
    return activeStatusFilter ? list.filter((o) => o.status === activeStatusFilter) : list;
  }, [buckets, tab, activeStatusFilter]);

  const onRefresh = async () => {
    if (!branchId) return;
    setRefreshing(true);
    await fetchIncoming(branchId);
    setRefreshing(false);
  };

  // Always opens the picker sheet so the provider chooses who runs the leg —
  // it no longer auto-assigns couriers[0] on their behalf. The order comes
  // along because whether "Assign myself" is a real option depends on it.
  const pickCourier = (
    title: string,
    order: GqlOnlineOrder,
    onPick: (uid: string) => void,
  ) => {
    setCourierPicker({ title, order, onPick });
  };

  /**
   * May the signed-in user run this leg themselves?
   *
   * Only a Home Washer on her own order. The backend's assertAssignableCourier
   * accepts self-assignment in exactly that case and otherwise demands the
   * courier role, so offering it to a merchant owner or to staff put a button
   * in the sheet that always failed with "This staff member cannot be assigned
   * to deliveries for this order".
   */
  const selfAssignableUid = (o: GqlOnlineOrder): string | null =>
    user &&
    o.provider?.providerType === "WASHER" &&
    o.provider?.providerUid === user.uid
      ? user.uid
      : null;

  // True when the signed-in provider is the one assigned to run this leg
  // themselves (a Home Washer acting as her own courier — the BE explicitly
  // allows this, see LALABA_BE_DEV's assertAssignableCourier). Only then does
  // this screen offer to manage the leg; one assigned to a real courier staff
  // member still just waits.
  const legAssignedToMe = (o: GqlOnlineOrder, leg: "pickup" | "return"): boolean => {
    const a = leg === "pickup" ? o.pickupAssignment : o.returnAssignment;
    return !!user && a?.assignedStaffUid === user.uid;
  };

  // Opens the SAME task-detail screen a real courier uses (re-exported into
  // this role's own Tabs stack — see selfCourierBasePath) so a self-assigned
  // leg is managed identically: navigation, call/chat, weigh-and-collect, all
  // of it. This screen only needs to hand off id/leg; the rest of the
  // pickup_assigned → …_en_route → …_arrived flow lives entirely over there.
  const manageLeg = (o: GqlOnlineOrder, leg: "PICKUP" | "RETURN") => {
    router.push({
      pathname: `${selfCourierBasePath}/task-detail`,
      params: {
        id: o._id,
        leg,
        taskRoute: `${selfCourierBasePath}/task-detail`,
        chatRoute: `${selfCourierBasePath}/courier-thread`,
        backTo: ordersRoute,
      },
    });
  };

  const actionFor = (o: GqlOnlineOrder): Action | null => {
    switch (o.status) {
      case "pending_provider_acceptance":
        // Store actions now resolve to the updated order; `run` is void-typed,
        // so swallow the value while keeping the promise (and its rejection).
        return { label: "Accept order", run: async (ord) => { await accept(ord._id); } };
      case "accepted_by_provider":
        // Drop-off orders skip the courier entirely: the customer walks in with
        // the laundry, so the counter does the weigh-and-collect the rider
        // would otherwise do at the door. Provider-pickup orders wait for a
        // courier assignment instead and have no action here.
        return o.fulfillment.pickupMode === "CUSTOMER_DROPOFF"
          ? { label: "Receive at counter", run: (ord) => setCounter({ order: ord, mode: "RECEIVE" }) }
          : null;
      case "awaiting_pickup_assignment":
        return { label: "Assign pickup courier", run: (ord) => pickCourier("Assign pickup courier", ord, (uid) => { void assignPickup(ord._id, uid); }) };
      case "pickup_assigned":
      case "pickup_en_route":
      case "pickup_arrived":
      case "pickup_weighed":
        return legAssignedToMe(o, "pickup")
          ? { label: `Manage pickup — ${statusLabel(o.status)}`, run: (ord) => manageLeg(ord, "PICKUP") }
          : null;
      case "laundry_in_progress":
        return { label: "Mark laundry ready", run: async (ord) => { await markReady(ord._id); } };
      case "laundry_quality_hold":
        // Blocked on the customer — nothing for the shop to do but wait.
        return null;
      case "awaiting_return_assignment":
        return { label: "Assign return courier", run: (ord) => pickCourier("Assign return courier", ord, (uid) => { void assignReturn(ord._id, uid); }) };
      case "return_assigned":
      case "return_en_route":
      case "return_arrived":
        return legAssignedToMe(o, "return")
          ? { label: `Manage return — ${statusLabel(o.status)}`, run: (ord) => manageLeg(ord, "RETURN") }
          : null;
      case "awaiting_customer_pickup":
        // Self-pickup handover. Any outstanding balance is settled inside the
        // modal — the server refuses the handover while money is owed.
        return { label: "Hand over to customer", run: (ord) => setCounter({ order: ord, mode: "HANDOVER" }) };
      default:
        return null;
    }
  };

  const runAction = async (o: GqlOnlineOrder, a: Action) => {
    setBusyId(o._id);
    try { await a.run(o); }
    catch (e: unknown) { notify.error("Action failed", errField(e, "message") ?? "Please try again."); }
    finally { setBusyId(null); }
  };

  const needsActionCount = buckets.NEEDS_ACTION.length;
  const searching = query.trim().length > 0;
  // The search field is dead weight on a shop that has never taken an order.
  const showSearch = incoming.length > 0 || searching;

  const TABS: readonly { key: TabKey; label: string; count?: number }[] = [
    { key: "NEEDS_ACTION", label: "Needs action", count: needsActionCount },
    { key: "ACTIVE", label: "Active", count: buckets.ACTIVE.length },
    { key: "DONE", label: "Completed" },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + SP._10 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {/* Whether customers can reach this shop right now is operational
              context, not a setting — it belongs on the screen it governs. */}
          {acceptingOrders != null ? (
            <View style={[styles.availChip, { backgroundColor: acceptingOrders ? C.success100 : C.gray100 }]}>
              <View style={[styles.availDot, { backgroundColor: acceptingOrders ? C.success500 : C.gray400 }]} />
              <Text style={[styles.availText, { color: acceptingOrders ? C.success700 : C.gray600 }]}>
                {acceptingOrders ? "Accepting orders" : "Offline"}
              </Text>
            </View>
          ) : null}
          {/* Pushed to the right of the title row — the owner reaches
              notifications from the dashboard bell, staff from here. */}
          {headerRight ? <View style={{ marginLeft: "auto" }}>{headerRight}</View> : null}
        </View>
        <Text style={styles.sub}>{branchId ? subtitle : "Loading your shop…"}</Text>
        {headerAccessory ? <View style={{ marginHorizontal: -SP._16 }}>{headerAccessory}</View> : null}

        {showSearch ? (
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={C.gray400} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search order # or customer"
              placeholderTextColor={C.gray400}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {searching ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={C.gray400} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = tab === t.key;
            // Work waiting on the provider gets a tinted pill when it isn't the
            // open tab — enough to pull the eye, short of an alarm colour.
            const urgent = !on && t.key === "NEEDS_ACTION" && needsActionCount > 0;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.tab,
                  on ? { backgroundColor: accent.base } : styles.tabIdle,
                  urgent && { backgroundColor: accent.bg, borderColor: accent.base },
                ]}
                onPress={() => { setTab(t.key); setStatusFilter(null); }}
              >
                <Text style={[styles.tabText, { color: on ? C.white : urgent ? accent.dark : C.gray600 }]}>{t.label}</Text>
                {/* A zero count is noise — the absence of a badge says it. */}
                {t.count ? (
                  <View style={[styles.tabCount, { backgroundColor: on ? "rgba(255,255,255,0.28)" : urgent ? accent.base : C.gray100 }]}>
                    <Text style={[styles.tabCountText, { color: on || urgent ? C.white : C.gray600 }]}>{t.count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Lifecycle narrowing inside the chosen tab — kept off the top level so
            the header never becomes a seven-status chip rail. */}
        {statusOptions.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <FilterChip
              label="All statuses"
              selected={activeStatusFilter === null}
              accent={accent}
              onPress={() => setStatusFilter(null)}
            />
            {statusOptions.map((s) => (
              <FilterChip
                key={s}
                label={statusLabel(s)}
                selected={activeStatusFilter === s}
                accent={accent}
                onPress={() => setStatusFilter((cur) => (cur === s ? null : s))}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.base} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoadingIncoming && incoming.length === 0 ? (
          <ActivityIndicator size="large" color={accent.base} style={{ marginTop: SP._32 }} />
        ) : visible.length === 0 ? (
          <EmptyState
            loadError={loadError}
            tab={tab}
            searching={searching}
            filtered={activeStatusFilter !== null}
            acceptingOrders={acceptingOrders}
            onEnableOrders={onEnableOrders}
            onClear={() => { setQuery(""); setStatusFilter(null); }}
            accent={accent}
          />
        ) : (
          visible.map((o) => {
            const action = actionFor(o);
            const needsAction = NEEDS_ACTION_STATUSES.has(o.status);
            const waiting = !action && ACTIVE_STATUSES.has(o.status);
            return (
              <View key={o._id} style={[styles.card, needsAction && { borderColor: accent.base, borderWidth: 1.5 }]}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderRef}>#LB-{o._id.slice(-4).toUpperCase()}</Text>
                  <View style={[styles.statusChip, { backgroundColor: accent.bg }]}>
                    <Text style={[styles.statusChipText, { color: accent.dark }]}>{statusLabel(o.status)}</Text>
                  </View>
                </View>
                <Text style={styles.customer}>{o.customer.displayName}</Text>
                <Text style={styles.line}>{customerAddressLine(o)}</Text>
                <Text style={styles.line}>{o.serviceLines.map((l) => l.serviceName).join(" · ")}</Text>
                {/* The pickup DAY is the only scheduling promise made to the
                    customer, so the provider has to be able to see it. It was
                    previously absent from every provider surface — the old
                    30-minute window was collected and then shown to nobody. */}
                {o.fulfillment.scheduledPickup && (
                  <View style={styles.pickupRow}>
                    <Ionicons name="calendar-outline" size={14} color={accent.base} />
                    <Text style={[styles.pickupDay, { color: accent.base }]}>
                      {o.fulfillment.scheduledPickup.label}
                    </Text>
                    <Text style={styles.pickupTier}>
                      {o.fulfillment.pickupMode === "CUSTOMER_DROPOFF"
                        ? "Customer drops off"
                        : o.fulfillment.pickupSubMode === "SCHEDULED_PAID"
                          ? "Priority pickup"
                          : "Batched pickup"}
                    </Text>
                  </View>
                )}
                <View style={styles.metaRow}>
                  {/* Unpriced until the weigh-in — "₱0" read as a free job. */}
                  <Text style={styles.price}>
                    {pesosOrPending(
                      o.pricing.customerTotalCentavos ?? o.pricing.estimatedTotalCentavos,
                      pesos,
                    )}
                  </Text>
                  {o.pricing.actualWeightKg != null ? (
                    <Text style={styles.weight}>{o.pricing.actualWeightKg} kg weighed</Text>
                  ) : o.pricing.estimatedWeightKg != null ? (
                    <Text style={styles.weight}>~{o.pricing.estimatedWeightKg} kg est.</Text>
                  ) : null}
                </View>
                {/* Only when Lalaba has actually given something up on this
                    order. An ordinary order's fee is the platform's business
                    and putting a five-row table on every card would bury the
                    action button — but a WAIVED fee was invisible, and a
                    provider cannot be told they are getting a reward by simply
                    not being charged. */}
                {(o.pricing.platformFeeDiscountCentavos ?? 0) > 0 ? (
                  <View style={{ marginTop: SP._12 }}>
                    <PartnerFeeBreakdown pricing={o.pricing} />
                  </View>
                ) : null}

                {action && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: accent.base }, busyId === o._id && { opacity: 0.6 }]}
                    disabled={busyId === o._id}
                    onPress={() => runAction(o, action)}
                  >
                    {busyId === o._id
                      ? <ActivityIndicator size="small" color={C.white} />
                      : <Text style={styles.actionBtnText}>{action.label}</Text>}
                  </TouchableOpacity>
                )}
                {/* Reporting a problem is always secondary to the main action —
                    it is the exception, not the step. Offered only while the
                    shop actually has the laundry. */}
                {o.status === "laundry_in_progress" && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => setHoldTarget(o)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="alert-circle-outline" size={15} color={C.gray600} />
                    <Text style={styles.secondaryBtnText}>Report a problem</Text>
                  </TouchableOpacity>
                )}
                {o.status === "laundry_quality_hold" && (
                  <View style={styles.waitRow}>
                    <Ionicons name="hourglass-outline" size={14} color={C.warning600} />
                    <Text style={styles.waitText}>
                      Waiting on the customer&apos;s answer
                      {o.activeQualityHold?.additionalChargeCentavos
                        ? ` about ${pesos(o.activeQualityHold.additionalChargeCentavos)}`
                        : ""}
                    </Text>
                  </View>
                )}
                {waiting && (
                  <View style={styles.waitRow}>
                    <Ionicons name="time-outline" size={14} color={C.gray400} />
                    <Text style={styles.waitText}>
                      {o.status.startsWith("pickup") || o.status.startsWith("return") ? "Waiting on courier" : "No action needed right now"}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: SP._32 }} />
      </ScrollView>

      <CounterCollectModal
        order={counter?.order ?? null}
        mode={counter?.mode ?? "RECEIVE"}
        accent={accent}
        onClose={() => setCounter(null)}
      />

      <QualityHoldSheet
        order={holdTarget}
        accent={accent}
        onClose={() => setHoldTarget(null)}
        onRaised={() => { if (branchId) void fetchIncoming(branchId); }}
      />

      <CourierPickerSheet
        visible={courierPicker != null}
        title={courierPicker?.title ?? "Assign courier"}
        couriers={couriers}
        selfUid={courierPicker ? selfAssignableUid(courierPicker.order) : null}
        accent={accent}
        onPick={(uid) => courierPicker?.onPick(uid)}
        onClose={() => setCourierPicker(null)}
      />
    </View>
  );
}

function FilterChip({
  label, selected, accent, onPress,
}: Readonly<{ label: string; selected: boolean; accent: ProviderAccent; onPress: () => void }>) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.filterChip,
        selected ? { backgroundColor: accent.bg, borderColor: accent.base } : { borderColor: C.gray200 },
      ]}
    >
      <Text style={[styles.filterChipText, { color: selected ? accent.dark : C.gray600 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Empty states ────────────────────────────────────────────────────────────
// Centred in the content area rather than boxed in a bordered card: an outlined
// rectangle reads as "a module failed to load here".
function EmptyState({
  loadError, tab, searching, filtered, acceptingOrders, onEnableOrders, onClear, accent,
}: Readonly<{
  loadError?: string | null;
  tab: TabKey;
  searching: boolean;
  filtered: boolean;
  acceptingOrders?: boolean;
  onEnableOrders?: () => void;
  onClear: () => void;
  accent: ProviderAccent;
}>) {
  // Before any "nothing here" copy: an empty list because the request FAILED
  // is a different fact from an empty list, and only one of the two is worth
  // pulling to refresh.
  if (loadError) {
    return (
      <Empty
        icon="cloud-offline-outline"
        title="Couldn't load orders"
        body={loadError}
        accent={accent}
      />
    );
  }

  if (searching || filtered) {
    return (
      <Empty
        icon="search-outline"
        title="No matching orders"
        body="Try a different order number, customer name or status."
        cta={{ label: "Clear filters", onPress: onClear }}
        accent={accent}
      />
    );
  }

  if (tab === "DONE") {
    return <Empty icon="checkmark-done-outline" title="No completed orders yet" body="Finished orders move here once the customer has their laundry back." accent={accent} />;
  }

  // Nothing to do AND nothing coming: the useful thing to say is whether
  // customers can even reach this shop right now.
  if (acceptingOrders === false) {
    // Without a real availability mutation the state is read-only — say where
    // it's controlled rather than offering a button that can't do anything.
    return onEnableOrders ? (
      <Empty
        icon="pause-circle-outline"
        title="You're currently offline"
        body="Customers can't place new orders with your business right now."
        cta={{ label: "Start accepting orders", onPress: onEnableOrders }}
        accent={accent}
      />
    ) : (
      <Empty
        icon="pause-circle-outline"
        title="Offline"
        body="This branch isn't currently accepting marketplace orders. Availability is managed in your business settings."
        accent={accent}
      />
    );
  }

  if (tab === "NEEDS_ACTION") {
    return <Empty icon="checkmark-circle-outline" title="You're all caught up" body="Nothing is waiting on you. New customer orders show up here automatically." accent={accent} />;
  }
  return <Empty icon="receipt-outline" title="No orders in progress" body="Accepted orders being picked up, washed or delivered appear here." accent={accent} />;
}

function Empty({
  icon, title, body, cta, accent,
}: Readonly<{
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
  cta?: { label: string; onPress: () => void };
  accent: ProviderAccent;
}>) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={C.gray300} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{body}</Text>
      {cta ? (
        <TouchableOpacity style={[styles.emptyCta, { backgroundColor: accent.base }]} onPress={cta.onPress}>
          <Text style={styles.emptyCtaText}>{cta.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200, paddingHorizontal: SP._16, paddingBottom: SP._12, gap: SP._8 },
  pickupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._6,
    marginTop: SP._6,
  },
  pickupDay: { fontSize: 13, fontWeight: "700" },
  pickupTier: { fontSize: 12, color: C.gray500 },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SP._8 },
  title: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  availChip: { flexDirection: "row", alignItems: "center", gap: SP._6, height: 24, paddingHorizontal: SP._10, borderRadius: RADIUS.full },
  availDot: { width: 6, height: 6, borderRadius: 3 },
  availText: { fontSize: 11, fontWeight: "700" },
  sub: { fontSize: 13, color: C.gray500 },
  search: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    height: 40, paddingHorizontal: SP._12, marginTop: SP._4,
    borderRadius: RADIUS.md, backgroundColor: C.gray50,
    borderWidth: 1, borderColor: C.gray200,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.gray900, paddingVertical: 0 },
  tabs: { flexDirection: "row", gap: SP._8, marginTop: SP._4 },
  tab: { flexDirection: "row", alignItems: "center", gap: SP._6, height: 32, paddingHorizontal: SP._14, borderRadius: RADIUS.full, justifyContent: "center" },
  tabIdle: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  tabText: { fontSize: 12, fontWeight: "600" },
  tabCount: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  tabCountText: { fontSize: 11, fontWeight: "800" },
  filterRow: { gap: SP._6, paddingRight: SP._16, alignItems: "center" },
  filterChip: { height: 28, paddingHorizontal: SP._10, borderRadius: RADIUS.full, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  filterChipText: { fontSize: 11, fontWeight: "600" },
  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, gap: SP._12, flexGrow: 1 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._14, gap: SP._6 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderRef: { fontSize: 15, fontWeight: "700", color: C.gray900, fontFamily: MONO },
  statusChip: { height: 22, paddingHorizontal: SP._10, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statusChipText: { fontSize: 11, fontWeight: "700" },
  customer: { fontSize: 15, fontWeight: "700", color: C.gray900, marginTop: 2 },
  line: { fontSize: 13, color: C.gray600 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  price: { fontSize: 15, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  weight: { fontSize: 12, color: C.gray500 },
  actionBtn: { height: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SP._8 },
  actionBtnText: { fontSize: 14, fontWeight: "700", color: C.white },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 40, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200,
    marginTop: SP._8,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  waitRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SP._8 },
  waitText: { fontSize: 12, color: C.gray400, fontWeight: "500" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._24, paddingBottom: SP._32, gap: SP._8 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: C.gray800, textAlign: "center", marginTop: SP._4 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: "center", maxWidth: 280, lineHeight: 19 },
  emptyCta: { height: 44, paddingHorizontal: SP._20, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SP._8 },
  emptyCtaText: { fontSize: 14, fontWeight: "700", color: C.white },
});
