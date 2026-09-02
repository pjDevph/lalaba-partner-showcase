// src/components/IdleLogoutGuard.tsx
// Self-contained idle / inactivity sign-out guard.
//
// Signs the user out after a period of inactivity, warning them with a
// countdown modal first. Handles both cases:
//   - App in the foreground but untouched  → in-app idle timer
//   - App sent to the background            → elapsed-time check on resume
//
// Mount ONCE, near the root of the tree, wrapping the app's screens:
//
//   <IdleLogoutGuard>
//     <Stack ... />
//   </IdleLogoutGuard>
//
// Every touch that reaches the wrapped subtree resets the idle timer without
// consuming the event, so normal interaction keeps the session alive. It reads
// the session straight from authStore, so it needs no props to work — it only
// arms itself while a user is signed in and fully tears down on sign-out.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useAuthStore } from "../stores/authStore";
import { C } from "../theme/tokens";

// ─── Timing (configurable via .env so QA can shorten without touching code) ────
//   EXPO_PUBLIC_SESSION_TIMEOUT_MIN=15   (total idle time, minutes)
//   EXPO_PUBLIC_SESSION_WARNING_SEC=60   (countdown shown before sign-out, seconds)
const DEFAULT_TIMEOUT_MS =
  Number(process.env.EXPO_PUBLIC_SESSION_TIMEOUT_MIN ?? 15) * 60 * 1_000;
const DEFAULT_WARNING_MS =
  Number(process.env.EXPO_PUBLIC_SESSION_WARNING_SEC ?? 60) * 1_000;

type Props = Readonly<{
  children: React.ReactNode;
  /** Total idle time before sign-out, in ms. Defaults to the env value (15 min). */
  timeoutMs?: number;
  /** How long the warning countdown is shown before sign-out, in ms. Defaults to env (60s). */
  warningMs?: number;
}>;

