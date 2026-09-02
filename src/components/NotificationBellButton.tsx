// src/components/NotificationBellButton.tsx
// The header bell, with its unread dot.
//
// Lifted out of app/(tabs)/dashboard.tsx so the merchant, washer and courier
// headers share one button instead of three copies of the same 40x40 circle —
// and so neither oversized dashboard grows further (backlog F8).

import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { C, RADIUS } from "../theme/tokens";
import { useAuthStore } from "../stores/authStore";
import { useNotificationFeedStore } from "../stores/notificationFeedStore";
import { notificationsRouteFor } from "../services/notificationRouting";

interface Props {
  /** Override the unread signal. Pass this on a shared terminal, where the
   *  server's count is for the OWNER and the acting staff sees fewer rows. */
  unreadOverride?: number;
  iconColor?: string;
}

export function NotificationBellButton({ unreadOverride, iconColor }: Props) {
  // The `router` singleton rather than useRouter(), matching every dashboard
  // that hosts this button.
  const role = useAuthStore((s) => s.user?.role);
  const storeUnread = useNotificationFeedStore((s) => s.unread);
  const unread = unreadOverride ?? storeUnread;

  return (
    <TouchableOpacity
      style={styles.bell}
      onPress={() => router.push(notificationsRouteFor(role))}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
    >
      <Ionicons
        name="notifications-outline"
        size={20}
        color={iconColor ?? C.gray700}
      />
      {unread > 0 ? <View style={styles.headerDot} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: C.gray50,
    alignItems: "center",
    justifyContent: "center",
  },
  // A dot, not a count: at 40x40 a number is unreadable, and "is there
  // anything?" is the only question a header badge needs to answer. The exact
  // figure is one tap away.
  headerDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: RADIUS.full,
    backgroundColor: C.error500,
    borderWidth: 1.5,
    borderColor: C.white,
  },
});
