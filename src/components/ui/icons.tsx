// Shared icon set — one source of truth for the small glyphs that were
// previously re-declared inline in each screen (services.tsx, tasks.tsx, …).
// Signatures/defaults intentionally match the original per-screen versions so
// migrating a call site is a byte-for-byte behavior swap, not a visual change.

import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C } from "../../theme/tokens";

export function IconPlus({ color = C.white }: Readonly<{ color?: string }>) {
  return <Ionicons name="add" size={18} color={color} />;
}

export function IconEdit({ color = C.brand500 }: Readonly<{ color?: string }>) {
  return <MaterialCommunityIcons name="square-edit-outline" size={16} color={color} />;
}

export function IconStar({ size = 16, color = C.warning500 }: Readonly<{ size?: number; color?: string }>) {
  return <Ionicons name="star" size={size} color={color} />;
}

export function IconTrash({ size = 16, color = C.gray400 }: Readonly<{ size?: number; color?: string }>) {
  return <Ionicons name="trash-outline" size={size} color={color} />;
}

export function IconClose({ size = 18, color = C.gray600 }: Readonly<{ size?: number; color?: string }>) {
  return <Ionicons name="close" size={size} color={color} />;
}

export function IconCheck({ color = C.white, size = 12 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="checkmark" size={size} color={color} />;
}

export function IconDots({ color = C.gray400 }: Readonly<{ color?: string }>) {
  return <Ionicons name="ellipsis-horizontal" size={16} color={color} />;
}

export function IconCheckCircle({ color = C.success500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="checkmark" size={13} color={color} />;
}

export function IconCamera({ color = C.gray500, size = 12 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="camera-outline" size={size} color={color} />;
}

export function IconNote({ color = C.gray500, size = 12 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="chatbox-outline" size={size} color={color} />;
}
