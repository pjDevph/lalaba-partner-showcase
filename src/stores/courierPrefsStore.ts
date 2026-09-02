// src/stores/courierPrefsStore.ts
// Persisted per-device courier preferences.
//
// Per-device rather than per-account on purpose: which navigation app a rider
// prefers depends on what's installed on the phone in their hand, so it should
// not follow them to a different device or need a backend round trip.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Which app turn-by-turn hand-offs open. */
export type NavApp = "google" | "waze" | "apple";

interface CourierPrefsState {
  navApp: NavApp;
  setNavApp: (app: NavApp) => void;
}

export const useCourierPrefsStore = create<CourierPrefsState>()(
  persist(
    (set) => ({
      // Google Maps is the safe default: it's preinstalled on effectively every
      // Android device here, whereas Waze may not be.
      navApp: "google",
      setNavApp: (navApp) => set({ navApp }),
    }),
    {
      name: "lalaba-courier-prefs-v1",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const NAV_APP_LABEL: Record<NavApp, string> = {
  google: "Google Maps",
  waze: "Waze",
  apple: "Apple Maps",
};
