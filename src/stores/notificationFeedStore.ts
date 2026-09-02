// src/stores/notificationFeedStore.ts
// The server-backed notification INBOX behind the bell icon.
//
// Not to be confused with `notificationStore.ts`, which is the in-app toast
// queue (transient, local, never persisted). The names are close because the
// concepts are: a toast is what you show someone who is looking, this is what
// you keep for someone who was not.

import { create } from "zustand";
import {
  gqlMarkAllNotificationsRead,
  gqlMarkNotificationRead,
  gqlMyNotifications,
  gqlMyUnreadNotificationCount,
  type NotificationItem,
} from "../services/graphql/notifications";

/** Matches the BE cap (UNREAD_COUNT_CAP) — render this as "99+". */
export const UNREAD_CAP = 99;

/**
 * Badge refresh cadence. Slower than the 15s online-orders poll on purpose:
 * a notification is a nudge, not a live queue, and the count is one cheap
 * capped aggregation that does not need to keep pace with dispatch.
 */
export const NOTIFICATION_POLL_MS = 60_000;

const PAGE_SIZE = 20;

interface NotificationFeedState {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;

  loadFirstPage: (opts?: { refresh?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reset: () => void;
}

export const useNotificationFeedStore = create<NotificationFeedState>(
  (set, get) => ({
    items: [],
    unread: 0,
    loading: false,
    refreshing: false,
    loadingMore: false,
    hasMore: false,
    error: null,

    loadFirstPage: async (opts) => {
      const refresh = opts?.refresh ?? false;
      set(refresh ? { refreshing: true } : { loading: true });
      try {
        const page = await gqlMyNotifications(PAGE_SIZE, 0);
        set({
          items: page.data,
          hasMore: page.data.length < page.total,
          error: null,
        });
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Could not load notifications." });
      } finally {
        set({ loading: false, refreshing: false });
      }
    },

    loadMore: async () => {
      const { items, hasMore, loadingMore, loading } = get();
      if (!hasMore || loadingMore || loading) return;
      set({ loadingMore: true });
      try {
        const page = await gqlMyNotifications(PAGE_SIZE, items.length);
        // Offset paging over a feed that can gain rows mid-scroll will
        // occasionally re-serve one. De-duplicate rather than render it twice.
        const seen = new Set(items.map((i) => i.id));
        const fresh = page.data.filter((i) => !seen.has(i.id));
        const merged = [...items, ...fresh];
        set({ items: merged, hasMore: merged.length < page.total });
      } catch {
        // Keep what we have; the user can pull to refresh.
      } finally {
        set({ loadingMore: false });
      }
    },

    refreshUnread: async () => {
      try {
        set({ unread: await gqlMyUnreadNotificationCount() });
      } catch {
        // Badge is decoration — a failed poll must never surface an error.
      }
    },

    markRead: async (id) => {
      const before = get().items;
      const row = before.find((i) => i.id === id);
      if (!row || row.isRead) return;

      // Optimistic: the row is already open in front of them.
      set({
        items: before.map((i) => (i.id === id ? { ...i, isRead: true } : i)),
        unread: Math.max(0, get().unread - 1),
      });
      try {
        await gqlMarkNotificationRead(id);
      } catch {
        set({ items: before });
        void get().refreshUnread();
      }
    },

    markAllRead: async () => {
      const before = get().items;
      const beforeUnread = get().unread;
      set({ items: before.map((i) => ({ ...i, isRead: true })), unread: 0 });
      try {
        await gqlMarkAllNotificationsRead();
      } catch {
        set({ items: before, unread: beforeUnread });
      }
    },

    reset: () =>
      set({
        items: [],
        unread: 0,
        loading: false,
        refreshing: false,
        loadingMore: false,
        hasMore: false,
        error: null,
      }),
  })
);
