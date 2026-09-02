// Services form building blocks — inventory-usage tracking rows, dropdown, labeled input.
// Extracted from services.tsx.
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import type { KeyboardTypeOptions, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";
import { compatibleUnits, convertUsageQuantity, sanitizeInt, sanitizeDecimal } from "./model";
import type { InventoryUsageItem, InventoryUsageUnit, InventoryUsagePer, InvProduct } from "./model";
import { styles } from "./styles";

function allowedPers(serviceUnit: string): InventoryUsagePer[] {
  if (serviceUnit === "per kg")   return ["order", "kg"];
  if (serviceUnit === "per load") return ["order", "load"];
  if (serviceUnit === "per pc")   return ["order", "pc"];
  if (serviceUnit === "per set")  return ["order", "pc"];
  return ["order"];
}

export function InventoryTrackContent({
  loading, products, usageItems, serviceUnit, pickerRow, onTogglePicker, onChange, onRemove, onAddRow,
}: Readonly<{
  loading: boolean;
  products: InvProduct[];
  usageItems: InventoryUsageItem[];
  serviceUnit: string;
  pickerRow: number | null;
  onTogglePicker: (idx: number) => void;
  onChange: (idx: number, updated: InventoryUsageItem) => void;
  onRemove: (idx: number) => void;
  onAddRow: () => void;
}>) {
  if (loading) return <ActivityIndicator size="small" color={C.brand500} style={{ marginVertical: 12 }} />;
  if (products.length === 0) {
    return <Text style={styles.invEmptyHint}>Add inventory items first in the Inventory tab.</Text>;
  }
  return (
    <View style={styles.invContainer}>
      <Text style={styles.invSectionHint}>
        Choose which stock items get used when this service is sold, how much, and per what unit of service.
      </Text>
      {usageItems.map((item, idx) => {
        const usedIds = new Set(
          usageItems.filter((_, i) => i !== idx).map((u) => u.inventoryItemId).filter(Boolean)
        );
        return (
          <InventoryUsageRow
            key={item.inventoryItemId || `row-${idx}`}
            item={item}
            products={products}
            usedIds={usedIds}
            availablePers={allowedPers(serviceUnit)}
            pickerOpen={pickerRow === idx}
            onTogglePicker={() => onTogglePicker(idx)}
            onChange={(updated) => onChange(idx, updated)}
            onRemove={() => onRemove(idx)}
          />
        );
      })}
      <TouchableOpacity style={styles.invAddRowBtn} onPress={onAddRow} activeOpacity={0.75}>
        <Text style={styles.invAddRowBtnText}>+ Add item</Text>
      </TouchableOpacity>
    </View>
  );
}

export function InventoryUsageRow({
  item,
  products,
  usedIds,
  availablePers,
  pickerOpen,
  onTogglePicker,
  onChange,
  onRemove,
}: Readonly<{
  item: InventoryUsageItem;
  products: InvProduct[];
  usedIds: Set<string>;
  availablePers: InventoryUsagePer[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onChange: (updated: InventoryUsageItem) => void;
  onRemove: () => void;
}>) {
  const selected = products.find((p) => p.id === item.inventoryItemId);

  // Auto-reset per if it's no longer valid for the current service unit
  const effectivePer: InventoryUsagePer = availablePers.includes(item.per) ? item.per : availablePers[0];
  return (
    <View style={styles.invRow}>
      {/* Product picker button */}
      <View style={styles.invRowMain}>
        <TouchableOpacity style={styles.invProductBtn} onPress={onTogglePicker} activeOpacity={0.75}>
          <Text style={[styles.invProductBtnText, !selected && { color: C.gray400 }]} numberOfLines={1}>
            {selected ? selected.name : "Select product"}
          </Text>
          <Ionicons name="chevron-down" size={10} color={C.gray400} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRemove} hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Ionicons name="close" size={20} color={C.gray400} />
        </TouchableOpacity>
      </View>

      {/* Dropdown product list */}
      {pickerOpen && (
        <View style={styles.invProductPicker}>
          {products.map((p) => {
            const isActive = p.id === item.inventoryItemId;
            const isUsed   = !isActive && usedIds.has(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.invPickerItem, isActive && styles.invPickerItemActive, isUsed && { opacity: 0.4 }]}
                onPress={() => {
                  if (isUsed) return;
                  onChange({ ...item, inventoryItemId: p.id, productName: p.name, unit: (p.unit as InventoryUsageUnit) || "pieces" });
                  onTogglePicker();
                }}
                activeOpacity={isUsed ? 1 : 0.7}
              >
                <Text style={[styles.invPickerItemText, isActive && { color: C.brand700 }]}>
                  {p.name}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray500 }}>
                  {isUsed ? "already added" : p.unit}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Qty + Per row */}
      <View style={styles.invQtyPerRow}>
        <View style={styles.invQtyGroup}>
          <TextInput
            style={styles.invQtyInput}
            value={item.quantity === 0 ? "" : String(item.quantity)}
            onChangeText={(v) => onChange({ ...item, quantity: Number.parseFloat(sanitizeDecimal(v)) || 0, per: effectivePer })}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={C.gray400}
          />
          {selected && compatibleUnits(selected.unit).length > 1 ? (
            <View style={{ flexDirection: "row", gap: 2 }}>
              {compatibleUnits(selected.unit).map((u) => (
                <TouchableOpacity
                  key={u}
                  onPress={() => onChange({ ...item, unit: u })}
                  style={[styles.invMiniChip, item.unit === u && styles.invMiniChipActive]}
                >
                  <Text style={[styles.invMiniChipText, item.unit === u && styles.invMiniChipTextActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : selected?.unit ? (
            <Text style={styles.invUnitLabel}>{selected.unit}</Text>
          ) : null}
        </View>
        <Text style={styles.invSubLabel}>per</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {availablePers.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.invMiniChip, effectivePer === p && styles.invMiniChipActive]}
                onPress={() => onChange({ ...item, per: p })}
              >
                <Text style={[styles.invMiniChipText, effectivePer === p && styles.invMiniChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Live preview */}
      {selected && item.quantity > 0 && (() => {
        const converted = convertUsageQuantity(item.quantity, item.unit, selected.unit as InventoryUsageUnit);
        const conversionNote =
          converted != null && item.unit !== selected.unit
            ? ` (${Number(converted.toFixed(4))} ${selected.unit} in stock)`
            : "";
        return (
          <Text style={styles.invPreview}>
            → Deducts {item.quantity} {item.unit}{conversionNote} of {selected.name} per {effectivePer}
          </Text>
        );
      })()}
    </View>
  );
}

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
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={styles.fieldLabel}>
        {baseLabel}{isRequired && <Text style={{ color: C.error500, fontWeight: "700" }}> *</Text>}
      </Text>
      <TouchableOpacity style={[styles.fieldInput, styles.selectBtn]} onPress={onToggle} activeOpacity={0.75}>
        <Text style={styles.selectBtnText}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={11} color={C.gray400} style={{ marginLeft: 4 }} />
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
              {value === opt && <Ionicons name="checkmark" size={13} color={C.brand500} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  hint,
  error,
  maxLength,
  style,
}: Readonly<{
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  hint?: string;
  error?: string;
  maxLength?: number;
  style?: StyleProp<ViewStyle>;
}>) {
  const [focused, setFocused] = useState(false);
  // Numeric keyboards only suggest a keypad — they don't stop letters/symbols from
  // hardware keyboards or paste. Sanitize so numeric fields accept numbers only.
  const handleChange = (v: string) => {
    if (keyboardType === "decimal-pad" || keyboardType === "numeric") onChangeText(sanitizeDecimal(v));
    else if (keyboardType === "number-pad") onChangeText(sanitizeInt(v));
    else onChangeText(v);
  };
  const baseLabel = label.endsWith(" *") ? label.slice(0, -2) : label;
  const isRequired = label.endsWith(" *");
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={styles.fieldLabel}>
        {baseLabel}{isRequired && <Text style={{ color: C.error500, fontWeight: "700" }}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.fieldInput,
          focused && styles.fieldInputFocused,
          error && styles.fieldInputError,
          multiline && { height: 80, textAlignVertical: "top", paddingTop: 12 },
        ]}
        value={value}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

