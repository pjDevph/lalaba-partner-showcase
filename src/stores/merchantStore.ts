// src/stores/merchantStore.ts
// Holds merchant profile + branch list.
// Branches are loaded from the real GraphQL backend (myBranches query).
// Merchant "profile" is derived from the me query — businessName maps to the
// user's display name until the BE adds a dedicated merchant profile schema.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchMe } from "../services/graphql/auth";
import {
  fetchMyBranches,
  gqlCreateBranch,
  gqlUpdateBranch,
  gqlSetBranchOnline,
  gqlArchiveBranch,
  gqlRestoreBranch,
} from "../services/graphql/branches";
import { useServicesStore } from "./servicesStore";
import { useProductsStore } from "./productsStore";
import { useAuthStore } from "./authStore";
import type { StructuredAddress } from "../components/AddressPicker";

export interface BranchMapLocation {
  latitude: number;
  longitude: number;
}

/** Mirrors the BE BranchAddress type. PSGC codes are not stored server-side —
 *  the edit form resolves them from the names on open. */
export interface BranchAddress {
  unit?: string;
  streetAddress: string;
  barangayName: string;
  cityMunicipalityName: string;
  provinceName: string;
  regionName: string;
  zipCode?: string;
}

export interface DaySchedule {
  isOpen: boolean;
  is24Hours: boolean;
  timeSlots: { open: string; close: string }[];
}

export interface OperatingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

export interface Branch {
  id: string; // maps to _id
  uid: string; // merchant/user ID
  name: string; // maps to branchName
  address: string; // flattened from branchAddress — display only
  branchAddress?: BranchAddress; // structured source of truth; rehydrates the edit form
  phone: string; // maps to branchPhoneNumber
  isActive: boolean;
  isOnline: boolean;
  // Deferred-settlement opt-in (§14): may a customer pay the whole amount when
  // the laundry comes back, instead of at pickup? Off unless the shop turns it
  // on. Snapshotted onto each order at booking, so changing it never affects an
  // order already placed.
  allowsPayAtHandover: boolean;
  branchMapLocation?: BranchMapLocation;
  operatingHours?: OperatingHours;
  // Branding (BE Branch: logoUrl / coverPhotoUrl / description)
  logoUrl?: string | null;
  coverPhotoUrl?: string | null;
  description?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  merchantType?: "LAUNDROMAT" | "HOME_WASHER" | "DRY_CLEANING" | "SELF_SERVICE";
  gcashQrUrl?: string | null;
  receiptHeader?: string;
  receiptFooter?: string;
  claimCodePrefix?: string;
  slotDurationMinutes?: number;
  maxConcurrentOrders?: number;
  archivedAt?: string | null;

  // Business registration details, collected during verification.
  businessType?:
    | "SOLE_PROPRIETORSHIP"
    | "PARTNERSHIP"
    | "CORPORATION"
    | "COOPERATIVE"
    | null;
  dtiRegistrationNumber?: string | null;
  tin?: string | null;
  businessEmail?: string | null;

  // Verified badge. Derive the badge from verifiedAt, not verificationStatus —
  // that's the rule the backend and every other surface already follow.
  verificationStatus?: "PENDING" | "APPROVED" | "REJECTED";
  verifiedAt?: string | null;
}

export interface BranchMember {
  id: string;
  userId: string;
  merchantId: string;
  orgId: string;
  branchId: string;
  branchName?: string | null;
  role: "owner" | "manager" | "staff";
  status: "active" | "inactive";
}

export interface MerchantProfile {
  id: string;
  businessName: string;
  ownerName: string;
  phone: string;
  gcashQrUrl: string | null;
  isActive: boolean;
}

interface MerchantState {
  profile: MerchantProfile | null;
  branches: Branch[];
  selectedBranchId: string | null;
  /** Cross-tab dashboard/sales branch filter. null = "All". Not persisted. */
  dashboardFilterBranchId: string | null;
  /**
   * Whether the owner has explicitly chosen a Sales branch filter this session.
   * Until they do, Sales seeds itself from selectedBranchId — otherwise a null
   * filter is indistinguishable from a deliberate "All Branches".
   */
  dashboardFilterTouched: boolean;
  isLoading: boolean;
  error: string | null;

