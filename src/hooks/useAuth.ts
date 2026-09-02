// src/hooks/useAuth.ts
// Convenience hook — returns auth state and typed action helpers.
// Also bootstraps the Firebase auth listener once on app mount.

import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useMerchantStore } from "../stores/merchantStore";
import { useStaffStore } from "../stores/staffStore";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const signOut = useAuthStore((s) => s.signOut);
  const clearError = useAuthStore((s) => s.clearError);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const completeGoogleRegistration = useAuthStore((s) => s.completeGoogleRegistration);

  return { user, isLoading, error, signIn, signInWithGoogle, signOut, clearError, resetPassword, completeGoogleRegistration };
}

/**
 * Call once at the app root (_layout.tsx) to:
 *   1. Register the Firebase onAuthStateChanged listener
 *   2. Load merchant + staff profiles when user becomes available
 */
export function useAuthBootstrap(): void {
  const initAuthListener = useAuthStore((s) => s.initAuthListener);
  const user = useAuthStore((s) => s.user);
  const loadMerchant = useMerchantStore((s) => s.loadMerchant);
  const loadStaff = useStaffStore((s) => s.loadStaff);

  // Register auth state listener once
  useEffect(() => {
    const unsubscribe = initAuthListener();
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load merchant + staff whenever user changes.
  // Washers skip both — they have no branches and a separate data model.
  // Staff is populated directly from the auth user object to avoid a redundant
  // GET /auth/me call (loadStaff used to fetch the same data that authStore
  // already has, causing 2 extra /auth/me requests on every cold start).
  useEffect(() => {
    if (!user) return;
    // Case-insensitive: persisted role may be lowercase ("washer") on first
    // restart after normalization was introduced.
    const isWasher = (user.role as string)?.toUpperCase() === "WASHER";
    if (!isWasher && user.merchantId) void loadMerchant(user.merchantId);
    // Pass user as prefill so loadStaff populates without hitting /auth/me.
    // Washers don't need the staff store at all — skip entirely.
    if (!isWasher) void loadStaff(user.uid, user);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.merchantId, user?.role]);
}
