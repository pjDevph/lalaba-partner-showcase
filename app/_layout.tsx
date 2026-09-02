// app/_layout.tsx
// Root layout — bootstraps auth, manages global toasts, guards routes.
//
// Routing logic:
//   - Auth not yet resolved   → SplashScreen (branded loading)
//   - Not logged in           → /login
//   - Role = WASHER           → /(washer)/dashboard  (skip branch logic entirely)
//   - Merchant, has branches  → /(tabs)/dashboard
//   - Merchant, no branches   → /onboarding (first-time setup)

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Image,
  LogBox,
  Modal,
  useWindowDimensions,
} from "react-native";

import { Stack, router, useRootNavigationState } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView, Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { useAuthBootstrap } from "../src/hooks/useAuth";
import { useAuthStore } from "../src/stores/authStore";
import { useMerchantStore } from "../src/stores/merchantStore";
import { useMaintenanceStore } from "../src/stores/maintenanceStore";
import { useNotificationStore } from "../src/stores/notificationStore";
import { CampaignPopup } from "../src/components/CampaignPopup";
import { GlobalDialog } from "../src/components/GlobalDialog";
import { IdleLogoutGuard } from "../src/components/IdleLogoutGuard";
import { useOfflineQueueStore } from "../src/stores/offlineQueueStore";
import { gqlMyDevice } from "../src/services/graphql/devices";
import { setupForegroundHandler, registerPushToken, setupNotificationOpenHandler } from "../src/services/push";
import { resolveNotificationTap } from "../src/services/notificationRouting";
import { useNotificationFeedStore } from "../src/stores/notificationFeedStore";
import { pingBackendUntilReady, setDeviceRevokedHandler, setMaintenanceModeHandler } from "../src/config/graphql";
import { C } from "../src/theme/tokens";
// @ts-ignore: Side-effect CSS import is handled by the bundler.
import "../src/styles/global.css";

LogBox.ignoreLogs([
  "This method is deprecated (as well as all React Native Firebase namespaced API)",
]);
 

// ─── Font Scale Context ───────────────────────────────────────────────────────
// Provides the active font multiplier to any component that opts in.
// Usage: const scale = useFontScale();  →  fontSize: 14 * scale
export const FontScaleContext = createContext<number>(1.0);
export const useFontScale = () => useContext(FontScaleContext);

const LOGO_SPLASH = require("../assets/lalaba_splash.png");

// ─── Connecting messages (Render free-tier cold start can take ~30-60s) ────────
const CONNECT_MESSAGES = [
  "Connecting to server...",
  "Server is starting up...",
  "This may take up to 30 seconds...",
  "Hang tight, almost there...",
  "Still warming up the server...",
  "Thank you for your patience...",
];

const BRANCH_ACCESS_LOST_MSG =
  "Your branch access has been removed. Please contact your manager.";

// ─── Splash / Auth Loading Screen ─────────────────────────────────────────────
// Shown while the Firebase Auth listener is resolving on cold start.
// Also shown during the sign-in → route transition so there's no jarring jump.
// `connecting` = backend hasn't responded yet; shows rotating status messages.

