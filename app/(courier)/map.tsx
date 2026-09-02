// app/(courier)/map.tsx
// Courier map — every leg assigned to me, pinned on a real Google map, so the
// rider can see the shape of their day without opening each task. Reads the same
// myAssignedOnlineOrders feed as the Tasks tab (no extra query): deriveTasks()
// buckets the legs, and we plot the NEW + ACTIVE ones. Tapping a pin previews the
// stop; the card's CTA hands off to the same task-detail route the list uses.
//
// Plotting a NEW leg depends on the backend returning customer.mapLocation to
// the courier it is assigned to (canSeeCustomerLocation in
// online-orders.service.ts). It was once narrower than that — coordinates only
// resolved once a leg went live — and this screen quietly dropped every pin it
// could not place, so a rider with 10 tasks and 3 live legs saw 3 pins and no
// explanation. Hence `unplottable`: anything that can't be placed is counted
// and reported, never just skipped.

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/authStore";
import { useOnlineOrdersStore, ONLINE_ORDERS_POLL_MS } from "../../src/stores/onlineOrdersStore";
import { usePoll } from "../../src/hooks/usePoll";
import { customerAddressLine, customerLatLng } from "../../src/services/graphql/onlineOrders";
import { openMaps } from "../../src/utils/maps";
import { CourierMap, type CourierMarker, type MapRegion } from "../../src/components/CourierMap";
import { tabBarClearance } from "../../src/components/BottomTabBar";
import { CourierHeader } from "../../src/components/CourierHeader";
import { orderRef, deriveTasks, LEG_CHIP, type CourierLegTask } from "../../src/utils/courierTasks";

const SKY    = C.courier500;
const SKY_BG = C.courier100;
const MONO   = "monospace";

// Fallback centre when nothing is plottable — same default as AddressPicker.
const MANILA: MapRegion = {
  latitude: 14.676,
  longitude: 121.0437,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// Never zoom past street level on a single pin, and pad the fitted box so
// markers don't sit against the edges.
const MIN_DELTA = 0.01;
const PAD = 1.4;

interface Stop {
  task: CourierLegTask;
  coordinate: { latitude: number; longitude: number };
}

function fitRegion(stops: Stop[]): MapRegion {
  if (stops.length === 0) return MANILA;

  const lats = stops.map((s) => s.coordinate.latitude);
  const lngs = stops.map((s) => s.coordinate.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PAD, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PAD, MIN_DELTA),
  };
}

