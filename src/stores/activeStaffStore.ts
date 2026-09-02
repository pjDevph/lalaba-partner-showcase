// src/stores/activeStaffStore.ts
// Manages the "active staff on shift" state.
// The merchant app stays logged in as the Firebase Auth owner.
// Staff tap their name to start a shift — no PIN required because the staff
// list itself is fetched from a protected API endpoint (owner token required).

import { create } from "zustand";
import { fetchMyStaff } from "../services/graphql/staff";
import {
  resolvePermissions,
  permissionsFromGroups,
  type PermissionMap,
  type PermissionGroupKey,
  type StaffRole,
} from "../types/permissions";
import { ActivityLog, type LogActor } from "../utils/logActivity";

// One branch and the access this staff member holds on it.
export interface StaffBranchAccess {
  branchId: string;
  groups: PermissionGroupKey[];
}

// The permissions a staff member holds on ONE branch.
//
// Shared-terminal shifts run on the OWNER's device, so there is no approved
// staff device to name the branch — the terminal's currently selected branch
// is what the shift is for, and it is what decides the grants. Reading the
// union across branches instead would hand a shift in Makati whatever this
// person may do in BGC.
//
// Falls back to no overrides — pure role defaults, which are now all-false —
// so an unknown branch grants nothing rather than everything.
function permissionsForShift(
  staff: Pick<StaffMember, "branchAccess">,
  branchId: string | null | undefined
): Partial<PermissionMap> {
  if (!branchId) return {};
  const entry = (staff.branchAccess ?? []).find((e) => e.branchId === branchId);
  if (!entry) return {};
  return permissionsFromGroups(entry.groups);
}

// ─── Staff member shape (from Firestore staff collection) ─────────────────────
// NOTE: `pin` is intentionally absent — the client must never hold it.

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  email?: string;
  phone?: string;
  isActive: boolean;
  isArchived: boolean;
  archivedAt?: Date | null;
  hardDeleteAt?: Date | null;
  permissions: Partial<PermissionMap>;
  /** Which branches, and what they may do at each. */
  branchAccess?: StaffBranchAccess[];
  branchIds?: string[];
  createdAt?: Date;
}

// ─── Cash drawer ──────────────────────────────────────────────────────────────

export interface CashMovement {
  id: string;
  type: "IN" | "OUT";
  amount: number;
  note: string;
  at: string; // ISO timestamp
}

// ─── Active shift state ───────────────────────────────────────────────────────

interface ActiveStaffState {
  activeStaff: StaffMember | null;
  effectivePermissions: PermissionMap | null;
  staffList: StaffMember[];
  shiftStartedAt: Date | null;
  selectorVisible: boolean;

  // Cash drawer
  startingCash: number;
  cashMovements: CashMovement[];

  loadStaffList: (merchantId: string) => Promise<void>;
  /**
   * Begin a shared-terminal shift. `branchId` is the branch the terminal is
   * currently set to — it decides which of the staff member's per-branch
   * grants apply, so omitting it grants nothing.
   */
  startShift: (
    staff: StaffMember,
    merchantId: string,
    branchId: string | null
  ) => Promise<{ success: boolean; error?: string }>;
  endShift: (merchantId: string) => Promise<void>;
  showSelector: () => void;
  hideSelector: () => void;
  getActor: (ownerFallback: { id: string; name: string }) => LogActor;

  // Cash drawer actions
  setStartingCash: (amount: number) => void;
  addCashMovement: (type: "IN" | "OUT", amount: number, note: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useActiveStaffStore = create<ActiveStaffState>((set, get) => ({
  activeStaff: null,
  effectivePermissions: null,
  staffList: [],
  shiftStartedAt: null,
  selectorVisible: false,
  startingCash: 0,
  cashMovements: [],

  // Fetches staff list from the GraphQL backend — no PIN data ever reaches the device.
  loadStaffList: async (_merchantId) => {
    try {
      const staff = await fetchMyStaff();
      set({ staffList: staff });
    } catch (err) {
      console.warn("[activeStaffStore] loadStaffList failed:", err);
    }
  },

  // Staff list is already fetched from a protected endpoint — no additional
  // verification needed. Just activate the selected staff member directly.
  startShift: async (staff, merchantId, branchId) => {
    try {
      const effective = resolvePermissions(
        staff.role,
        permissionsForShift(staff, branchId)
      );
      set({
        activeStaff: staff,
        effectivePermissions: effective,
        shiftStartedAt: new Date(),
        selectorVisible: false,
      });

      const actor: LogActor = { id: staff.id, name: staff.name, role: staff.role };
      await ActivityLog.shiftStarted(merchantId, actor);
      return { success: true };
    } catch (err) {
      console.warn("[activeStaffStore] startShift failed:", err);
      return { success: false, error: "Could not start shift. Please try again." };
    }
  },

  endShift: async (merchantId) => {
    const { activeStaff, shiftStartedAt } = get();
    if (!activeStaff) return;

    const durationMinutes = shiftStartedAt
      ? Math.round((Date.now() - shiftStartedAt.getTime()) / 60000)
      : 0;

    const actor: LogActor = {
      id: activeStaff.id,
      name: activeStaff.name,
      role: activeStaff.role,
    };
    await ActivityLog.shiftEnded(merchantId, actor, durationMinutes);

    set({
      activeStaff: null,
      effectivePermissions: null,
      shiftStartedAt: null,
      startingCash: 0,
      cashMovements: [],
    });
  },

  showSelector: () => set({ selectorVisible: true }),
  hideSelector: () => set({ selectorVisible: false }),

  getActor: (ownerFallback) => {
    const { activeStaff } = get();
    if (activeStaff) {
      return { id: activeStaff.id, name: activeStaff.name, role: activeStaff.role };
    }
    return { id: ownerFallback.id, name: ownerFallback.name, role: "OWNER" };
  },

  setStartingCash: (amount) => set({ startingCash: amount }),

  addCashMovement: (type, amount, note) =>
    set((state) => ({
      cashMovements: [
        ...state.cashMovements,
        { id: `${type}:${Date.now()}`, type, amount, note, at: new Date().toISOString() },
      ],
    })),
}));
