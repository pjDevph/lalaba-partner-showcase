// src/stores/walletStore.ts
// Shared fee-wallet state. Two tiers:
//   • Onboarding — a first-ever ₱1,000 top-up activates the account (activatedAt
//     is then set by the BE). Until activated, the account is not visible.
//   • Ongoing — once activated, the balance must stay at/above the ₱100
//     accept-a-booking minimum to keep taking bookings.
// Top-ups have a ₱100 minimum. Held in a store (not screen-local) so the
// dashboard (prompt + "Not Visible" status) and the tab bar (Wallet red dot)
// read the same live value.

import { create } from "zustand";
import { gqlWalletSummary } from "../services/graphql/wallet";

export const ACTIVATION_MIN_CENTAVOS = 100_000; // ₱1,000 initial top-up to activate
export const ACCEPT_MIN_CENTAVOS = 10_000;      // ₱100 min balance to accept a booking
export const MIN_TOPUP_CENTAVOS = 10_000;       // ₱100 minimum top-up

interface WalletState {
  balanceCentavos: number | null;
  activatedAt: string | null;
  /**
   * Which branch the numbers above actually describe — null until a load lands.
   * Without this the store is a single bucket shared by every branch and every
   * signed-in account, so a gate could judge one branch by another's balance
   * (a funded branch was told its wallet was below the ₱100 minimum).
   */
  loadedBranchId: string | null;
  load: (branchId: string) => Promise<void>;
  reset: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balanceCentavos: null,
  activatedAt: null,
  loadedBranchId: null,
  load: async (branchId) => {
    if (!branchId) return;
    // Switching branches (or accounts): drop the previous numbers up front so
    // nothing reads them as this branch's while the request is in flight.
    if (get().loadedBranchId !== branchId) {
      set({ balanceCentavos: null, activatedAt: null, loadedBranchId: null });
    }
    try {
      const w = await gqlWalletSummary(branchId);
      set({
        balanceCentavos: w.balanceCentavos,
        activatedAt: w.activatedAt,
        loadedBranchId: branchId,
      });
    } catch {
      /* keep last known */
    }
  },
  reset: () => set({ balanceCentavos: null, activatedAt: null, loadedBranchId: null }),
}));

export function isActivated(activatedAt: string | null): boolean {
  return activatedAt != null;
}

// The account is off the Marketplace when it hasn't onboarded yet, or its
// balance has fallen below the accept-a-booking minimum.
export function isNotVisible(balanceCentavos: number | null, activatedAt: string | null): boolean {
  if (balanceCentavos == null) return false; // unknown yet
  if (!isActivated(activatedAt)) return true;
  return balanceCentavos < ACCEPT_MIN_CENTAVOS;
}
