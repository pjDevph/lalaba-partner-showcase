// src/stores/displayStore.ts
// Persisted per-device display preferences.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface DisplayState {
  /** POS service-grid zoom. +1 = fewer/larger tiles (zoom in), -1 = more/smaller (zoom out). */
  posZoomDelta: number;
  setPosZoomDelta: (n: number) => void;
}

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      posZoomDelta: 0,
      setPosZoomDelta: (n) => set({ posZoomDelta: n }),
    }),
    {
      name: "lalaba-display-v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