export default function CourierMapScreen() {
  const insets = useSafeAreaInsets();
  const uid = useAuthStore((s) => s.user?.uid) ?? "";

  const myLegs        = useOnlineOrdersStore((s) => s.myLegs);
  const fetchAssigned = useOnlineOrdersStore((s) => s.fetchAssigned);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  usePoll(fetchAssigned, ONLINE_ORDERS_POLL_MS);

  // Only legs I still have to drive to; completed ones would just clutter the map.
  //
  // A leg with no usable drop pin can't be plotted, so it is counted instead of
  // silently vanishing — a rider with ten tasks and three pins should be told
  // why, not left to conclude the board lost seven jobs. (That used to be the
  // normal case: the backend withheld coordinates until a leg went live, so
  // every NEW stop dropped out here. Assigned legs now carry their coordinates,
  // and this counter is back to covering only orders with no pin at all.)
  const { stops, unplottable } = useMemo(() => {
    const out: Stop[] = [];
    let missing = 0;
    for (const t of deriveTasks(myLegs, uid)) {
      if (t.bucket === "COMPLETED") continue;
      const coordinate = customerLatLng(t.order);
      if (!coordinate) {
        missing += 1;
        continue;
      }
      out.push({ task: t, coordinate });
    }
    return { stops: out, unplottable: missing };
  }, [myLegs, uid]);

  // Re-fit only when the set of plotted stops changes — not on every poll tick,
  // which would yank the map out from under a rider who has panned away.
  const stopKey = stops.map((s) => `${s.task.order._id}-${s.task.leg}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const region = useMemo(() => fitRegion(stops), [stopKey]);

  const keyOf = (s: Stop) => `${s.task.order._id}-${s.task.leg}`;

  const markers = useMemo<CourierMarker[]>(
    () =>
      stops.map((s, i) => ({
        id: keyOf(s),
        coordinate: s.coordinate,
        kind: s.task.bucket === "ACTIVE" ? "active" : "new",
        badge: String(i + 1),
        onPress: () => setSelectedId(keyOf(s)),
      })),
    [stops]
  );

  const selected = stops.find((s) => keyOf(s) === selectedId) ?? null;
  const selectedIndex = selected ? stops.findIndex((s) => keyOf(s) === selectedId) + 1 : 0;

  const openTask = (t: CourierLegTask) =>
    router.push({ pathname: "/(courier)/task-detail", params: { id: t.order._id, leg: t.leg, from: "map" } });

  const activeCount = stops.filter((s) => s.task.bucket === "ACTIVE").length;

  return (
    <View style={styles.root}>
      <CourierHeader
        title="Map"
        subtitle={
          stops.length === 0
            ? unplottable > 0
              ? `${unplottable} stop${unplottable === 1 ? "" : "s"} · no map pin`
              : "No stops to show"
            : `${stops.length} stop${stops.length === 1 ? "" : "s"}` +
              (activeCount > 0 ? ` · ${activeCount} in progress` : "") +
              (unplottable > 0 ? ` · ${unplottable} without a map pin` : "")
        }
      />

      <View style={styles.mapWrap}>
        {/* `region` is only the first-paint fallback; CourierMap re-frames the
            camera onto the pins itself once the map is ready. Extra bottom
            padding keeps the stop card from covering the lowest pin. */}
        <CourierMap
          region={region}
          markers={markers}
          fitPadding={{ top: 72, right: 56, bottom: 220, left: 56 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Centre on the *visible* map, not the full frame — it runs behind the
            bottom tab bar. */}
        {stops.length === 0 && (
          <View
            pointerEvents="none"
            style={[styles.emptyOverlay, { paddingBottom: tabBarClearance(insets.bottom) }]}
          >
            {/* An empty map with tasks on the board means every one of them is
                missing a drop pin — say that, rather than "nothing assigned",
                which would flatly contradict the Tasks tab. */}
            <View style={styles.emptyCard}>
              <Ionicons
                name={unplottable > 0 ? "alert-circle-outline" : "navigate-outline"}
                size={22}
                color={SKY}
              />
              <Text style={styles.emptyTitle}>
                {unplottable > 0 ? "No stops to pin" : "Nothing assigned"}
              </Text>
              <Text style={styles.emptySub}>
                {unplottable > 0
                  ? `${unplottable === 1 ? "Your task has" : "Your tasks have"} no map pin on the customer's address. Open ${unplottable === 1 ? "it" : "them"} in Tasks for the address and directions.`
                  : "Pickups and returns assigned to you appear here as pins."}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Clear the tab bar by its full height *plus* a gap — padding equal to
          the bar alone leaves the CTAs flush against its top edge. */}
      {selected && (
        <View style={[styles.card, { paddingBottom: tabBarClearance(insets.bottom) + SP._16 }]}>
          <View style={styles.cardTop}>
            <Text style={styles.orderRef}>
              {/* Was a second, inline copy of the id-derived ref — now the
                  one helper, so the map cannot show a different name from the
                  task list for the same order. */}
              #{selectedIndex} · {orderRef(selected.task.order).replace("#", "")}
            </Text>
            <TouchableOpacity onPress={() => setSelectedId(null)} hitSlop={10}>
              <Ionicons name="close" size={18} color={C.gray500} />
            </TouchableOpacity>
          </View>

          <View style={styles.legRow}>
            <View style={[styles.legChip, { backgroundColor: LEG_CHIP[selected.task.leg].bg }]}>
              <Text style={[styles.legChipText, { color: LEG_CHIP[selected.task.leg].fg }]}>
                {selected.task.leg}
              </Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>{selected.task.order.customer.displayName}</Text>
          </View>

          <Text style={styles.address} numberOfLines={2}>{customerAddressLine(selected.task.order)}</Text>

          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={[styles.btn, styles.secondaryBtn]}
              onPress={() => openMaps(customerAddressLine(selected.task.order), selected.coordinate)}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={16} color={SKY} />
              <Text style={styles.secondaryBtnText}>Navigate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.primaryBtn]}
              onPress={() => openTask(selected.task)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Open task</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },


  mapWrap: { flex: 1, overflow: "hidden" },

  emptyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: SP._24 },
  emptyCard: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 16,
    padding: SP._24,
    alignItems: "center",
    gap: SP._6,
    ...SHADOW.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.gray700 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19, maxWidth: 240 },

  card: {
    // Floats over the map rather than sitting in flow beneath it, so the map
    // runs to the screen edge and the rounded top corners read against tiles.
    // Bleeds to bottom: 0 and pads its content clear of the bottom tab bar,
    // so no sliver of map shows between the card and the screen edge.
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
    // Rounded top corners so the card reads as a sheet lifting off the map
    // rather than a flat band welded to the bottom edge. Deliberately larger
    // than RADIUS.lg — the token scale tops out at 16, which reads too subtle
    // at this width.
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SP._16,
    paddingTop: SP._16,
    gap: SP._8,
    ...SHADOW.sm,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderRef: { fontSize: 15, fontWeight: "700", color: C.gray900, fontFamily: MONO },
  legRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  legChip: {
    height: 20,
    paddingHorizontal: SP._8,
    borderRadius: RADIUS.full,
    backgroundColor: SKY_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  legChipText: { fontSize: 11, fontWeight: "700" },
  name: { flex: 1, minWidth: 0, fontSize: 13, color: C.gray900 },
  address: { fontSize: 13, color: C.gray600 },

  ctaRow: { flexDirection: "row", gap: SP._8 },
  btn: { height: 48, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  // "Navigate" hands off to the device's maps app; "Open task" stays in-app and
  // drives the leg state machine — so the in-app action carries the filled style.
  secondaryBtn: {
    flexDirection: "row",
    gap: SP._6,
    paddingHorizontal: SP._16,
    backgroundColor: SKY_BG,
    borderWidth: 1,
    borderColor: SKY,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: SKY },
  primaryBtn: { flex: 1, backgroundColor: SKY },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: C.white },
});
