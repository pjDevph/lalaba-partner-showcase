// app/(courier)/dashboard.tsx
// Courier staff dashboard — frame 27 of the Partner App design board, now wired
// to the real online-orders domain: myAssignedOnlineOrders feeds the task list,
// and each card's own CTA drives the leg state machine (startPickupRoute /
// startReturnRoute) — no single bottom action bar, so a courier holding several
// legs can start any of them without hunting for the "next" one. The leg model
// itself (buckets, derivation) is shared with the map and History tabs — see
// src/utils/courierTasks.ts.

import React, { useCallback, useMemo, useState } from "react";
import { errField } from "../../src/utils/userError";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../src/theme/tokens";
import { notify } from "../../src/stores/notificationStore";
import SelfieAvatar from "../../src/components/SelfieAvatar";
import { useAuthStore } from "../../src/stores/authStore";
import { useOnlineOrdersStore, ONLINE_ORDERS_POLL_MS } from "../../src/stores/onlineOrdersStore";
import { usePoll } from "../../src/hooks/usePoll";
import { customerAddressLine, pesos } from "../../src/services/graphql/onlineOrders";
import {
  BUCKETS,
  BUCKET_LABEL,
  LEG_CHIP,
  deriveTasks,
  mergeFeeds,
  orderRef,
  type Bucket,
  type CourierLegTask,
} from "../../src/utils/courierTasks";
import { CourierHeader } from "../../src/components/CourierHeader";
import { NotificationBellButton } from "../../src/components/NotificationBellButton";
import { useNotificationFeedStore, NOTIFICATION_POLL_MS } from "../../src/stores/notificationFeedStore";
import { distanceKm, formatDistance } from "../../src/utils/geo";
import { useCurrentPosition } from "../../src/hooks/useCurrentPosition";
import { PENDING_PRICE_LABEL } from "../../src/lib/pricingLabels";

// ─── Sky palette (frame 27) ─────────────────────────────────────────────────────
const SKY      = C.courier500;   // #0284C7
const SKY_BG    = C.courier100;   // #EAF3FF
const HOLD_BG   = C.courier200;   // #DBEAFE
const HOLD_FG   = C.courier700;   // #1D4ED8
const MONO = "monospace";

