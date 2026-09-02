// src/hooks/usePoll.ts
// One polling primitive for every screen that refreshes on a timer.
//
// Plain `useEffect` + `setInterval` was leaking requests three ways:
//   • Screens stay MOUNTED after you navigate away (Expo Router keeps the tab /
//     stack entry alive), so their intervals kept firing forever in the
//     background — the "API keeps calling even when it isn't needed" symptom.
//   • Nothing paused when the app was backgrounded; RN timers keep running.
//   • A tick fired even if the previous request hadn't come back yet, so once
//     the server got slower than the interval, requests stacked and latency
//     ramped until the poller was effectively DoSing the backend.
//
// usePoll fixes all three: it runs only while the screen is focused AND the app
// is foregrounded, and it never has more than one request in flight.

import { useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useFocusEffect } from "expo-router";

export function usePoll(
  fn: () => Promise<unknown> | unknown,
  intervalMs: number,
  enabled = true,
) {
  // Latest callback without restarting the timer when it changes identity.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);
  const focused  = useRef(false);

  const tick = useCallback(async () => {
    if (inFlight.current) return; // never stack requests
    inFlight.current = true;
    try {
      await fnRef.current();
    } catch {
      // MOBILE-016 — contain the failure here.
      //
      // Both call sites below invoke this as `void tick()`, which does NOT
      // catch. Without this block a rejected poll escaped as an unhandled
      // rejection: RN red-boxes it in dev, and some configurations treat it as
      // fatal. The loop itself always survived — `inFlight` is cleared in the
      // `finally` either way — but a screen polling a flaky endpoint produced
      // one red box per tick.
      //
      // Swallowing is correct at THIS layer specifically: a failed poll is not
      // a reason to stop polling, and callers that care about the error handle
      // it inside `fn` (see the order/chat pollers, which already do).
    } finally { inFlight.current = false; }
  }, []);

  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }, []);

  const start = useCallback(() => {
    stop();
    void tick(); // refresh immediately on focus/foreground
    timer.current = setInterval(() => { void tick(); }, intervalMs);
  }, [intervalMs, stop, tick]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (enabled && AppState.currentState === "active") start();

      const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
        if (!focused.current || !enabled) return;
        if (next === "active") start();
        else stop();
      });

      return () => {
        focused.current = false;
        sub.remove();
        stop();
      };
    }, [enabled, start, stop]),
  );
}
