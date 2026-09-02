// app/(staff)/products.tsx
// Staff Products tab — the same Inventory screen opened on its Products tab.
// Shown in the staff nav only when the staff holds a products permission
// (see _layout gating). Products live inside the Inventory screen, so this is a
// thin wrapper that selects the Products tab.
import React from "react";
import InventoryScreen from "../(tabs)/inventory";

export default function StaffProductsScreen() {
  return <InventoryScreen initialTab="products" />;
}
