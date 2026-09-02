// src/stores/washerStore.ts
// Washer profile state.
// Persisted to AsyncStorage so cold-start screens see profile immediately.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchWasherProfile,
  gqlToggleWasherAvailability,
  gqlUpdateWasherProfile,
  fetchWasherStats,
} from "../services/graphql/washer";
import type {
  WasherProfile,
  WasherDashboardStats,
  WasherCertification,
} from "../types/washer.types";

interface WasherState {
  profile: WasherProfile | null;
  stats: WasherDashboardStats | null;
  /**
   * Certification record for app/(washer)/certification.tsx.
   *
   * NOT yet populated: this line's `washerProfile` query returns the profile
   * alone, whereas the branch these screens came from had it return
   * `{ profile, cert }`. Wiring that is a BE-contract change, so the field
   * stays null and the screen renders its empty state rather than a lie.
   */
  cert: WasherCertification | null;
  isLoading: boolean;
  error: string | null;

  loadWasher: (washerId: string) => Promise<void>;
  toggleAvailability: () => Promise<void>;
  updateProfile: (fields: Partial<WasherProfile>) => Promise<void>;
  refreshStats: (washerId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useWasherStore = create<WasherState>()(
  persist(
    (set, get) => ({
      profile: null,
      cert: null,
      stats: null,
      isLoading: false,
      error: null,

      loadWasher: async (_washerId: string) => {
        set({ isLoading: true, error: null });
        try {
          const profile = await fetchWasherProfile();
          set({ profile, isLoading: false });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to load washer data",
            isLoading: false,
          });
        }
      },

      toggleAvailability: async () => {
        const { profile } = get();
        if (!profile) return;

        const next = !profile.isAvailable;
        set((s) => ({ profile: s.profile ? { ...s.profile, isAvailable: next } : null }));

        try {
          const updated = await gqlToggleWasherAvailability();
          set({ profile: updated });
        } catch (err) {
          set((s) => ({
            profile: s.profile ? { ...s.profile, isAvailable: !next } : null,
            error: err instanceof Error ? err.message : "Failed to update availability",
          }));
        }
      },

      updateProfile: async (fields: Partial<WasherProfile>) => {
        const { profile } = get();
        if (!profile) return;

        // Optimistic apply; roll back to the pre-edit snapshot on failure.
        set((s) => ({
          profile: s.profile ? { ...s.profile, ...fields, updatedAt: new Date() } : null,
        }));

        try {
          const updated = await gqlUpdateWasherProfile(fields);
          set({ profile: updated });
        } catch (err) {
          set({
            profile,
            error: err instanceof Error ? err.message : "Failed to update profile",
          });
          // Rethrow so the calling screen's catch runs and shows a REAL failure
          // state — swallowing here made screens report a false "Saved".
          throw err;
        }
      },

      refreshStats: async (_washerId: string) => {
        try {
          const stats = await fetchWasherStats();
          // `stats` is the sole source of truth for slotsUsedToday — the
          // profile query deliberately omits it (see WASHER_PROFILE_FIELDS).
          // This used to also copy it onto `profile`, which raced against
          // loadWasher(): whichever resolved last won, and a subsequent
          // loadWasher() always re-set profile.slotsUsedToday back to its
          // default 0 (the field the profile query never returns), silently
          // erasing what refreshStats had just written. It could also `set
          // profile: null` outright if this resolved before loadWasher ever
          // populated it. Read stats.slotsUsedToday directly instead.
          set({ stats });
        } catch (err) {
          console.warn("[washerStore] refreshStats failed:", err);
        }
      },

      clearError: () => set({ error: null }),

      reset: () => set({ profile: null, cert: null, stats: null, isLoading: false, error: null }),
    }),
    {
      name: "lalaba-washer",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ profile: state.profile, cert: state.cert }),
    }
  )
);
