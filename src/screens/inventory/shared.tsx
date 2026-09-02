// Shared foundation for the Inventory screens — icons, category/unit constants,
// the SelectField dropdown, and the SellableProduct type. Extracted from inventory.tsx.
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { styles } from "./styles";
import type { InventoryUnit } from "../../types/inventory.types";

export const I = {
  Plus: ({ c = C.white }: Readonly<{ c?: string }>) => (
    <Ionicons name="add" size={18} color={c} />
  ),
  Search: ({ c = C.info500 }: Readonly<{ c?: string }>) => (
    <Ionicons name="search" size={16} color={c} />
  ),
  AlertTriangle: ({ c = C.error500 }: Readonly<{ c?: string }>) => (
    <Ionicons name="warning-outline" size={16} color={c} />
  ),
  Package: ({ c = C.brand500 }: Readonly<{ c?: string }>) => (
    <MaterialCommunityIcons name="cube-outline" size={20} color={c} />
  ),
  Trash: ({ c = C.gray400, s = 18 }: Readonly<{ c?: string; s?: number }>) => (
    <Ionicons name="trash-outline" size={s} color={c} />
  ),
  Edit: ({ c = C.gray400, s = 18 }: Readonly<{ c?: string; s?: number }>) => (
    <MaterialCommunityIcons name="square-edit-outline" size={s} color={c} />
  ),
  X: ({ c = C.gray600 }: Readonly<{ c?: string }>) => (
    <Ionicons name="close" size={20} color={c} />
  ),
};

export const UNITS_CONSUMABLE: InventoryUnit[] = ["g", "kg", "ml", "L", "sachet", "pieces", "pack", "box", "scoop"];

// Units a sellable product may use given the unit of its linked inventory item.
// Mirrors the BE's convertQuantity (inventory/utils/unit-conversion.ts): only
// weight (g/kg) and volume (ml/L) convert. Count units have no fixed ratio —
// the BE would deduct the raw number unconverted — so they allow themselves only.
export const WEIGHT_UNITS: InventoryUnit[] = ["g", "kg"];
export const VOLUME_UNITS: InventoryUnit[] = ["ml", "L"];

export function compatibleUnits(inventoryUnit?: InventoryUnit | null): InventoryUnit[] {
  if (!inventoryUnit) return [];
  if (WEIGHT_UNITS.includes(inventoryUnit)) return WEIGHT_UNITS;
  if (VOLUME_UNITS.includes(inventoryUnit)) return VOLUME_UNITS;
  return [inventoryUnit];
}

export const INVENTORY_CATEGORIES: { value: string; label: string }[] = [
  { value: "powdered_detergent",  label: "Powdered Detergent" },
  { value: "liquid_detergent",    label: "Liquid Detergent" },
  { value: "fabric_conditioner",  label: "Fabric Conditioner" },
  { value: "bleach",              label: "Bleach" },
  { value: "oxybleach",           label: "Oxygen Bleach" },
  { value: "stain_remover",       label: "Stain Remover" },
  { value: "dryer_sheet",         label: "Dryer Sheet" },
  { value: "other",               label: "Other" },
];

export const OTHER_REASON = "Other";

export const ADJUST_REASONS_ADD: string[] = [
  "Inventory count correction",
  "Recount / audit",
  "Returned unused stock",
  OTHER_REASON,
];

export const ADJUST_REASONS_REMOVE: string[] = [
  "Inventory count correction",
  "Recount / audit",
  "Damaged in transit",
  "Spillage / breakage",
  "Expired",
  OTHER_REASON,
];


// ─── Modal components ─────────────────────────────────────────────────────────

export function SelectField({
  label, value, options, open, onToggle, onSelect, style,
}: Readonly<{
  label: string;
  value: string;
  options: readonly string[];
  open: boolean;
  onToggle: () => void;
  onSelect: (v: string) => void;
  style?: StyleProp<ViewStyle>;
}>) {
  const baseLabel = label.endsWith(" *") ? label.slice(0, -2) : label;
  const isRequired = label.endsWith(" *");
  return (
    <View style={[{ marginBottom: SP._16 }, style]}>
      <Text style={styles.label}>
        {baseLabel}{isRequired && <Text style={{ color: C.error500, fontWeight: "700" }}> *</Text>}
      </Text>
      <TouchableOpacity style={[styles.input, styles.selectBtn]} onPress={onToggle} activeOpacity={0.75}>
        <Text style={styles.selectBtnText}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={C.gray400} style={{ marginLeft: 4 }} />
      </TouchableOpacity>
      {open && (
        <View style={styles.selectDropdown}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.selectOption, value === opt && styles.selectOptionActive]}
              onPress={() => onSelect(opt)}
              activeOpacity={0.75}
            >
              <Text style={[styles.selectOptionText, value === opt && styles.selectOptionTextActive]}>{opt}</Text>
              {value === opt && <Ionicons name="checkmark" size={14} color={C.brand500} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// A field whose value is inherited from elsewhere and can't be typed into.
export function ReadOnlyField({
  label, value, style,
}: Readonly<{ label: string; value: string; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[{ marginBottom: SP._16 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, { justifyContent: "center" }]}>
        <Text style={{ fontSize: 14, color: C.gray600 }}>{value}</Text>
      </View>
    </View>
  );
}

// Unit picker for a sellable product. The unit is inherited from the linked
// inventory item; it is only editable when the BE can convert between it and a
// sibling unit (g↔kg, ml↔L). No link yet, or a count unit → read-only.
export function UnitField({
  inventoryUnit, value, open, onToggle, onSelect, style,
}: Readonly<{
  inventoryUnit?: InventoryUnit | null;
  value: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (v: InventoryUnit) => void;
  style?: StyleProp<ViewStyle>;
}>) {
  const options = compatibleUnits(inventoryUnit);
  if (options.length > 1) {
    return (
      <SelectField
        label="Unit *"
        value={value}
        options={options}
        open={open}
        onToggle={onToggle}
        onSelect={(u) => onSelect(u as InventoryUnit)}
        style={style}
      />
    );
  }
  return <ReadOnlyField label="Unit" value={inventoryUnit ?? "Select a stock item first"} style={style} />;
}

export function categoryLabel(value?: string | null): string {
  if (!value) return "Select a stock item first";
  return INVENTORY_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export interface SellableProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  inventoryId: string;
  quantity: number;
  productCategory: string;
}
