// src/screens/notifications/NotificationsScreen.tsx
// The notification inbox, shared by all four role stacks.
//
// One screen rather than four: the feed is identical for every role — the
// backend already decided what each account may see. Only the accent colour
// differs, so that is the only prop.

import React, { useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TopBar, EmptyState } from "../../components/ui";
import { NotificationRow, ICON_RAIL } from "../../components/NotificationRow";
import { C, SP } from "../../theme/tokens";
import { useNotificationFeedStore } from "../../stores/notificationFeedStore";
import { useAuthStore } from "../../stores/authStore";
import { useEffectivePermissions } from "../../hooks/usePermission";
import { canSeeBackendPermission } from "../../types/permissions";
import { resolveNotificationTap } from "../../services/notificationRouting";
import { withGroupHeaders } from "../../utils/notificationGroups";
import type { NotificationItem } from "../../services/graphql/notifications";

/** How often the open inbox re-fetches. Matches the courier task feed's
 *  cadence — there are no subscriptions anywhere in this stack. */
const POLL_MS = 30_000;

interface Props {
  accentColor?: string;
}

export function NotificationsScreen({ accentColor = C.brand500 }: Readonly<Props>) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const role = useAuthStore((s) => s.user?.role);
  const perms = useEffectivePermissions();

  const items = useNotificationFeedStore((s) => s.items);
  const loading = useNotificationFeedStore((s) => s.loading);
  const refreshing = useNotificationFeedStore((s) => s.refreshing);
  const loadingMore = useNotificationFeedStore((s) => s.loadingMore);
  const hasMore = useNotificationFeedStore((s) => s.hasMore);
  const error = useNotificationFeedStore((s) => s.error);
  const loadFirstPage = useNotificationFeedStore((s) => s.loadFirstPage);
  const loadMore = useNotificationFeedStore((s) => s.loadMore);
  const refreshUnread = useNotificationFeedStore((s) => s.refreshUnread);
  const markRead = useNotificationFeedStore((s) => s.markRead);
  const markAllRead = useNotificationFeedStore((s) => s.markAllRead);

  /**
   * Narrow to what the ACTING identity may see.
   *
   * The server filtered for the authenticated account. On a shared terminal
   * that account is the branch owner, while the person actually holding the
   * device is a staff member the backend has no concept of — so without this
   * pass a cashier would read the owner's inbox.
   */
  const visible = useMemo(
    () => items.filter((n) => canSeeBackendPermission(perms, n.requiredPermission)),
    [items, perms]
  );

  // Banded into TODAY / YESTERDAY / EARLIER, matching the customer inbox.
  const rows = useMemo(() => withGroupHeaders(visible), [visible]);

  const unreadVisible = useMemo(
    () => visible.filter((n) => !n.isRead).length,
    [visible]
  );

  useEffect(() => {
    void loadFirstPage();
    void refreshUnread();
  }, [loadFirstPage, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      const t = setInterval(() => {
        void loadFirstPage({ refresh: true });
        void refreshUnread();
      }, POLL_MS);
      return () => clearInterval(t);
    }, [loadFirstPage, refreshUnread])
  );

  const onPressRow = useCallback(
    (item: NotificationItem) => {
      void markRead(item.id);
      // The server's deepLink is deliberately ignored — see
      // resolveNotificationTap. It used to win when present, and the value the
      // backend sends for a device registration ('/settings/devices') is not a
      // route this app has, so every one of those rows dead-ended.
      router.push(
        resolveNotificationTap({ type: item.type, ...item.data }, role) as never
      );
    },
    [markRead, role, router]
  );

  return (
    // edges={["top"]} — TopBar draws no inset of its own, so without this the
    // title sits at the same height as the status-bar clock.
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <TopBar
        title="Notifications"
        // Always says something, as the customer inbox does — "You're all
        // caught up" in the header is the answer to the question the bell
        // just raised.
        subtitle={
          unreadVisible > 0 ? `${unreadVisible} unread` : "You're all caught up"
        }
        onBack={() => router.back()}
        right={
          unreadVisible > 0 ? (
            <TouchableOpacity
              onPress={() => void markAllRead()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.markAll, { color: accentColor }]}>
                Mark all as read
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading && visible.length === 0 ? (
        <View style={styles.centre}>
          <ActivityIndicator color={accentColor} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item: row }) =>
            row.kind === "header" ? (
              <Text style={styles.groupHeader}>{row.label}</Text>
            ) : (
              <NotificationRow item={row.item} onPress={onPressRow} />
            )
          }
          // Only BETWEEN two message rows. A rule above a band heading reads as
          // part of the heading rather than as a divider between messages.
          ItemSeparatorComponent={({ leadingItem }) =>
            leadingItem?.kind === "item" ? <View style={styles.sep} /> : null
          }
          contentContainerStyle={
            rows.length === 0
              ? styles.emptyWrap
              : { paddingBottom: insets.bottom + SP._16 }
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void loadFirstPage({ refresh: true });
                void refreshUnread();
              }}
              tintColor={accentColor}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => void loadMore()}
          ListFooterComponent={
            loadingMore && hasMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={error ? "Couldn't load notifications" : "You're all caught up"}
              description={
                error
                  ? "Pull down to try again."
                  : // Named in the order they actually arrive for a provider.
                    // This used to promise "account alerts", which nothing
                    // sends, and listed order updates before they existed.
                    "New bookings, order updates, verification decisions and device requests will appear here."
              }
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // The same page ground as the rest of each stack, so the inbox reads as part
  // of the app rather than a stark white sheet nothing else uses. Rows paint
  // their own white/tinted background on top.
  screen: { flex: 1, backgroundColor: C.gray50 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Inset to the text column so the rule separates messages rather than
  // cutting across the icon rail.
  sep: { height: 1, backgroundColor: C.gray100, marginLeft: ICON_RAIL },
  groupHeader: {
    paddingHorizontal: SP._16,
    paddingTop: SP._16,
    paddingBottom: SP._8,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    color: C.gray500,
  },
  markAll: { fontSize: 13, fontWeight: "700" },
  emptyWrap: { flexGrow: 1 },
  footer: { paddingVertical: SP._16 },
});
