import React from "react";
import { AppState, Text, type AppStateStatus } from "react-native";
import { render, act } from "@testing-library/react-native";

/**
 * MOBILE-016 — regression cover for the backported error containment in
 * usePoll's `tick`.
 *
 * The closure condition, stated as a sequence:
 *
 *   poll 1 -> rejects -> handled locally -> no unhandled rejection
 *                     -> in-flight flag clears
 *   poll 2 -> runs normally
 *
 * The focus/AppState/single-flight behaviour was already correct here; it is
 * asserted anyway so the backport is proven not to have disturbed it.
 */

let focusCallback: (() => undefined | (() => void)) | null = null;
let focusTeardown: (() => void) | undefined;

const focusScreen = () => {
  if (!focusCallback) throw new Error("useFocusEffect was never called");
  focusTeardown = focusCallback() ?? undefined;
};
const blurScreen = () => {
  focusTeardown?.();
  focusTeardown = undefined;
};

jest.mock("expo-router", () => ({
  useFocusEffect: (cb: () => undefined | (() => void)) => {
    focusCallback = cb;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { usePoll } = require("../usePoll") as typeof import("../usePoll");

type AppStateHandler = (state: AppStateStatus) => void;
let appStateHandlers: AppStateHandler[] = [];
let removeCalls = 0;

const setAppState = (state: AppStateStatus) => {
  (AppState as unknown as { currentState: AppStateStatus }).currentState = state;
  appStateHandlers.forEach((h) => h(state));
};

function Harness({
  fn,
  interval = 1000,
  enabled = true,
}: {
  fn: () => Promise<unknown> | unknown;
  interval?: number;
  enabled?: boolean;
}) {
  usePoll(fn, interval, enabled);
  return <Text>harness</Text>;
}

const mountFocused = (props: React.ComponentProps<typeof Harness>) => {
  const utils = render(<Harness {...props} />);
  act(() => focusScreen());
  return utils;
};

/** Drain pending microtasks without moving the clock. */
const settle = () =>
  act(async () => {
    await Promise.resolve();
  });

/**
 * Advance one interval at a time, draining microtasks between each.
 * `advanceTimersByTime(n * step)` fires every callback in one synchronous turn
 * with no drain, which real timers never do — and `tick` clears its in-flight
 * flag in a `finally` after an `await`, so undrained ticks are correctly
 * skipped and the counts stop meaning anything.
 */
const advance = async (ms: number, step: number) => {
  await settle();
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await act(async () => {
      jest.advanceTimersByTime(step);
      await Promise.resolve();
    });
  }
};

/** Fails the test if any promise rejection goes unhandled. */
let unhandled: unknown[] = [];
const recordUnhandled = (reason: unknown) => unhandled.push(reason);

beforeEach(() => {
  jest.useFakeTimers();
  focusCallback = null;
  focusTeardown = undefined;
  appStateHandlers = [];
  removeCalls = 0;
  unhandled = [];
  process.on("unhandledRejection", recordUnhandled);
  (AppState as unknown as { currentState: AppStateStatus }).currentState =
    "active";
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_evt, handler) => {
      appStateHandlers.push(handler as AppStateHandler);
      return {
        remove: () => {
          removeCalls += 1;
          appStateHandlers = appStateHandlers.filter((h) => h !== handler);
        },
      } as never;
    });
});

afterEach(() => {
  process.off("unhandledRejection", recordUnhandled);
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("MOBILE-016 — a rejected poll is contained", () => {
  it("HP: the closure sequence — reject, recover, keep polling", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue("ok");

    mountFocused({ fn, interval: 1000 });
    expect(fn).toHaveBeenCalledTimes(1); // poll 1, rejects

    await advance(2000, 1000); // poll 2 and 3 run normally

    expect(fn).toHaveBeenCalledTimes(3);
    expect(unhandled).toEqual([]);
  });

  it("EC: no unhandled rejection escapes, even when every poll fails", async () => {
    // This is what red-boxed before the backport: one per tick.
    const fn = jest.fn().mockRejectedValue(new Error("still down"));

    mountFocused({ fn, interval: 1000 });
    await advance(4000, 1000);

    expect(unhandled).toEqual([]);
  });

  it("EC: the in-flight flag clears after a rejection, so polling is not wedged", async () => {
    // If the flag were only cleared on success, one blip would silently stop
    // the screen updating for the rest of the session.
    const fn = jest.fn().mockRejectedValue(new Error("down"));

    mountFocused({ fn, interval: 1000 });
    await advance(3000, 1000);

    expect(fn).toHaveBeenCalledTimes(4); // immediate + 3 intervals
  });

  it("EC: a synchronous throw is contained too", async () => {
    const fn = jest.fn(() => {
      throw new Error("sync boom");
    });

    expect(() => mountFocused({ fn, interval: 1000 })).not.toThrow();

    await advance(2000, 1000);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(unhandled).toEqual([]);
  });

  it("HP: a poll that recovers mid-sequence resumes returning values", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValue("recovered");

    mountFocused({ fn, interval: 1000 });
    await advance(3000, 1000);

    expect(fn).toHaveBeenCalledTimes(4);
    await expect(fn.mock.results[3].value).resolves.toBe("recovered");
    expect(unhandled).toEqual([]);
  });
});

describe("MOBILE-016 — existing behaviour is undisturbed", () => {
  it("HP: still ticks immediately on focus, then on interval", async () => {
    const fn = jest.fn();
    mountFocused({ fn, interval: 1000 });
    expect(fn).toHaveBeenCalledTimes(1);

    await advance(3000, 1000);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("HP: still stops on blur", () => {
    const fn = jest.fn();
    mountFocused({ fn, interval: 1000 });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    const before = fn.mock.calls.length;

    act(() => blurScreen());
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(fn).toHaveBeenCalledTimes(before);
  });

  it("HP: still stops on background and resumes on foreground", async () => {
    const fn = jest.fn();
    mountFocused({ fn, interval: 1000 });
    await settle();

    act(() => setAppState("background"));
    const backgrounded = fn.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(30_000);
    });
    expect(fn).toHaveBeenCalledTimes(backgrounded);

    act(() => setAppState("active"));
    expect(fn).toHaveBeenCalledTimes(backgrounded + 1);
  });

  it("HP: single-flight still holds — a failing SLOW poll is not overlapped", async () => {
    let reject!: (e: Error) => void;
    const gate = new Promise<void>((_, r) => {
      reject = r;
    });
    const fn = jest.fn(() => gate);

    mountFocused({ fn, interval: 1000 });
    expect(fn).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(fn).toHaveBeenCalledTimes(1); // still in flight

    await act(async () => {
      reject(new Error("slow failure"));
      await Promise.resolve();
    });

    await advance(1000, 1000);
    expect(fn).toHaveBeenCalledTimes(2); // released, next tick got through
    expect(unhandled).toEqual([]);
  });

  it("HP: unmount still removes the timer and the AppState listener", () => {
    const fn = jest.fn();
    const { unmount } = mountFocused({ fn, interval: 1000 });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    const before = fn.mock.calls.length;

    act(() => blurScreen());
    unmount();
    act(() => {
      jest.advanceTimersByTime(20_000);
    });

    expect(fn).toHaveBeenCalledTimes(before);
    expect(removeCalls).toBe(1);
    expect(appStateHandlers).toHaveLength(0);
  });

  it("HP: a failing poll does not stack loops or listeners across refocus", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("down"));
    mountFocused({ fn, interval: 1000 });

    for (let i = 0; i < 5; i++) {
      act(() => blurScreen());
      act(() => focusScreen());
      await settle();
    }
    const afterChurn = fn.mock.calls.length;

    await advance(1000, 1000);

    expect(fn).toHaveBeenCalledTimes(afterChurn + 1); // exactly one loop
    expect(appStateHandlers).toHaveLength(1);
    expect(unhandled).toEqual([]);
  });
});
