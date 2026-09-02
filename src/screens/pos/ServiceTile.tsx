// Service tile — a tappable service card with qty/price controls. Extracted from pos.tsx.
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { SP } from "../../theme/tokens";
import { useFontScale } from "../../../app/_layout";
import { Icon, fp, type ServiceDef } from "./shared";
import type { POSLineItem } from "../../types/pos.types";
import { P, S } from "./styles";

export interface ServiceTileProps {
  svc: ServiceDef;
  selected: boolean;
  cartItem: POSLineItem | undefined;
  onTap: (svc: ServiceDef) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<POSLineItem>) => void;
  widthPct?: string;
  fullWidth?: boolean;
}
// kg-based services take a direct weight; load/piece/set use an integer stepper.
function isWeightUnit(unit: string): boolean {
  return /kg|kilo/i.test(unit ?? "");
}
export function ServiceTile({ svc, selected, cartItem, onTap, onRemove, onUpdate, widthPct, fullWidth }: Readonly<ServiceTileProps>) {
  const fs = useFontScale();
  const weighed = isWeightUnit(svc.unit);
  // Local text buffer so the cashier can type partial values like "1." for kg.
  const [wText, setWText] = useState<string | null>(null);

  const nameBlock = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._4 }}>
        {svc.isFeatured && (
          <View style={[S.tileStarBadge, { marginTop: 2, flexShrink: 0 }]}>
            <Icon.Star c={P.warning} s={9} />
          </View>
        )}
        <Text style={[S.tileName, selected && S.tileNameSelected, { fontSize: 15 * fs }]} numberOfLines={2}>
          {svc.name}
        </Text>
      </View>
      <Text style={[S.tilePrice, selected && S.tilePriceSelected, { fontSize: 13 * fs }]}>
        {fp(svc.unitPrice)}<Text style={{ fontSize: 11 * fs, fontWeight: "500" }}>/{svc.unit}</Text>
      </Text>
    </>
  );

  // Unit-aware control: weight field for kg, integer stepper otherwise.
  const control = selected && cartItem ? (
    <View style={S.tileStepper}>
      <TouchableOpacity
        style={S.tileStepBtn}
        onPress={() => {
          const next = weighed ? Number((cartItem.weightKg - 1).toFixed(2)) : cartItem.weightKg - 1;
          if (next <= 0) onRemove(svc.id); else onUpdate(svc.id, { weightKg: next });
        }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 4 }}
      >
        <Text style={S.tileStepBtnText}>−</Text>
      </TouchableOpacity>
      {weighed ? (
        <View style={S.tileWeightWrap}>
          <TextInput
            style={[S.tileWeightInput, { fontSize: 15 * fs }]}
            value={wText ?? String(cartItem.weightKg)}
            onChangeText={(t) => {
              const cleaned = t.replace(/[^\d.]/g, "");
              setWText(cleaned);
              const n = Number.parseFloat(cleaned);
              if (!Number.isNaN(n) && n > 0) onUpdate(svc.id, { weightKg: n });
            }}
            onFocus={() => setWText(String(cartItem.weightKg))}
            onBlur={() => {
              const n = Number.parseFloat(wText ?? "");
              if (Number.isNaN(n) || n <= 0) onUpdate(svc.id, { weightKg: cartItem.weightKg || 1 });
              setWText(null);
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
            maxLength={6}
          />
          <Text style={[S.tileWeightUnit, { fontSize: 11 * fs }]}>kg</Text>
        </View>
      ) : (
        <Text style={S.tileStepQty}>{cartItem.weightKg}</Text>
      )}
      <TouchableOpacity
        style={S.tileStepBtn}
        onPress={() => onUpdate(svc.id, { weightKg: weighed ? Number((cartItem.weightKg + 1).toFixed(2)) : cartItem.weightKg + 1 })}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
      >
        <Text style={S.tileStepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity style={S.tileAddBtn} onPress={() => onTap(svc)} activeOpacity={0.75}>
      <Text style={S.tileAddBtnText}>{weighed ? "+ Add (kg)" : "+ Add"}</Text>
    </TouchableOpacity>
  );

  // kg quick-pick chips (full-width rows only) — fast common weights.
  const quickKg = fullWidth && weighed && selected && cartItem ? (
    <View style={S.tileQuickRow}>
      {[0.5, 1, 2, 3, 5].map((w) => (
        <TouchableOpacity
          key={w}
          style={[S.tileQuickChip, cartItem.weightKg === w && S.tileQuickChipActive]}
          onPress={() => onUpdate(svc.id, { weightKg: w })}
        >
          <Text style={[S.tileQuickChipText, cartItem.weightKg === w && S.tileQuickChipTextActive]}>{w}</Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;

  if (fullWidth) {
    return (
      <View style={[S.tile, S.tileWide, selected && S.tileSelected]}>
        <View style={S.tileWideRow}>
          <View style={{ flex: 1, minWidth: 0 }}>{nameBlock}</View>
          <View style={S.tileWideControl}>{control}</View>
        </View>
        {quickKg}
      </View>
    );
  }

  return (
    <View style={[S.tile, selected && S.tileSelected, widthPct ? { width: widthPct as any } : undefined]}>
      {nameBlock}
      {control}
    </View>
  );
}