export function IdleLogoutGuard({
  children,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  warningMs = DEFAULT_WARNING_MS,
}: Props) {
  const user = useAuthStore((s) => s.user);

  const [countdown, setCountdown] = useState<number | null>(null);

  const idleTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundedAt    = useRef<number | null>(null);
  // Latest resetIdleTimer, so the touch-capture callback never closes over a stale one.
  const resetIdleTimerRef = useRef<() => void>(() => {});

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Ticks the countdown down to 0. Deliberately does NOT call signOut() here —
  // this runs inside a setState updater, and triggering another store's setState
  // as a side effect of that updater fires while React is still rendering, which
  // throws "Cannot update a component while rendering a different component". The
  // actual sign-out happens in the effect below, once 0 has committed.
  const startCountdown = useCallback((startSec: number) => {
    setCountdown(startSec);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearCountdown();
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);
  }, [clearCountdown]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    // Any activity while the warning is up dismisses it.
    if (countdownRef.current) {
      clearCountdown();
      setCountdown(null);
    }
    if (!useAuthStore.getState().user) return;
    idleTimerRef.current = setTimeout(() => {
      if (!useAuthStore.getState().user || countdownRef.current) return;
      startCountdown(Math.ceil(warningMs / 1_000));
    }, timeoutMs - warningMs);
  }, [clearCountdown, startCountdown, timeoutMs, warningMs]);

  useEffect(() => {
    resetIdleTimerRef.current = resetIdleTimer;
  }, [resetIdleTimer]);

  // Fires the actual sign-out once the countdown commits to 0 — safely inside an
  // effect, after render, instead of inside the setState updater above.
  useEffect(() => {
    if (countdown !== 0) return;
    setCountdown(null);
    const { user: u, signOut } = useAuthStore.getState();
    if (u) void signOut();
  }, [countdown]);

  // Background/foreground tracking: record when we go inactive (only while
  // signed in), then decide on resume whether to sign out or resume the warning.
  useEffect(() => {
    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === "background" || next === "inactive") {
        if (useAuthStore.getState().user) backgroundedAt.current = Date.now();
      } else if (next === "active") {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since === null) return;
        const elapsed = Date.now() - since;
        if (elapsed >= timeoutMs) {
          const { user: u, signOut } = useAuthStore.getState();
          if (u) void signOut();
        } else if (elapsed >= timeoutMs - warningMs) {
          if (!useAuthStore.getState().user) return;
          startCountdown(Math.ceil((timeoutMs - elapsed) / 1_000));
        }
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      clearCountdown();
    };
  }, [clearCountdown, startCountdown, timeoutMs, warningMs]);

  // Arm on sign-in, fully tear down on sign-out so no stale timer can fire — or
  // show the warning modal — while there's no session to time out.
  useEffect(() => {
    if (user) {
      resetIdleTimerRef.current();
    } else {
      if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
      clearCountdown();
      setCountdown(null);
      backgroundedAt.current = null;
    }
    // MOBILE-011: clearCountdown() as well as the idle timeout. Without it,
    // unmounting while the logout warning is counting down leaves that
    // 1-second interval running forever, calling setCountdown on a tree that
    // is gone. The sign-out branch above already tears down both — the unmount
    // path was the one that only cleared half.
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      clearCountdown();
    };
  // Keyed on uid, not the user object identity — re-arm only on sign-in/out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, clearCountdown]);

  const staySignedIn = useCallback(() => {
    clearCountdown();
    setCountdown(null);
    resetIdleTimerRef.current(); // fresh full timeout after the user dismisses
  }, [clearCountdown]);

  const signOutNow = useCallback(() => {
    clearCountdown();
    setCountdown(null);
    const { user: u, signOut } = useAuthStore.getState();
    if (u) void signOut();
  }, [clearCountdown]);

  return (
    <View
      style={styles.root}
      // Reset the idle timer on every touch, without consuming the event.
      onStartShouldSetResponderCapture={() => {
        // While the warning countdown is up, this capture also fires for touches
        // on the modal's own buttons — and resetIdleTimer() clears the countdown
        // (setCountdown(null)), which dismisses the warning mid-press and
        // preempts the button's onPress. That's why "Sign Out Now" silently did
        // nothing. The overlay is blocking, so there are no background touches to
        // reset on anyway; let the modal's buttons drive the choice.
        if (countdownRef.current) return false;
        resetIdleTimerRef.current();
        return false;
      }}
    >
      {children}

      <Modal
        supportedOrientations={["portrait", "landscape"]}
        visible={!!countdown && !!user}
        transparent
        // Android's transparent+fade Modal briefly flashes an opaque black
        // window before the JS content paints — "none" skips that flash.
        animationType={Platform.OS === "android" ? "none" : "fade"}
        statusBarTranslucent
        onRequestClose={staySignedIn}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.title}>Still there?</Text>
            <Text style={styles.body}>You'll be signed out due to inactivity in</Text>
            <Text style={styles.timer}>{countdown}s</Text>
            <Pressable style={styles.stayBtn} onPress={staySignedIn}>
              <Text style={styles.stayBtnText}>Stay Signed In</Text>
            </Pressable>
            <Pressable onPress={signOutNow} hitSlop={8}>
              <Text style={styles.signOutText}>Sign Out Now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modal: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title:  { fontSize: 18, fontWeight: "700", color: C.gray900 },
  body:   { fontSize: 14, color: C.gray500, textAlign: "center", marginTop: 2 },
  timer:  { fontSize: 52, fontWeight: "800", color: C.error500, marginVertical: 8 },
  stayBtn: {
    backgroundColor: C.brand500,
    borderRadius: 10,
    paddingVertical: 13,
    width: "100%",
    alignItems: "center",
    marginTop: 8,
  },
  stayBtnText: { color: C.white, fontWeight: "700", fontSize: 15 },
  signOutText: { fontSize: 13, color: C.gray400, marginTop: 10, paddingVertical: 4 },
});
