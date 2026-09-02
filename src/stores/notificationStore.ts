// src/stores/notificationStore.ts
// In-app TOAST / alert notifications — transient, local, never persisted.
//
// Not the notification inbox. The server-backed feed behind the header bell
// lives in `notificationFeedStore.ts`. A toast is what you show someone who is
// looking; the feed is what you keep for someone who was not.

import { create } from "zustand";

export type NotificationType = "success" | "error" | "info" | "warning";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface NotificationState {
  notifications: AppNotification[];

  // Actions
  push: (n: Omit<AppNotification, "id">) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

let _counter = 0;
function nextId(): string {
  _counter += 1;
  return `notif-${Date.now()}-${_counter}`;
}

const DEFAULT_DURATION = 3500;

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],

  push: (n) => {
    const id = nextId();
    const notification: AppNotification = {
      ...n,
      id,
      durationMs: n.durationMs ?? DEFAULT_DURATION,
    };

    set((state) => ({
      notifications: [...state.notifications, notification],
    }));

    // Auto-dismiss
    const duration = notification.durationMs ?? DEFAULT_DURATION;
    if (duration > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }

    return id;
  },

  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  dismissAll: () => set({ notifications: [] }),
}));

// Convenience helpers (usable outside of React)
export const notify = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().push({ type: "success", title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().push({ type: "error", title, message, durationMs: 5000 }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().push({ type: "info", title, message }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().push({ type: "warning", title, message }),
};
