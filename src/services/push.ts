// src/services/push.ts
// Firebase Cloud Messaging (push notifications) for this device.
//
// Flow:
//   • registerPushToken()      — ask permission, get the FCM token, save it to the
//                                backend, and remember it locally (for logout).
//   • setupForegroundHandler() — show incoming pushes as an in-app toast while the
//                                app is open. (Backgrounded/quit notifications are
//                                displayed automatically by the OS from the payload.)
//   • notifyStaffLogin()       — tell the backend to push the owner that a staff
//                                just signed in. No-op server-side for non-staff.
//   • unregisterPushToken()    — remove this device's token on sign-out.
//
// Requires a native dev build (react-native-firebase does NOT run in Expo Go) and,
// on Android, Google Play services. iOS also needs an APNs key configured in
// Firebase. Works in both local and online modes — pushes always go through real
// FCM (there is no FCM emulator), so the device needs internet either way.

import messaging from "@react-native-firebase/messaging";
import { useNotificationFeedStore } from "../stores/notificationFeedStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  gqlSaveFcmToken,
  gqlRemoveFcmToken,
  gqlNotifyStaffLogin,
} from "./graphql/notifications";
import { gqlClaimDevice } from "./graphql/devices";
import { useNotificationStore } from "../stores/notificationStore";
import { auth } from "../config/firebase";
// Type-only: authStore imports this module, so a value import would be a cycle.
import type { UserRole } from "../stores/authStore";

/**
 * Roles the backend accepts on `claimDevice` (@Roles('merchant','staff') in
 * devices.resolver.ts). Calling it as any other role is a guaranteed 403, so
 * the single-active-session claim is skipped rather than fired and swallowed.
 */
const CLAIM_DEVICE_ROLES: readonly UserRole[] = ["MERCHANT", "STAFF"];

const STORED_TOKEN_KEY = "fcm_token";

let _unsubForeground: (() => void) | null = null;
let _unsubTokenRefresh: (() => void) | null = null;

/** Ask permission, fetch the FCM token, and register it on the backend.
 *  Idempotent and best-effort — safe to call on every authenticated session. */
export async function registerPushToken(role: UserRole | null): Promise<void> {
  // Claim this device as the account's single active session BEFORE the push
  // permission check — the "one device at a time" rule must hold even when the
  // user denied notifications. No-op server-side for owners and for a device
  // that isn't approved yet. (A second claim below re-runs with the push token.)
  // Only for roles the mutation accepts: a WASHER/COURIER has no staff-device
  // session to claim, and calling anyway 403s on every single app launch.
  const canClaimDevice = !!role && CLAIM_DEVICE_ROLES.includes(role);
  if (canClaimDevice) await gqlClaimDevice().catch(() => {});
  try {
    const status = await messaging().requestPermission();
    const granted =
      status === messaging.AuthorizationStatus.AUTHORIZED ||
      status === messaging.AuthorizationStatus.PROVISIONAL;
    if (!granted) {
      if (__DEV__) console.log("[push] notification permission not granted");
      return;
    }

    if (Platform.OS === "ios") {
      await messaging().registerDeviceForRemoteMessages().catch(() => {});
    }

    const token = await messaging().getToken();
    if (!token) return;

    await gqlSaveFcmToken(token);
    // Re-claim with the push token so the backend links it to this device and
    // can prune it from the account if this device is later superseded.
    if (canClaimDevice) await gqlClaimDevice(token).catch(() => {});
    await AsyncStorage.setItem(STORED_TOKEN_KEY, token);
    if (__DEV__) console.log("[push] FCM token registered:", token.slice(0, 16) + "…");
  } catch (err) {
    console.warn("[push] registerPushToken failed:", err);
  }
}

/** Remove this device's token from the backend (call on sign-out). */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(STORED_TOKEN_KEY);
    if (token) await gqlRemoveFcmToken(token).catch(() => {});
    await AsyncStorage.removeItem(STORED_TOKEN_KEY);
  } catch (err) {
    console.warn("[push] unregisterPushToken failed:", err);
  }
}

/** Show foreground pushes as an in-app toast, and keep the backend token fresh.
 *  Call once when the app mounts; subsequent calls are no-ops. */
export function setupForegroundHandler(): void {
  if (!_unsubForeground) {
    _unsubForeground = messaging().onMessage(async (msg) => {
      const title = msg.notification?.title ?? "Notification";
      const body = msg.notification?.body ?? "";
      useNotificationStore.getState().push({ type: "success", title, message: body });
      // The same event has just been persisted to the feed server-side. Refresh
      // the badge now rather than letting it lag a whole poll interval behind a
      // toast the user is looking at.
      void useNotificationFeedStore.getState().refreshUnread();
    });
  }
  if (!_unsubTokenRefresh) {
    // FCM can rotate the token; re-register the new one so pushes keep arriving.
    _unsubTokenRefresh = messaging().onTokenRefresh(async (token) => {
      // Only persist the token when signed in — a refresh can fire on the login
      // screen (signed out), where saving would 401 ("Not signed in"). The token
      // is re-saved on the next login via registerPushToken().
      if (!auth.currentUser) return;
      try {
        await gqlSaveFcmToken(token);
        await AsyncStorage.setItem(STORED_TOKEN_KEY, token);
        if (__DEV__) console.log("[push] FCM token refreshed");
      } catch (err) {
        console.warn("[push] token refresh save failed:", err);
      }
    });
  }
}

/** Register handlers for when the user TAPS a push notification, both when the
 *  app is backgrounded (onNotificationOpenedApp) and when it was quit
 *  (getInitialNotification). Calls `onOpen` with the notification's data payload.
 *  Call once on mount. */
let _openHandlerSet = false;
export function setupNotificationOpenHandler(
  onOpen: (data: Record<string, string>) => void,
): void {
  if (_openHandlerSet) return;
  _openHandlerSet = true;
  try {
    messaging().onNotificationOpenedApp((rm) => {
      if (rm?.data) onOpen(rm.data as Record<string, string>);
    });
    messaging()
      .getInitialNotification()
      .then((rm) => { if (rm?.data) onOpen(rm.data as Record<string, string>); })
      .catch(() => {});
  } catch (err) {
    console.warn("[push] setupNotificationOpenHandler failed:", err);
  }
}

/** Ask the backend to notify the owner that a staff just signed in. */
export async function notifyStaffLogin(): Promise<void> {
  try {
    await gqlNotifyStaffLogin();
  } catch (err) {
    console.warn("[push] notifyStaffLogin failed:", err);
  }
}