function AuthSplash({ connecting }: Readonly<{ connecting: boolean }>) {
  const fade    = useRef(new Animated.Value(0)).current;
  const msgFade = useRef(new Animated.Value(0)).current;
  const [msgIdx, setMsgIdx] = React.useState(0);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cycle through messages while connecting, fading each in/out.
  useEffect(() => {
    if (!connecting) { msgFade.setValue(0); return; }
    Animated.timing(msgFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    const id = setInterval(() => {
      Animated.sequence([
        Animated.timing(msgFade, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.delay(100),
        Animated.timing(msgFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setMsgIdx((i) => (i + 1) % CONNECT_MESSAGES.length);
    }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting]);

  return (
    <Animated.View style={[splash.root, { opacity: fade }]}>
      <StatusBar style="light" />
      <Image source={LOGO_SPLASH} style={splash.logo} resizeMode="contain" />
      <ActivityIndicator
        style={splash.spinner}
        size="small"
        color="rgba(255,255,255,0.7)"
      />
      {connecting && (
        <Animated.Text style={[splash.connectMsg, { opacity: msgFade }]}>
          {CONNECT_MESSAGES[msgIdx]}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

const splash = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  logo: {
    width: 160,
    height: 160,
    tintColor: C.white,
  },
  spinner: {
    marginTop: 24,
  },
  connectMsg: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});

// ─── Root Layout ──────────────────────────────────────────────────────────────

export default function RootLayout() {
  useAuthBootstrap();

  // Show "Connecting to server..." messages when the backend is slow to respond
  // (e.g. Render free-tier cold start takes 30-60s). Messages appear after 2.5s
  // so fast/warm starts don't flash them at all.
  const [connecting, setConnecting] = React.useState(false);

  useEffect(() => {
    let cancelled = false;
    // Start showing messages after 2.5s if backend hasn't responded yet.
    const showTimer = setTimeout(() => { if (!cancelled) setConnecting(true); }, 2500);
    pingBackendUntilReady().finally(() => {
      clearTimeout(showTimer);
      if (!cancelled) setConnecting(false);
    });
    return () => { cancelled = true; clearTimeout(showTimer); };
   
  }, []);

  // Flush queued offline orders whenever we go online.
  useEffect(() => {
    const { flush, pending } = useOfflineQueueStore.getState();
    // Attempt on mount in case we were online all along.
    if (pending.length > 0) void flush();

    const unsub = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected && state.isInternetReachable !== false;
      if (isConnected && useOfflineQueueStore.getState().pending.length > 0) {
        void useOfflineQueueStore.getState().flush();
      }
    });
    return unsub;
   
  }, []);

  // Idle / inactivity sign-out is handled by <IdleLogoutGuard> in the render
  // tree below — it owns the idle timer, background-resume check, warning
  // countdown, and the "Still there?" modal.

  const user                  = useAuthStore((s) => s.user);
  const hasResolved           = useAuthStore((s) => s.hasResolved);
  const isNewGoogleUser       = useAuthStore((s) => s.isNewGoogleUser);
  const businessSetupDeferred = useAuthStore((s) => s.businessSetupDeferred);
  const postRegistrationFlow  = useAuthStore((s) => s.postRegistrationFlow);
  const loadMerchant    = useMerchantStore((s) => s.loadMerchant);
  const notifications = useNotificationStore((s) => s.notifications);

  // Portrait: full-width band like a normal mobile toast. Landscape: capped
  // width, right-aligned — a full-width band would run under the tablet
  // sidebar (e.g. Settings' left nav), which only shows up in landscape.
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;

  // Wait for Zustand persist to rehydrate branches from AsyncStorage before
  // making any routing decision — otherwise get().branches is [] on cold start.
  const [merchantHydrated, setMerchantHydrated] = useState(
    () => useMerchantStore.persist.hasHydrated()
  );
  useEffect(() => {
    if (merchantHydrated) return;
    return useMerchantStore.persist.onFinishHydration(() => setMerchantHydrated(true));
  }, [merchantHydrated]);

  // Push notifications: install the foreground toast handler once, and (re)register
  // this device's FCM token with the backend whenever we have an authenticated user
  // (covers both fresh logins and restored sessions). Best-effort — the service
  // swallows failures (missing permission, Expo Go, no APNs) so nothing here blocks.
  useEffect(() => {
    setupForegroundHandler();
    // Tapping a "device pending approval" push → open Settings at that branch.
    setupNotificationOpenHandler((data) => {
      const role = useAuthStore.getState().user?.role;

      // Parking the intent and choosing the route both live in
      // resolveNotificationTap, so a tapped push and a tapped inbox row cannot
      // disagree. They previously did: this path parked the intent and the
      // inbox path did not.
      router.replace(
        resolveNotificationTap(
          {
            type: typeof data.type === "string" ? data.type : null,
            orderId: data.orderId != null ? String(data.orderId) : null,
            // Carries the courier's leg — task-detail will not render without
            // it, so a push that dropped it landed on "Task not found".
            status: data.status != null ? String(data.status) : null,
            branchId: data.branchId != null ? String(data.branchId) : null,
            providerId: data.providerId != null ? String(data.providerId) : null,
          },
          role
        ) as never
      );

      // A tap means they have seen it; the badge should not linger.
      void useNotificationFeedStore.getState().refreshUnread();
    });
  }, []);

  // Auto-logout when the owner blocks/removes this device (reqs #9/#10): the
  // next backend call fails the device auth gate → sign the staff out.
  //
  // Gate on deviceBranchId — it's only set once a device is APPROVED. During the
  // pre-approval bootstrap of a NEW device, many queries fail the device gate;
  // those must NOT sign the staff out (the staff gate routes them to
  // /device-pending instead). Only an established, approved session auto-logs out.
  useEffect(() => {
    setDeviceRevokedHandler((msg) => {
      if (useAuthStore.getState().deviceBranchId) {
        void useAuthStore.getState().signOut(msg || "This device is no longer authorized.");
      }
    });
  }, []);

  // Maintenance-mode: the client hook fires on the FIRST request any screen
  // makes that the backend rejects with MAINTENANCE_MODE — set the store,
  // the routing effect below redirects.
  useEffect(() => {
    setMaintenanceModeHandler((info) => useMaintenanceStore.getState().setActive(info));
    return () => setMaintenanceModeHandler(null);
  }, []);
  const maintenanceActive = useMaintenanceStore((s) => s.active);
  const bootstrapChecked = useMaintenanceStore((s) => s.bootstrapChecked);

  // GAP-MNT-001 — the cold-start check, once, before anything routes. Until
  // this existed the block was only ever discovered by an authenticated
  // request failing, so a signed-out partner met a normal sign-in screen,
  // spent an OTP, and only then learned she could not trade. Never rejects,
  // and a failure leaves the app OPEN — see checkPublic.
  useEffect(() => {
    void useMaintenanceStore.getState().checkPublic();
  }, []);
  // Set the moment maintenance redirects us away; consumed once we're routing
  // again with maintenance off, to force a full re-route even though
  // routedFor already matched this user (it was set before maintenance ever
  // started, so the ref-equality short-circuit below would otherwise leave
  // the user stranded on /maintenance with nothing navigating them out).
  const wasBlockedByMaintenance = useRef(false);
  useEffect(() => {
    if (hasResolved && user?.uid) registerPushToken(user.role);
  }, [hasResolved, user?.uid, user?.role]);

  // Wait for the Expo Router navigation container to be ready before navigating.
  // router.replace() called before this key exists is silently dropped, causing
  // the user to stay on the login screen even though auth succeeded.
  const rootNavKey = useRootNavigationState()?.key;

  // ── Staff device/branch revocation watch ────────────────────────────────────
  // The BE rejects every guarded request the moment the owner blocks/removes
  // this device OR removes the staff member's branch assignment, but a session
  // idling on cached data would never notice. Two triggers force an auto
  // SIGN-OUT (login screen shows the reason; a fresh sign-in re-resolves
  // whatever changed — new device request, or a still-valid branch):
  //   1. the graphql client's revocation trap — fires on the next failed call;
  //   2. (removed) a 60s poll for a fully idle screen. It queried
  //      `myDeviceStatus`, which no longer exists on the backend — every tick
  //      failed validation and was swallowed by the catch below, so it never
  //      covered anything. Reinstating it means porting to `myDevice`.
  // Neither fires while app/device-pending.tsx is mounted (isDeviceRequestFlowActive):
  // a fresh sign-in legitimately waits there on an unapproved (pending) device,
  // and its own 5s poll handles deny/block. That flag is owned by the screen's
  // own mount lifecycle rather than router pathname — usePathname() only
  // updates on the render AFTER router.replace(), so an ambient background
  // fetch (analytics/products/services stores, which fetch regardless of
  // route) that fails in that window could slip past a pathname check and
  // sign the user out before their request ever reaches the owner.
  // useEffect(() => {
  //   if ((user?.role as string)?.toUpperCase() !== "STAFF") {
  //     setDeviceRevokedHandler(null);
  //     return;
  //   }
  //   const revoke = (reason: SessionRevokedReason = "device") => {
  //     if (isDeviceRequestFlowActive()) return;
  //     const msg = reason === "branch-access" ? BRANCH_ACCESS_LOST_MSG : DEVICE_REVOKED_SIGNOUT_MSG;
  //     void useAuthStore.getState().signOut(msg);
  //   };
  //   setDeviceRevokedHandler(revoke);
  //   const id = setInterval(() => {
  //     void (async () => {
  //       try {
  //         const device = await gqlMyDevice();
  //         if (!device || !device.isActive) revoke();
  //         // Keep the device's bound branch fresh in case the owner
  //         // reassigned this device to a different branch mid-session.
  //         else useAuthStore.getState().setDeviceBranchId(device.branchId ?? null);
  //       } catch {
  //         // Connectivity/transient errors — the revocation trap already covers
  //         // definitive rejections; never sign out on an unverifiable poll.
  //       }
  //     })();
  //   }, 60_000);
  //   return () => { setDeviceRevokedHandler(null); clearInterval(id); };
  // }, [user]);

  // Track which auth state we've already routed for to prevent double-fires.
  const routedFor = useRef<string | null>(null);

  useEffect(() => {
    // Wait until auth has resolved. merchantHydrated is checked only in the
    // slow path below — the fast path uses branchMemberships from authStore
    // which rehydrates independently and is ready before merchantStore.
    if (!hasResolved) return;
    // Navigator not yet mounted — don't set routedFor so we re-try when it's ready.
    if (!rootNavKey) return;

    // Hold routing until the cold-start check has answered, so no sign-in UI
    // becomes actionable before we know whether signing in is pointless.
    // Bounded: checkPublic always resolves, timeout and failure included.
    if (!bootstrapChecked) return;

    // Maintenance takes priority over every other routing decision below —
    // checked first, and deliberately does NOT set routedFor, so the moment
    // it clears this effect (which depends on maintenanceActive) falls
    // through to the block right below that forces a full re-route.
    if (maintenanceActive) {
      wasBlockedByMaintenance.current = true;
      router.replace("/maintenance");
      return;
    }
    if (wasBlockedByMaintenance.current) {
      wasBlockedByMaintenance.current = false;
      routedFor.current = null;
    }

    // isNewGoogleUser is set by signInWithGoogle after Firebase auth succeeds
    // but before a backend profile exists. user is still null at this point,
    // so this must run before the routedFor guard (which keys on user.uid).
    if (isNewGoogleUser) {
      useAuthStore.setState({ isNewGoogleUser: false });
      router.replace("/complete-profile");
      return;
    }

    const key = user === null ? "null" : user.uid;
    if (routedFor.current === key) return;

    // ── Not logged in ────────────────────────────────────────────────────────
    if (user === null) {
      routedFor.current = key;
      router.replace("/login");
      return;
    }

    // ── Post-registration: register.tsx / onboarding own navigation — don't
    //    compete. Do NOT burn routedFor here so when postRegistrationFlow clears
    //    (e.g. after onboarding) the effect can re-evaluate and route correctly.
    if (postRegistrationFlow) return;

    routedFor.current = key;

    // ── Washer ───────────────────────────────────────────────────────────────
    if ((user.role as string)?.toUpperCase() === "WASHER") {
      router.replace("/(washer)/dashboard");
      return;
    }

    // ── Courier (delivery staff) ───────────────────────────────────────────────
    // Couriers sign in with their own role and go straight to their task queue —
    // no branch selection (they serve pickups/returns across a provider's branches).
    //
    // …unless they have no live liveness selfie, in which case they land on
    // /courier-selfie and cannot leave until they take one. This mirrors the
    // STAFF /device-pending gate below, including the two properties that make
    // that one work: it FAILS CLOSED (an unknown status routes to the gate,
    // never past it), and the gate screen owns its own exit navigation, since
    // `routedFor` was already burned above and this effect will not re-run.
    //
    // Read from the session rather than re-queried: `me` returns selfieStatus,
    // so the gate costs nothing here. The server enforces it independently on
    // every request — this is the UX half, not the security half.
    if ((user.role as string)?.toUpperCase() === "COURIER") {
      if (user.selfieStatus !== "ACTIVE") {
        router.replace("/courier-selfie");
        return;
      }
      router.replace("/(courier)/dashboard");
      return;
    }

    // ── Staff (employee) ─────────────────────────────────────────────────────
    if ((user.role as string)?.toUpperCase() === "STAFF") {

      // Staff may only reach the app on a device the OWNER has APPROVED. An
      // unregistered/pending/blocked device is routed to /device-pending where
      // the staff can register (→ pending) or wait for approval. On an approved
      // device the session is LOCKED to that device's branch (reqs #2/#3), then:
      // then routed into (staff).
      //
      // There is no manager/cashier fork here any more. It was unreachable:
      // branchMemberships for a non-merchant is built with role "staff"
      // hardcoded, so activeBranchRole could never be MANAGER and the branch
      // that sent a "manager" into the OWNER's (tabs) stack never ran. What a
      // staff member can do is decided by their per-branch permissions, not by
      // a job title.
      (async () => {
        let device;
        try {
          device = await gqlMyDevice();
        } catch {
          // Lookup failed (offline / backend). Fail closed → device-pending
          // (staff can retry or sign out there).
          router.replace("/device-pending");
          return;
        }

        if (!device || device.status !== "APPROVED") {
          router.replace("/device-pending");
          return;
        }

        // Approved → lock to the device's branch, then route by role.
        if (device.branchId) {
          useAuthStore.getState().setDeviceBranch(device.branchId);
          useAuthStore.getState().setActiveBranch(device.branchId);
        }
        const { activeBranchId, branchMemberships } = useAuthStore.getState();
        if (branchMemberships.length === 0) {
          // Owner removed every branch assignment (or none was ever set) —
          // there's nothing to work from. Without this check, `!activeBranchId
          // && branchMemberships.length > 1` is false here (0 is not > 1) and
          // falls through to the POS route below, letting a fully-unassigned
          // staff member into a screen scoped to no branch at all.
          void useAuthStore.getState().signOut(BRANCH_ACCESS_LOST_MSG);
        } else {
          // Assigned to several branches with nothing resolved → pick where
          // they're working today before POS.
          if (!activeBranchId && branchMemberships.length > 1) {
            router.replace("/select-branch");
          } else {
            router.replace("/(staff)/pos");
          }
        }
      })();
      return;
    }

    // ── Merchant ─────────────────────────────────────────────────────────────
    const merchantId = user.merchantId ?? user.uid;

    // User explicitly deferred business setup — go straight to dashboard.
    if (businessSetupDeferred) {
      router.replace("/(tabs)/dashboard");
      return;
    }

    // Fast path: use branches from authStore (populated by signIn/onAuthStateChanged)
    // OR from merchantStore's AsyncStorage cache. authStore.branchMemberships is set
    // by sessionToState() inside signIn() before merchantStore is reset, so we must
    // check it first — otherwise the user sits on the login page for ~150ms while
    // loadMerchant fetches data that signIn() already fetched.
    const { branchMemberships } = useAuthStore.getState();
    const { branches: cached } = useMerchantStore.getState();
    if (branchMemberships.length > 0 || cached.length > 0) {
      router.replace("/(tabs)/dashboard");
      loadMerchant(merchantId).catch(() => {});
      return;
    }

    // Slow path: no cache — wait for merchantStore to rehydrate first so we
    // don't misread branches as [] and send a returning merchant to /onboarding.
    if (!merchantHydrated) {
      // Reset routedFor so the effect retries when merchantHydrated fires.
      routedFor.current = null;
      return;
    }

    // Fetch then decide.
    // Re-read businessSetupDeferred at callback time to avoid racing with the
    // post-signup prompt (user may have tapped "Later" while this was in-flight).
    loadMerchant(merchantId)
      .then(() => {
        if (useAuthStore.getState().businessSetupDeferred) {
          router.replace("/(tabs)/dashboard");
          return;
        }
        const { branches } = useMerchantStore.getState();
        router.replace(branches.length === 0 ? "/onboarding" : "/(tabs)/dashboard");
      })
      .catch(() => {
        if (useAuthStore.getState().businessSetupDeferred) {
          router.replace("/(tabs)/dashboard");
          return;
        }
        const { branches: fallback } = useMerchantStore.getState();
        router.replace(fallback.length === 0 ? "/onboarding" : "/(tabs)/dashboard");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasResolved, merchantHydrated, isNewGoogleUser, businessSetupDeferred, postRegistrationFlow, rootNavKey, maintenanceActive, bootstrapChecked]);

  // Show the branded splash only while the initial auth check is in flight.
  // Do NOT gate on isLoading — that flag is also set during sign-in/out and
  // causes the entire screen tree to unmount/remount, triggering React's
  // maximum update depth error.
  if (!hasResolved) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AuthSplash connecting={connecting} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <FontScaleContext.Provider value={1}>
        {/* Idle-logout guard: resets the idle timer on every touch to the wrapped
            subtree and renders the "Still there?" warning + auto sign-out. */}
        <IdleLogoutGuard>
        <StatusBar style="dark" />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
          <Stack.Screen name="complete-profile" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(staff)" />
          <Stack.Screen name="device-pending" />
          <Stack.Screen name="maintenance" options={{ gestureEnabled: false }} />
          <Stack.Screen name="courier-selfie" />
          <Stack.Screen name="select-branch" />
          <Stack.Screen name="(washer)" />
          <Stack.Screen name="(courier)" />
          <Stack.Screen name="index" />
        </Stack>

        {/* Global toast notifications — rendered in their own Modal so they
            stack above any other open Modal. A plain View's zIndex can't do
            this: RN Modals render into a separate native window/layer that
            always sits above ordinary views, regardless of zIndex. */}
        <Modal
          supportedOrientations={["portrait", "landscape"]}
          visible={notifications.length > 0}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => {}}
        >
          {/* Modals render into their own native window, which the outer
              GestureHandlerRootView above doesn't extend into — without this
              nested one, the toast's swipe-to-dismiss gesture doesn't work. */}
          <GestureHandlerRootView style={{ flex: 1 }}>
            <View
              style={[styles.toastContainer, isLandscape && styles.toastContainerLandscape]}
              pointerEvents="box-none"
            >
              {notifications.map((n) => (
                <Toast key={n.id} notification={n} landscape={isLandscape} />
              ))}
            </View>
          </GestureHandlerRootView>
        </Modal>

        {/* Global alert/confirm dialog */}
        <GlobalDialog />

        {/* Promotional popup. Mounted at the root so it is shared by all four
            role stacks — the backend targets merchant and washer separately,
            and staff and couriers only see campaigns aimed at them. Renders
            nothing unless one is due. */}
        <CampaignPopup />
        </IdleLogoutGuard>
        </FontScaleContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

// Swiped further than this (px) or fast enough (px/ms) counts as a dismiss;
// anything less springs back to center.
const SWIPE_DISMISS_DISTANCE = 90;
const SWIPE_DISMISS_VELOCITY = 0.5;

function Toast({
  notification,
  landscape,
}: Readonly<{
  notification: { id: string; type: string; title: string; message?: string };
  landscape: boolean;
}>) {
  const { width } = useWindowDimensions();
  const dismiss = useNotificationStore((s) => s.dismiss);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMove = React.useCallback((dx: number) => {
    translateX.setValue(dx);
  }, [translateX]);

  const handleRelease = React.useCallback((dx: number, vx: number) => {
    const shouldDismiss = Math.abs(dx) > SWIPE_DISMISS_DISTANCE || Math.abs(vx) > SWIPE_DISMISS_VELOCITY;
    if (shouldDismiss) {
      const toValue = (dx < 0 ? -1 : 1) * width;
      Animated.timing(translateX, { toValue, duration: 180, useNativeDriver: true }).start(() => {
        dismiss(notification.id);
      });
    } else {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    }
  }, [translateX, width, dismiss, notification.id]);

  // Legacy PanResponder doesn't reliably deliver move events under the New
  // Architecture (onMoveShouldSetPanResponder silently never fires) — this
  // uses react-native-gesture-handler's modern Gesture API instead, which is
  // built to work correctly with Fabric. activeOffsetX/failOffsetY mirror the
  // old dx>6 / horizontal-over-vertical claim logic.
  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-6, 6])
        .failOffsetY([-20, 20])
        .onUpdate((e) => {
          runOnJS(handleMove)(e.translationX);
        })
        .onEnd((e) => {
          runOnJS(handleRelease)(e.translationX, e.velocityX);
        }),
    [handleMove, handleRelease]
  );

  let bgColor: string;
  if (notification.type === "success")      bgColor = C.success500;
  else if (notification.type === "error")   bgColor = C.error500;
  else if (notification.type === "warning") bgColor = C.warning500;
  else                                      bgColor = C.brand500;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.toast,
          landscape && styles.toastLandscape,
          { backgroundColor: bgColor, opacity, transform: [{ translateX }] },
        ]}
      >
        <Text style={styles.toastTitle}>{notification.title}</Text>
        {notification.message && (
          <Text style={styles.toastMessage}>{notification.message}</Text>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.brand500 },
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 9999,
  },
  // Landscape only: toasts hug their content and center horizontally instead
  // of stretching edge-to-edge — on tablet/landscape layouts (e.g. the
  // Settings sidebar, only shown in landscape) a full-width band would run
  // under the left nav. Portrait keeps the normal full-width mobile toast.
  toastContainerLandscape: {
    alignItems: "center",
  },
  toast: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  toastLandscape: {
    width: "100%",
    maxWidth: 420,
  },
  toastTitle:   { color: C.white, fontSize: 14, fontWeight: "700" },
  toastMessage: { color: C.white, fontSize: 12, marginTop: 2, opacity: 0.9 },
});
