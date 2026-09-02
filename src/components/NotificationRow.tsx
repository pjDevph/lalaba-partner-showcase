// src/components/NotificationRow.tsx
// One row in the notification inbox, shared by all four role stacks.
//
// Layout matches the customer app's inbox (LALABA_CUSTOMER_APP_DEV
// app/notifications.tsx) so the two halves of the product read the same way:
// icon rail, then a text column carrying title · time · unread dot, body, and
// the order reference as its own quiet metadata line.

import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../theme/tokens";
import type {
  NotificationCategory,
  NotificationItem,
} from "../services/graphql/notifications";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
type Glyph = { icon: IoniconName; fg: string; bg: string };

const BLUE = { fg: C.brand600, bg: C.brand50 };
const GREEN = { fg: C.success700, bg: C.success100 };
const GREY = { fg: C.gray700, bg: C.gray100 };

/** Fallback when a notification carries no order status — the coarse kind of
 *  thing it is. Several of these have no customer-side equivalent. */
const CATEGORY_STYLE: Record<NotificationCategory, Glyph> = {
  ORDER: { icon: "receipt-outline", ...BLUE },
  VERIFICATION: { icon: "shield-checkmark-outline", ...GREEN },
  DEVICE: { icon: "phone-portrait-outline", fg: C.warning700, bg: C.warning100 },
  STAFF: { icon: "people-outline", ...BLUE },
  ACCOUNT: { icon: "person-circle-outline", ...GREY },
  BROADCAST: { icon: "megaphone-outline", ...BLUE },
  SYSTEM: { icon: "information-circle-outline", ...GREY },
};

/**
 * Icon keyed off the ORDER STATUS first, category second.
 *
 * Category alone gave a screen of identical receipts: every order row shares
 * one category, so the glyph rail carried no information at all and a courier
 * scanning the list could not tell an assignment from a completed drop-off.
 * The status is what actually differs between rows, so that is what the icon
 * shows.
 */
function glyphFor(item: NotificationItem): Glyph {
  // Action-needed reads amber whatever the status — "you must do something"
  // matters more than which step it is.
  if (item.type === "ORDER_ACTION_NEEDED") {
    return { icon: "alert-circle-outline", fg: C.warning700, bg: C.warning100 };
  }

  switch (item.data?.status ?? "") {
    case "accepted_by_provider":
    case "delivered_to_customer":
    case "completed":
      return { icon: "checkmark-circle-outline", ...GREEN };
    case "rejected_by_provider":
    case "cancelled":
      return { icon: "close-circle-outline", fg: C.error700, bg: C.error100 };
    case "pickup_assigned":
    case "return_assigned":
      return { icon: "person-outline", ...BLUE };
    case "pickup_en_route":
    case "return_en_route":
      return { icon: "car-outline", ...BLUE };
    case "pickup_arrived":
    case "return_arrived":
      return { icon: "location-outline", ...BLUE };
    case "pickup_weighed":
      return { icon: "scale-outline", ...BLUE };
    case "laundry_ready":
      return { icon: "basket-outline", ...GREEN };
    case "awaiting_customer_pickup":
      return { icon: "location-outline", ...BLUE };
    case "refunded":
      return { icon: "wallet-outline", ...BLUE };
    default:
      return CATEGORY_STYLE[item.category] ?? CATEGORY_STYLE.SYSTEM;
  }
}

/** Short relative time. Long enough ago and the date is more use than "43d". */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

interface Props {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
}

export function NotificationRow({ item, onPress }: Readonly<Props>) {
  const { icon, fg, bg } = glyphFor(item);
  const unread = !item.isRead;

  return (
    <TouchableOpacity
      style={[styles.row, unread ? styles.rowUnread : styles.rowRead]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}. ${item.isRead ? "Read" : "Unread"}`}
    >
      <View style={[styles.icon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={20} color={fg} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.time}>{relativeTime(item.createdAt)}</Text>
          {/* Dot last but INSIDE the text column's padding, so it never looks
              pinned to the screen edge. */}
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>

        <Text style={styles.text} numberOfLines={3}>
          {item.body}
        </Text>

        {/* The reference as its own line rather than inlined into the body —
            it is the thing a courier reads out and quotes back. */}
        {item.data?.orderNumber ? (
          <Text style={styles.meta}>Order {item.data.orderNumber}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// Icon rail width — the separator in NotificationsScreen insets to match, so
// the divider separates messages rather than cutting across the icons.
export const ICON_RAIL = 42 + SP._16 + SP._12;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: SP._16,
    paddingVertical: SP._12 + 2,
  },
  // Unread is a background wash plus a dot, never bold-only: weight alone is
  // hard to judge without a read row adjacent to compare against.
  rowUnread: { backgroundColor: C.brand50 },
  rowRead: { backgroundColor: C.white },
  icon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    // Replaces the parent `gap`, which not every RN version honours on a row.
    marginRight: SP._12,
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: "600",
    color: C.gray900,
  },
  time: { flexShrink: 0, fontSize: 12, color: C.gray500, marginLeft: SP._8 },
  text: { fontSize: 14, color: C.gray600, marginTop: 2, lineHeight: 19 },
  meta: { fontSize: 12, color: C.gray500, marginTop: 3 },
  unreadDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: RADIUS.full,
    marginLeft: 6,
    backgroundColor: C.brand500,
  },
});
