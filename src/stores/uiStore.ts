// src/stores/uiStore.ts
// Global UI state — modals, loading overlays, network status.
// Keeps UI concerns out of feature stores.

import { create } from "zustand";

type ModalId =
  | "gcash-qr"        // GCash QR code display during payment
  | "claim-ticket"    // Claim code display after order creation
  | "order-detail"    // Order detail bottom sheet
  | "confirm-advance" // Confirm status advance
  | null;

interface UIState {
  activeModal: ModalId;
  isGlobalLoading: boolean;
  isOffline: boolean;
  keyboardHeight: number;
  /** Full-screen POS: hides the bottom tab bar to maximise the POS workspace. */
  posFullScreen: boolean;
  /** Temporarily peek the main sidebar while on the Settings tab. */
  settingsNavPeek: boolean;

  // Modal actions
  openModal: (id: NonNullable<ModalId>) => void;
  closeModal: () => void;

  // Network
  setOffline: (offline: boolean) => void;

  // Loading overlay (for full-screen blocking operations)
  setGlobalLoading: (loading: boolean) => void;

  // Keyboard
  setKeyboardHeight: (height: number) => void;

  // POS full-screen
  setPosFullScreen: (on: boolean) => void;

  // Settings nav peek
  setSettingsNavPeek: (on: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeModal: null,
  isGlobalLoading: false,
  isOffline: false,
  keyboardHeight: 0,
  posFullScreen: false,
  settingsNavPeek: false,

  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  setOffline: (offline) => set({ isOffline: offline }),

  setGlobalLoading: (loading) => set({ isGlobalLoading: loading }),

  setKeyboardHeight: (height) => set({ keyboardHeight: height }),

  setPosFullScreen: (on) => set({ posFullScreen: on }),

  setSettingsNavPeek: (on) => set({ settingsNavPeek: on }),
}));
