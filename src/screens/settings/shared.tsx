// Shared foundation for the Settings screens — icons, types, and constants.
// Extracted from settings.tsx so each sub-screen can import what it needs.
import React from "react";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import type { PermissionMap, PermissionGroupKey, StaffRole } from "../../types/permissions";

export const I = {
  Chevron: ({ c = C.gray300 }: { readonly c?: string }) => (
    <Ionicons name="chevron-forward" size={16} color={c} />
  ),
  Back: ({ c = C.brand500 }: { readonly c?: string }) => (
    <Ionicons name="chevron-back" size={20} color={c} />
  ),
  Check: ({ c = C.success700 }: { readonly c?: string }) => (
    <Ionicons name="checkmark" size={14} color={c} />
  ),
  X: ({ c = C.gray400, s = 16 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="close" size={s} color={c} />
  ),
  Plus: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="add" size={16} color={c} />
  ),
  Edit: ({ c = C.brand500 }: { readonly c?: string }) => (
    <MaterialCommunityIcons name="square-edit-outline" size={15} color={c} />
  ),
  User: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="person-outline" size={s} color={c} />
  ),
  Clock: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="time-outline" size={18} color={c} />
  ),
  Building: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <MaterialCommunityIcons name="office-building-outline" size={s} color={c} />
  ),
  Users: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="people-outline" size={s} color={c} />
  ),
  Shield: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="shield-outline" size={18} color={c} />
  ),
  Info: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="information-circle-outline" size={18} color={c} />
  ),
  Wallet: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="wallet-outline" size={18} color={c} />
  ),
  Sliders: ({ c = C.white }: { readonly c?: string }) => (
    <MaterialCommunityIcons name="tune-vertical" size={18} color={c} />
  ),
  Archive: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="archive-outline" size={18} color={c} />
  ),
  Log: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="document-text-outline" size={18} color={c} />
  ),
  Lock: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="lock-closed-outline" size={18} color={c} />
  ),
  Eye: ({ visible, c = C.gray400 }: { readonly visible: boolean; readonly c?: string }) => (
    <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={c} />
  ),
  LogOut: ({ c = C.white, s = 20 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="log-out-outline" size={s} color={c} />
  ),
  BookOpen: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="book-outline" size={18} color={c} />
  ),
  Smartphone: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="phone-portrait-outline" size={18} color={c} />
  ),
  Services: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="clipboard-outline" size={18} color={c} />
  ),
  Inventory: ({ c = C.white }: { readonly c?: string }) => (
    <MaterialCommunityIcons name="file-document-outline" size={18} color={c} />
  ),
  Search: ({ c = C.gray400 }: { readonly c?: string }) => (
    <Ionicons name="search" size={16} color={c} />
  ),
  LifeBuoy: ({ c = C.white }: { readonly c?: string }) => (
    <MaterialCommunityIcons name="lifebuoy" size={18} color={c} />
  ),
  MessageCircle: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="chatbubble-outline" size={18} color={c} />
  ),
  Phone: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="call-outline" size={18} color={c} />
  ),
  Mail: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="mail-outline" size={18} color={c} />
  ),
  AlertTriangle: ({ c = C.white }: { readonly c?: string }) => (
    <Ionicons name="warning-outline" size={18} color={c} />
  ),
  QrCode: ({ c = C.gray400, s = 32 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="qr-code-outline" size={s} color={c} />
  ),
  Camera: ({ c = C.brand500, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="camera-outline" size={s} color={c} />
  ),
  Tasks: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <MaterialCommunityIcons name="clipboard-check-outline" size={s} color={c} />
  ),
  Costing: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <FontAwesome5 name="dollar-sign" size={s} color={c} />
  ),
  Receipt: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="receipt-outline" size={s} color={c} />
  ),
  FileText: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="document-text-outline" size={s} color={c} />
  ),
};
// ─── Types ────────────────────────────────────────────────────────────────────
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Day = (typeof DAYS)[number];
export interface DaySchedule { isOpen: boolean; openTime: string; closeTime: string; is24Hours: boolean }
export type OperatingHours = Record<Day, DaySchedule>;
export const DEFAULT_HOURS: OperatingHours = Object.fromEntries(
  DAYS.map((d) => [d, { isOpen: d !== "Sunday", openTime: "08:00", closeTime: "18:00", is24Hours: false }])
) as OperatingHours;
export type MerchantType = "LAUNDROMAT" | "HOME_WASHER";
export interface BranchConfig {
  name: string; address: string; phone: string; gcashNumber: string;
  receiptHeader: string; receiptFooter: string; claimCodePrefix: string;
  slotDurationMinutes: number; maxConcurrentOrders: number;
  operatingHours: OperatingHours;
  merchantType: MerchantType;
}
export interface StaffMember {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: StaffRole;
  pin: string;
  // All branches this staff is assigned to. There is no "primary" branch —
  // every assigned branch is equal.
  branchAccessIds: string[];
  isActive: boolean;
  isArchived: boolean;
  archivedAt: Date | null;
  hardDeleteAt: Date | null;
  permissions: Partial<PermissionMap>;
  /** Which branches, and what they may do at each. */
  branchAccess: { branchId: string; groups: PermissionGroupKey[] }[];
  createdAt?: Date;
}
export type ViewState = "hub" | "hours" | "branches" | "staff" | "permissions" | "activity" | "tours" | "help" | "terms" | "privacy" | "account" | "devices" | "verification" | "services" | "inventory" | "costing" | "tasks" | "transactions";
export interface DeviceNotif {
  id: string;
  deviceId: string;
  userId: string;
  staffName: string;
  deviceName: string;
  platform: string;
  isRead: boolean;
  createdAt: Date | null;
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
export const ROLE_COLORS: Record<string, string> = {
  OWNER: C.brand500,
  STAFF: C.gray500,
};
// Subtle per-category icon tints for the grouped Settings hub.
export const isCourier = (m: Pick<StaffMember, "role">) => m.role === "COURIER";

// Subtle per-category icon tints for the grouped Settings hub.
export const CAT = {
  business: { bg: C.brand50,  fg: C.brand500 }, // light blue
  team:     { bg: "#EDE9FE",  fg: "#7C3AED" },   // light purple
  system:   { bg: "#CCFBF1",  fg: "#0D9488" },   // light teal
  account:  { bg: C.gray100,  fg: C.gray600 },   // neutral
} as const;
// ─── Hub row (icon circle + label + subtitle + optional badge + chevron) ──────

// Maps an activeStaffStore StaffMember to the settings-screen StaffMember shape.
export function mapStaffMember(m: import("../../stores/activeStaffStore").StaffMember): StaffMember {
  return {
    id:              m.id,
    name:            m.name,
    phone:           m.phone ?? "",
    email:           m.email ?? "",
    role:            m.role,
    pin:             "",
    branchAccessIds: m.branchIds ?? [],
    isActive:        m.isActive,
    isArchived:      m.isArchived,
    archivedAt:      m.archivedAt ?? null,
    hardDeleteAt:    m.hardDeleteAt ?? null,
    permissions:     m.permissions ?? {},
    branchAccess:    m.branchAccess ?? [],
    createdAt:       m.createdAt,
  };
}