// Each card carries its own CTA — a NEW leg starts its route, an ACTIVE one
// resumes where the courier left off. COMPLETED legs are read-only.
function TaskCard({
  t,
  busy,
  onPress,
  onStart,
  distanceKmValue,
}: Readonly<{
  t: CourierLegTask;
  busy: boolean;
  onPress: () => void;
  onStart: () => void;
  /** Straight-line km from the rider. Undefined when there is no GPS fix. */
  distanceKmValue?: number;
}>) {
  const o = t.order;
  const weight = o.pricing.estimatedWeightKg;
  // What this rider needs to know before they set off: is there money to
  // collect at this stop, and how much. A balance can exist on either leg now —
  // a Pay Later order settles on the return, and an approved surcharge can
  // leave even a paid-at-pickup order short.
  const due = o.amountDueCentavos ?? 0;
  // Before the weigh-in there is no total yet, so amountDue is 0 — which is not
  // the same as "nothing to collect". Say so plainly instead of implying the
  // rider can skip the money step.
  const priced = o.pricing.customerTotalCentavos != null;
  const payment = !priced
    ? PENDING_PRICE_LABEL.toLowerCase()
    : due > 0
      ? t.leg === "PICKUP"
        ? `collect ${pesos(due)} at pickup`
        : `collect ${pesos(due)} on delivery`
      : o.paymentSummary.amountCollectedCentavos != null
        ? "already paid"
        : "nothing to collect";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Header: reference + which leg this is */}
      <View style={styles.cardTop}>
        <Text style={styles.orderRef}>{orderRef(o)}</Text>
        <View style={[styles.legChip, { backgroundColor: LEG_CHIP[t.leg].bg }]}>
          <Text style={[styles.legChipText, { color: LEG_CHIP[t.leg].fg }]}>{t.leg}</Text>
        </View>
      </View>

      <View style={styles.cardDivider} />

      {/* Icons carry the meaning of each line, so no "Collect from" / "Deliver
          to" prefixes are needed — the leg chip above already states direction. */}
      <View style={styles.cardRow}>
        <Ionicons name="storefront-outline" size={17} color={C.gray500} />
        <Text style={styles.provider} numberOfLines={1}>{o.provider.providerName}</Text>
      </View>

      <View style={styles.cardRow}>
        <Ionicons name="person-outline" size={17} color={C.gray500} />
        <Text style={styles.customer} numberOfLines={1}>{o.customer.displayName}</Text>
      </View>

      <View style={styles.cardRow}>
        <Ionicons name="location-outline" size={17} color={C.gray500} />
        <Text style={styles.address} numberOfLines={2}>{customerAddressLine(o)}</Text>
        {/* Straight-line, so it is a rough sense of "how far", not an ETA.
            Absent entirely without a GPS fix rather than shown as zero. */}
        {distanceKmValue != null ? (
          <Text style={styles.distance}>{formatDistance(distanceKmValue)}</Text>
        ) : null}
      </View>

      <Text style={styles.meta}>
        {weight != null ? `~${weight} kg · ` : ""}{payment}
      </Text>

      {t.bucket === "NEW" && (
        <TouchableOpacity
          style={[styles.cardBtn, busy && styles.cardBtnBusy]}
          onPress={onStart}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.cardBtnText}>{busy ? "Starting…" : "Start navigation"}</Text>
        </TouchableOpacity>
      )}
      {t.bucket === "ACTIVE" && (
        <TouchableOpacity style={styles.cardBtnGhost} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.cardBtnGhostText}>Continue task</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const taskKey = (t: CourierLegTask) => `${t.order._id}-${t.leg}`;

export default function CourierDashboard() {
  const user   = useAuthStore((s) => s.user);
  const uid = user?.uid ?? "";

  const { myLegs, myCompletedLegs, fetchAssigned, fetchCompletedLegs, startPickup, startReturn } =
    useOnlineOrdersStore();

  const [bucket, setBucket] = useState<Bucket>("NEW");
  // "Nearest" is opt-in. The default order is the one the backend returns —
  // oldest first — because a queue that silently reorders itself as the rider
  // moves is disorienting when they are already part-way through it.
  const [sortByNearest, setSortByNearest] = useState(false);
  const { position } = useCurrentPosition();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Which card's CTA is mid-flight — per leg, since every card has its own now.
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Only the live half is polled. The Completed tab is fed by the heavy
  // COMPLETED slice, which loads once per focus — finished work doesn't move.
  usePoll(fetchAssigned, ONLINE_ORDERS_POLL_MS);

  // Unread notifications → the header bell dot.
  const refreshUnread = useNotificationFeedStore((s) => s.refreshUnread);
  usePoll(refreshUnread, NOTIFICATION_POLL_MS);
  useFocusEffect(
    useCallback(() => { void fetchCompletedLegs(uid); }, [fetchCompletedLegs, uid]),
  );

  const tasks = useMemo(
    () => deriveTasks(mergeFeeds(myLegs, myCompletedLegs), uid),
    [myLegs, myCompletedLegs, uid],
  );
  // Search runs on the client — the whole assigned feed is already in memory
  // (myAssignedOnlineOrders), so there's nothing to fetch and results stay live
  // as the 15s poll updates.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return tasks;
    return tasks.filter((t) => {
      const o = t.order;
      // Match what's visible on the card, plus the customer name — a rider
      // searching "elena" is thinking of the person, not the order ref.
      return [
        orderRef(o),
        o.provider.providerName,
        o.customer.displayName,
        customerAddressLine(o),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [tasks, q]);

  // Counts follow the search so the tabs say where the matches are — otherwise
  // a rider searching for a customer sitting in Active, while viewing New, gets
  // no hint which tab to try.
  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { NEW: 0, ACTIVE: 0, COMPLETED: 0 };
    for (const t of matches) c[t.bucket] += 1;
    return c;
  }, [matches]);

  const distanceOf = useCallback(
    (t: CourierLegTask): number | undefined => {
      const to = t.order.customer?.mapLocation;
      // mapLocation is redacted until a leg is assigned, so this is genuinely
      // absent sometimes rather than merely missing.
      if (!position || !to) return undefined;
      return distanceKm(position, to);
    },
    [position],
  );

  const visible = useMemo(() => {
    const inBucket = matches.filter((t) => t.bucket === bucket);
    if (!sortByNearest || !position) return inBucket;
    // Stops with no location sink to the bottom rather than sorting as 0 km,
    // which would put an unknown address first.
    return [...inBucket].sort((a, b) => {
      const da = distanceOf(a) ?? Number.POSITIVE_INFINITY;
      const db = distanceOf(b) ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [matches, bucket, sortByNearest, position, distanceOf]);

  // Bags in custody = pickups I collected whose laundry hasn't reached the provider…
  // (post-recordPickup the BE moves straight to laundry_in_progress, so "holding"
  // is the en-route/arrived window of an active pickup leg)
  const holding = tasks.filter((t) => t.bucket === "ACTIVE" && t.leg === "PICKUP").length;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAssigned(), fetchCompletedLegs(uid)]);
    setRefreshing(false);
  };

  const openTask = (t: CourierLegTask) =>
    router.push({ pathname: "/(courier)/task-detail", params: { id: t.order._id, leg: t.leg, from: "dashboard" } });

  const startTask = async (t: CourierLegTask) => {
    if (busyKey) return;
    setBusyKey(taskKey(t));
    try {
      if (t.leg === "PICKUP") await startPickup(t.order._id);
      else await startReturn(t.order._id);
      openTask(t);
    } catch (e: unknown) {
      notify.error("Could not start", errField(e, "message") ?? "Try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.root}>
      {/* Identity header */}
      {/* Identity-led header (this is the stack's home screen), but inside the
          shared CourierHeader shell so padding/border/background match the
          title-led tabs. */}
      <CourierHeader
        right={<NotificationBellButton />}
        footer={
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { backgroundColor: SKY_BG }]}>
              <Text style={[styles.chipText, { color: SKY }]}>● ON DUTY</Text>
            </View>
            {holding > 0 && (
              <View style={[styles.chip, { backgroundColor: HOLD_BG }]}>
                <Text style={[styles.chipText, { color: HOLD_FG }]}>
                  {holding} PICKUP{holding === 1 ? "" : "S"} IN PROGRESS
                </Text>
              </View>
            )}
          </View>
        }
      >
        <View style={styles.identityRow}>
          <SelfieAvatar
            photoUrl={user?.photoUrl}
            displayName={user?.displayName}
            style={styles.avatar}
            textStyle={styles.avatarText}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.biz} numberOfLines={1}>{user?.displayName ?? "Courier"}</Text>
            <Text style={styles.role} numberOfLines={1}>
              Delivery staff · {counts.NEW + counts.ACTIVE} active task{counts.NEW + counts.ACTIVE === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      </CourierHeader>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SKY} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.search}>
          <Ionicons name="search" size={17} color={C.gray400} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search ref, customer, address"
            placeholderTextColor={C.gray400}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={17} color={C.gray400} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.tabs}>
          {BUCKETS.map((b) => {
            const active = b === bucket;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.tab, active ? styles.tabActive : styles.tabIdle]}
                onPress={() => setBucket(b)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tabText, { color: active ? C.white : C.gray600 }]}>
                  {BUCKET_LABEL[b]}{counts[b] > 0 ? ` ${counts[b]}` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Offered only when it can actually be honoured: without a GPS fix
            there is no origin to measure from, and a dead toggle invites a
            rider to keep tapping it. */}
        {position ? (
          <TouchableOpacity
            style={[styles.sortRow, sortByNearest && styles.sortRowActive]}
            onPress={() => setSortByNearest((v) => !v)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={sortByNearest ? "navigate" : "navigate-outline"}
              size={15}
              color={sortByNearest ? SKY : C.gray600}
            />
            <Text style={[styles.sortText, sortByNearest && { color: SKY }]}>
              {sortByNearest ? "Nearest first" : "Sort by nearest"}
            </Text>
          </TouchableOpacity>
        ) : null}

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {q ? "No matches" : `No ${BUCKET_LABEL[bucket].toLowerCase()} tasks`}
            </Text>
            <Text style={styles.emptySub}>
              {q
                ? `Nothing in ${BUCKET_LABEL[bucket].toLowerCase()} matches "${query.trim()}".`
                : "Pickups and returns assigned to you appear here."}
            </Text>
          </View>
        ) : (
          visible.map((t) => (
            <TaskCard
              distanceKmValue={distanceOf(t)}
              key={taskKey(t)}
              t={t}
              busy={busyKey === taskKey(t)}
              onPress={() => openTask(t)}
              onStart={() => startTask(t)}
            />
          ))
        )}

        <View style={{ height: SP._16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles (frame 27 spec) ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },

  identityRow: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  avatar: { width: 28, height: 28, borderRadius: RADIUS.sm, backgroundColor: SKY_BG, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "700", color: SKY },
  biz: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  role: { fontSize: 12, color: C.gray500, marginTop: 1 },

  chipsRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  chip: { height: 22, paddingHorizontal: SP._10, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 11, fontWeight: "700" },

  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, gap: SP._12 },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    height: 44,
    paddingHorizontal: SP._12,
    borderRadius: RADIUS.md,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: C.gray900, padding: 0 },

  tabs: { flexDirection: "row", gap: SP._8, marginBottom: SP._4 },
  tab: { height: 32, paddingHorizontal: SP._12, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: SKY },
  tabIdle: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  tabText: { fontSize: 12, fontWeight: "600" },

  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 20, padding: SP._20, gap: SP._12 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SP._12 },
  orderRef: { flex: 1, minWidth: 0, fontSize: 21, fontWeight: "800", color: C.gray900, fontFamily: MONO },
  legChip: { paddingHorizontal: SP._12, paddingVertical: SP._6, borderRadius: RADIUS.sm },
  legChipText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  cardDivider: { height: 1, backgroundColor: C.gray100 },

  cardRow: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  provider: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: "700", color: C.gray900 },
  customer: { flex: 1, minWidth: 0, fontSize: 15, color: C.gray900 },
  address: { flex: 1, minWidth: 0, fontSize: 14, color: C.gray500, lineHeight: 20 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white, marginBottom: SP._10 },
  sortRowActive: { borderColor: SKY, backgroundColor: SKY_BG },
  sortText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  distance: { fontSize: 12, fontWeight: "700", color: C.gray500, marginLeft: "auto", paddingLeft: 8 },
  meta: { fontSize: 14, color: C.gray700 },

  cardBtn: { height: 52, borderRadius: RADIUS.md, backgroundColor: SKY, alignItems: "center", justifyContent: "center", marginTop: SP._4 },
  cardBtnBusy: { opacity: 0.6 },
  cardBtnText: { fontSize: 16, fontWeight: "700", color: C.white },
  cardBtnGhost: { height: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: SKY, backgroundColor: SKY_BG, alignItems: "center", justifyContent: "center", marginTop: SP._4 },
  cardBtnGhostText: { fontSize: 16, fontWeight: "700", color: SKY },

  empty: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, padding: SP._24, alignItems: "center", gap: SP._6 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.gray700 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 },
});
