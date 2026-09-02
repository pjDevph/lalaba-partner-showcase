// src/stores/tourStore.ts
// Tracks which in-app tours the user has completed.
// Persisted to AsyncStorage — tours never re-show after completion.
//
// Tour IDs:
//   "dashboard" | "pos-terminal" | "pos-queue" | "pos-claim"
//   "sales" | "services" | "settings"

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TourId, TourStep } from "../data/tourContent";

type POSSubTab = "terminal" | "queue" | "claim";

interface TourState {
  // Hydration flag — false until AsyncStorage finishes loading seenTours
  hasHydrated: boolean;

  // Set of tour IDs that have been seen (stored as array for JSON serialisation)
  seenTours: TourId[];

  // Active tour state (not persisted — cleared on app restart)
  activeTourId: TourId | null;
  activeSteps: TourStep[];
  activeStepIndex: number;

  // When replaying a POS sub-tour from App Tours, this tells pos.tsx which
  // sub-tab to switch to on focus before the overlay fires.
  pendingPosTab: POSSubTab | null;

  // Actions
  setHasHydrated: (v: boolean) => void;
  startTour: (id: TourId, steps: TourStep[]) => void;
  nextStep: () => void;
  skipTour: () => void;
  isTourSeen: (id: TourId) => boolean;
  replayTour: (id: TourId, steps: TourStep[]) => void;
  setPendingPosTab: (tab: POSSubTab | null) => void;
  resetAllTours: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      seenTours: [],
      activeTourId: null,
      activeSteps: [],
      activeStepIndex: 0,
      pendingPosTab: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      setPendingPosTab: (tab) => set({ pendingPosTab: tab }),

      isTourSeen: (id) => get().seenTours.includes(id),

      startTour: (id, steps) => {
        // Don't restart if already seen (use replayTour to force)
        if (get().seenTours.includes(id)) return;
        set({ activeTourId: id, activeSteps: steps, activeStepIndex: 0 });
      },

      replayTour: (id, steps) => {
        set({ activeTourId: id, activeSteps: steps, activeStepIndex: 0 });
      },

      nextStep: () => {
        const { activeStepIndex, activeSteps, activeTourId, seenTours } = get();
        const isLast = activeStepIndex >= activeSteps.length - 1;

        if (isLast) {
          set({
            seenTours: activeTourId && !seenTours.includes(activeTourId)
              ? [...seenTours, activeTourId]
              : seenTours,
            activeTourId: null,
            activeSteps: [],
            activeStepIndex: 0,
          });
        } else {
          set({ activeStepIndex: activeStepIndex + 1 });
        }
      },

      skipTour: () => {
        const { activeTourId, seenTours } = get();
        set({
          seenTours: activeTourId && !seenTours.includes(activeTourId)
            ? [...seenTours, activeTourId]
            : seenTours,
          activeTourId: null,
          activeSteps: [],
          activeStepIndex: 0,
        });
      },

      resetAllTours: () => {
        set({
          seenTours: [],
          activeTourId: null,
          activeSteps: [],
          activeStepIndex: 0,
        });
      },
    }),
    {
      name: "lalaba-tour-store",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist seenTours — active tour state is ephemeral
      partialize: (state) => ({ seenTours: state.seenTours }),
      onRehydrateStorage: () => (state) => {
        // Called once AsyncStorage finishes loading — safe to run auto-start now
        if (state) state.setHasHydrated(true);
      },
    }
  )
);
