// src/stores/deepLinkStore.ts
// Holds a pending "deep link" intent from a tapped push notification, consumed
// by the relevant screen. Session-only (not persisted).

import { create } from "zustand";

interface DeepLinkState {
  // Set when a "device pending approval" push is tapped → Settings opens the
  // Registered Devices screen at this branch. Consumed + cleared by DevicesScreen.
  deviceApprovalBranchId: string | null;
  setDeviceApprovalBranch: (branchId: string | null) => void;

  // Set when a KYC decision push (approved / action required) is tapped. The
  // merchant hub reads it to open verification directly on the branch the
  // decision was about, skipping the branch picker — the partner tapped a
  // notification about one specific branch, so asking them which one would be
  // a step backwards. Consumed + cleared by the settings hub.
  verificationBranchId: string | null;
  setVerificationBranch: (branchId: string | null) => void;

  // Set when a notification's destination is a settings sub-screen that takes
  // no subject of its own — a staff-login row opens Activity Logs, which is
  // just a list. The two intents above carry a branch because their screens
  // need one; this one only names a view. Consumed + cleared by the hub.
  settingsView: "activity" | null;
  setSettingsView: (view: "activity" | null) => void;

  // Set when the dashboard's "Edit profile" is tapped → Settings opens the
  // Branches screen with this branch's branding editor already open, rather
  // than dropping the owner on the hub to find it. Consumed + cleared there.
  brandingBranchId: string | null;
  setBrandingBranch: (branchId: string | null) => void;
}

export const useDeepLinkStore = create<DeepLinkState>((set) => ({
  deviceApprovalBranchId: null,
  setDeviceApprovalBranch: (branchId) => set({ deviceApprovalBranchId: branchId }),
  verificationBranchId: null,
  setVerificationBranch: (branchId) => set({ verificationBranchId: branchId }),
  settingsView: null,
  setSettingsView: (view) => set({ settingsView: view }),
  brandingBranchId: null,
  setBrandingBranch: (branchId) => set({ brandingBranchId: branchId }),
}));
