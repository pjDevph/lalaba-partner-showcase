// Shared foundation for the POS screens — icon set, core types, format helpers.
// Extracted from pos.tsx so each tab/modal can import what it needs.
import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import { formatPeso } from "../../lib/format";
import { fromPricingType, fromServiceCategory } from "../../services/graphql/laundryServices";

export const Icon = {
  ChevronLeft: ({ c = C.gray700, s = 20 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="chevron-back" size={s} color={c} />
  ),
  ChevronDown: ({ c = C.gray700, s = 16 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="chevron-down" size={s} color={c} />
  ),
  X: ({ c = C.gray400, s = 16 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="close" size={s} color={c} />
  ),
  Check: ({ c = C.success700, s = 14 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="checkmark" size={s} color={c} />
  ),
  Expand: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="expand-outline" size={s} color={c} />
  ),
  Collapse: ({ c = C.white, s = 18 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="contract-outline" size={s} color={c} />
  ),
  User: ({ c = C.gray400 }: { readonly c?: string }) => (
    <Ionicons name="person-outline" size={16} color={c} />
  ),
  Phone: ({ c = C.gray400 }: { readonly c?: string }) => (
    <Ionicons name="call-outline" size={16} color={c} />
  ),
  Search: ({ c = C.gray400 }: { readonly c?: string }) => (
    <Ionicons name="search" size={16} color={c} />
  ),
  Clock: ({ c = C.gray400 }: { readonly c?: string }) => (
    <Ionicons name="time-outline" size={14} color={c} />
  ),
  Note: ({ c = C.warning700 }: { readonly c?: string }) => (
    <Ionicons name="document-text-outline" size={14} color={c} />
  ),
  Percent: ({ c = C.accent500 }: { readonly c?: string }) => (
    <MaterialCommunityIcons name="percent-outline" size={14} color={c} />
  ),
  Share: ({ c = C.brand500 }: { readonly c?: string }) => (
    <Ionicons name="share-outline" size={14} color={c} />
  ),
  Plus: ({ c = C.brand500 }: { readonly c?: string }) => (
    <Ionicons name="add" size={16} color={c} />
  ),
  Backspace: ({ c = C.gray600, s = 20 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="backspace-outline" size={s} color={c} />
  ),
  Star: ({ c = C.warning500, s = 14 }: { readonly c?: string; readonly s?: number }) => (
    <Ionicons name="star" size={s} color={c} />
  ),
};

// ─── Types ───
export type POSTab    = "terminal" | "queue" | "claim";
export type ServiceDef = { id: string; name: string; unitPrice: number; category: string; unit: string; isAddon?: boolean; isFeatured?: boolean; branchId?: string | null; pricingType?: string; defaultProducts?: { inventoryId: string; productName: string; quantity: number }[] };

// ─── Format helpers ───
export const fp  = (v: number) => formatPeso(v);
export const ft  = (d: Date)   => d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
export const fd  = (d: Date)   => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });

// Maps a servicesStore service to the POS terminal's ServiceDef shape.
export function mapStoreService(s: { _id: string; serviceName: string; price: number; category: string; pricingType: string; isArchived: boolean; branchId: string; defaultProducts?: { inventoryId: string; productName: string; quantity: number }[] }): ServiceDef {
  return {
    id:              s._id,
    name:            s.serviceName,
    unitPrice:       s.price ?? 0,
    category:        fromServiceCategory(s.category ?? ""),
    unit:            fromPricingType(s.pricingType ?? "PER_KILO"),
    isAddon:         false,
    isFeatured:      false,
    branchId:        s.branchId ?? null,
    pricingType:     s.pricingType,
    defaultProducts: s.defaultProducts,
  };
}
