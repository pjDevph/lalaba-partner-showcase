// src/components/staff/StaffNotificationBell.tsx
// The staff notification bell, with its unread badge.
//
// One implementation, dropped into whichever header each staff surface already
// renders. Deliberately NOT a whole shared header component: POS, Orders and
// Chat each have a bar with their own controls (fullscreen, branch selector,
// filters), and a wrapper that owned the title would end up fighting all three.
// The bell is the part that must look and behave identically everywhere, so the
// bell is what is shared.
//
// It reads the same store the More screen's Notifications row reads, so the
// badge and the row can never disagree about the count.

import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import {
  useNotificationFeedStore,
  NOTIFICATION_POLL_MS,
} from "../../stores/notificationFeedStore";
import { usePoll } from "../../hooks/usePoll";

export function StaffNotificationBell({
  color = C.gray700,
  size = 20,
}: Readonly<{ color?: string; size?: number }>) {
  const unread = useNotificationFeedStore((s) => s.unread);
  const refreshUnread = useNotificationFeedStore((s) => s.refreshUnread);
  usePoll(refreshUnread, NOTIFICATION_POLL_MS);

  return (
    <Pressable
      onPress={() => router.push("/(staff)/notifications")}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      style={{ padding: 4 }}
    >
      <Ionicons name="notifications-outline" size={size} color={color} />
      {unread > 0 && (
        <View
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 3,
            borderRadius: 8,
            backgroundColor: C.error500,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: C.white, fontSize: 10, fontWeight: "800" }}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