  loadMerchant: (merchantId: string) => Promise<void>;
  selectBranch: (branchId: string | null) => void;
  setDashboardFilterBranch: (id: string | null) => void;
  /** Seeds the Sales filter from the current branch without marking it chosen. */
  seedDashboardFilterBranch: (id: string | null) => void;
  addBranch: (
    merchantId: string,
    data: { name: string; structuredAddress: StructuredAddress; phone?: string; merchantType?: "LAUNDROMAT" | "HOME_WASHER" }
  ) => Promise<string>;
  updateBranch: (
    branchId: string,
    data: {
      name?: string;
      structuredAddress?: StructuredAddress;
      phone?: string;
      gcashQrUrl?: string | null;
      logoUrl?: string | null;
      coverPhotoUrl?: string | null;
      description?: string | null;
      businessType?: Branch["businessType"];
      dtiRegistrationNumber?: string | null;
      tin?: string | null;
      businessEmail?: string | null;
    }
  ) => Promise<void>;
  toggleOnline: (branchId: string) => Promise<void>;
  /** Mirror a saved Pay Later change onto the cached branch (no refetch). */
  setPayAtHandoverLocal: (branchId: string, enabled: boolean) => void;
  archiveBranch:    (branchId: string) => Promise<void>;
  reactivateBranch: (branchId: string) => Promise<void>;
  refreshBranches: (merchantId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;

  selectedBranch: () => Branch | null;
  hasBranches: () => boolean;
}

export const useMerchantStore = create<MerchantState>()(
  persist(
    (set, get) => ({
      profile: null,
      branches: [],
      selectedBranchId: null,
      dashboardFilterBranchId: null,
      dashboardFilterTouched: false,
      isLoading: false,
      error: null,

      loadMerchant: async (_merchantId) => {
        set({ isLoading: true, error: null });
        try {
          // Run profile and branches in parallel; a failed profile doesn't block branches.
          const [meResult, branchesResult] = await Promise.allSettled([
            fetchMe(),
            fetchMyBranches(false),
            useServicesStore.getState().load(),
            useProductsStore.getState().load(),
          ]);

          const me = meResult.status === "fulfilled" ? meResult.value : null;
          let branches = branchesResult.status === "fulfilled"
            ? branchesResult.value
            : get().branches;

          // If active-only returned empty, retry including archived branches —
          // prevents redirect to onboarding when a branch exists but isActive=false.
          if (branches.length === 0 && branchesResult.status === "fulfilled") {
            const allBranches = await fetchMyBranches(true).catch(() => []);
            if (allBranches.length > 0) branches = allBranches;
          }

          const profile: MerchantProfile | null = me
            ? {
                id:           me._id,
                businessName: `${me.firstName} ${me.lastName}`.trim(),
                ownerName:    `${me.firstName} ${me.lastName}`.trim(),
                phone:        me.phoneNumber ?? "",
                gcashQrUrl:   null,
                isActive:     me.isActive,
              }
            : get().profile;

          const currentBranch = get().selectedBranchId;
          const validBranch =
            currentBranch && branches.some((b) => b.id === currentBranch)
              ? currentBranch
              : (branches[0]?.id ?? null);

          set({ profile, branches, selectedBranchId: validBranch, isLoading: false });
          useAuthStore.getState().syncBranchNames(branches);
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : "Failed to load merchant",
            isLoading: false,
          });
        }
      },

      selectBranch: (branchId) => set({ selectedBranchId: branchId }),

      setDashboardFilterBranch: (id) =>
        set({ dashboardFilterBranchId: id, dashboardFilterTouched: true }),

      seedDashboardFilterBranch: (id) => {
        if (get().dashboardFilterTouched) return;
        set({ dashboardFilterBranchId: id });
      },

      addBranch: async (_merchantId, data) => {
        const branch = await gqlCreateBranch(
          data.name.trim(),
          data.structuredAddress,
          data.phone?.trim() ?? "",
        );
        await get().refreshBranches(_merchantId);
        set({ selectedBranchId: branch.id });
        return branch.id;
      },

      updateBranch: async (branchId, data) => {
        const updated = await gqlUpdateBranch(branchId, {
          name:                  data.name,
          phone:                 data.phone,
          structuredAddress:     data.structuredAddress,
          logoUrl:               data.logoUrl,
          coverPhotoUrl:         data.coverPhotoUrl,
          description:           data.description,
          businessType:          data.businessType,
          dtiRegistrationNumber: data.dtiRegistrationNumber,
          tin:                   data.tin,
          businessEmail:         data.businessEmail,
        });
        set((s) => {
          const patch: Partial<Branch> = {};
          if (data.name  !== undefined) patch.name  = data.name;
          if (data.phone !== undefined) patch.phone = data.phone;
          // Branding reads back off `updated` (the server response) so a
          // server-side rewrite of an uploaded URL wins; the registration
          // fields echo the request, which the BE stores verbatim.
          if (data.logoUrl               !== undefined) patch.logoUrl               = updated.logoUrl;
          if (data.coverPhotoUrl         !== undefined) patch.coverPhotoUrl         = updated.coverPhotoUrl;
          if (data.description           !== undefined) patch.description           = updated.description;
          if (data.businessType          !== undefined) patch.businessType          = data.businessType;
          if (data.dtiRegistrationNumber !== undefined) patch.dtiRegistrationNumber = data.dtiRegistrationNumber;
          if (data.tin                   !== undefined) patch.tin                   = data.tin;
          if (data.businessEmail         !== undefined) patch.businessEmail         = data.businessEmail;
          if (data.structuredAddress !== undefined) {
            // Take the server's formatting rather than re-deriving it here.
            patch.address           = updated.address;
            patch.branchAddress     = updated.branchAddress;
            patch.branchMapLocation = updated.branchMapLocation;
          }
          return {
            branches: s.branches.map((b) =>
              b.id === branchId ? { ...b, ...patch } : b
            ),
          };
        });
      },

      setPayAtHandoverLocal: (branchId, enabled) =>
        set((s) => ({
          branches: s.branches.map((b) =>
            b.id === branchId ? { ...b, allowsPayAtHandover: enabled } : b
          ),
        })),

      toggleOnline: async (branchId) => {
        const branch = get().branches.find((b) => b.id === branchId);
        if (!branch) return;

        const next = !branch.isOnline;
        set((s) => ({
          branches: s.branches.map((b) =>
            b.id === branchId ? { ...b, isOnline: next } : b
          ),
        }));

        try {
          await gqlSetBranchOnline(branchId, next);
        } catch (err) {
          set((s) => ({
            branches: s.branches.map((b) =>
              b.id === branchId ? { ...b, isOnline: !next } : b
            ),
            error: err instanceof Error ? err.message : "Failed to update status",
          }));
        }
      },

      archiveBranch: async (branchId) => {
        await gqlArchiveBranch(branchId);
        set((s) => ({
          branches: s.branches.filter((b) => b.id !== branchId),
          selectedBranchId:
            s.selectedBranchId === branchId ? null : s.selectedBranchId,
        }));
      },

      reactivateBranch: async (branchId) => {
        await gqlRestoreBranch(branchId);
        // Caller should refreshBranches to get the reactivated branch back in the list
      },

      refreshBranches: async (_merchantId) => {
        try {
          const branches = await fetchMyBranches(false);
          const currentBranch = get().selectedBranchId;
          const validBranch =
            currentBranch && branches.some((b) => b.id === currentBranch)
              ? currentBranch
              : (branches[0]?.id ?? null);
          set({ branches, selectedBranchId: validBranch });
        } catch (err) {
          console.warn("[merchantStore] refreshBranches failed:", err);
        }
      },

      clearError: () => set({ error: null }),

      reset: () =>
        set({
          profile: null,
          branches: [],
          selectedBranchId: null,
          dashboardFilterBranchId: null,
          dashboardFilterTouched: false,
          isLoading: false,
          error: null,
        }),

      selectedBranch: () => {
        const { branches, selectedBranchId } = get();
        return branches.find((b) => b.id === selectedBranchId) ?? null;
      },

      hasBranches: () => get().branches.length > 0,
    }),
    {
      name: "lalaba-merchant-profile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile:          state.profile,
        branches:         state.branches,
        selectedBranchId: state.selectedBranchId,
      }),
    }
  )
);
