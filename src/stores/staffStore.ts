// src/stores/staffStore.ts
// Holds the active staff member's profile.
// Phase 1A: staffId comes from Firebase Auth UID.
// Future: shift open/close, cash drawer reconciliation.
//
// loadStaff accepts an optional prefill object (AuthUser from authStore).
// When prefill is provided the data is used directly — no API round-trip needed.
// This eliminates redundant GET /auth/me calls that previously fired on every
// cold start because useAuthBootstrap called loadStaff(uid) as soon as the
// user was set, which triggered its own /auth/me fetch in parallel with the
// one already happening inside fetchSession.
//
// The API path (Phase 2+) is preserved as fallback for when prefill is absent.

import { create } from "zustand";
import { fetchMe } from "../services/graphql/auth";

export interface StaffProfile {
  uid: string;
  displayName: string;
  email: string;
  role: "MERCHANT" | "STAFF";
  merchantId: string;
  // pin field intentionally removed — PINs are verified server-side only
}

// Minimal user shape accepted as prefill (matches authStore.AuthUser)
export interface StaffPrefill {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  merchantId: string | null;
}

interface StaffState {
  staff: StaffProfile | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  // prefill: pass authStore user to skip the /auth/me round-trip
  loadStaff: (uid: string, prefill?: StaffPrefill) => Promise<void>;
  setStaff: (staff: StaffProfile | null) => void;
  clearError: () => void;
  reset: () => void;
}

function buildProfile(u: StaffPrefill): StaffProfile {
  return {
    uid:         u.uid,
    displayName: u.displayName ?? "",
    email:       u.email ?? "",
    role:        (u.role?.toUpperCase() as "MERCHANT" | "STAFF") ?? "STAFF",
    merchantId:  u.merchantId ?? u.uid,
  };
}

export const useStaffStore = create<StaffState>()((set) => ({
  staff: null,
  isLoading: false,
  error: null,

  loadStaff: async (_uid, prefill?) => {
    // Fast path: authStore already has the data — populate without an API call.
    // This prevents duplicate GET /auth/me requests on every cold start / sign-in.
    if (prefill?.role) {
      set({ staff: buildProfile(prefill), isLoading: false, error: null });
      return;
    }

    // Slow path: fetch from GraphQL me query
    set({ isLoading: true, error: null });
    try {
      const me = await fetchMe();
      if (!me?.role?.roleId) {
        set({ error: "Staff profile not found", isLoading: false });
        return;
      }
      const u: StaffPrefill = {
        uid:         me._id,
        email:       me.email,
        displayName: `${me.firstName} ${me.lastName}`.trim(),
        role:        me.role.roleId,
        merchantId:  me.merchantId ?? me._id,
      };
      set({ staff: buildProfile(u), isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to load staff profile",
        isLoading: false,
      });
    }
  },

  setStaff: (staff) => set({ staff }),

  clearError: () => set({ error: null }),

  reset: () => set({ staff: null, isLoading: false, error: null }),
}));
