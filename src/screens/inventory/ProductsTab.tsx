// Products tab — POS-visible sellable products list (active + archived). Extracted from inventory.tsx.
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { C, SP } from "../../theme/tokens";
import { formatPeso } from "../../lib/format";
import { showAlert, showConfirm } from "../../lib/dialog";
import { notify } from "../../stores/notificationStore";
import { useCan } from "../../hooks/usePermission";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useProductsStore } from "../../stores/productsStore";
import { gqlArchiveProduct, gqlRestoreProduct, gqlMyProducts } from "../../services/graphql/products";
import { I, type SellableProduct } from "./shared";
import { EditSellableProductModal } from "./SellableModals";
import { styles } from "./styles";
import { toUserMessage } from "../../utils/userError";

export function ProductsTab({ branchId: _branchId, onAdd, refreshKey }: { readonly branchId: string; readonly onAdd: () => void; readonly refreshKey: number }) {
  const canAddProduct = useCan("canAddProduct");
  const canEditProduct = useCan("canEditProduct");
  const canArchiveProduct = useCan("canArchiveProduct");
  const storeProducts = useProductsStore((s) => s.products);
  // Product has no branchId of its own — it's scoped via its linked Inventory
  // item, which IS branch-scoped. useInventoryStore.products is already
  // filtered to this branch (see InventoryContent's setBranchId + refresh).
  // Memoized on the store's array reference so it's stable across renders and
  // safe to use in the effect/callback deps below (an inline `new Set(...)`
  // would get a fresh reference every render and re-trigger them forever).
  const branchInventoryProducts = useInventoryStore((s) => s.products);
  const branchInventoryIds = useMemo(
    () => new Set(branchInventoryProducts.map((p) => p.id)),
    [branchInventoryProducts]
  );
  const [items, setItems] = useState<SellableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<SellableProduct[]>([]);
  const [editTarget, setEditTarget] = useState<SellableProduct | null>(null);
  const loadArchived = useCallback(async () => {
    try {
      const res = await gqlMyProducts({ isArchived: true, limit: 100 });
      setArchived(
        res.data
          .filter((p) => branchInventoryIds.has(p.inventoryId))
          .map((p) => ({
            id: p._id, name: p.productName, price: Number(p.price ?? 0), unit: p.productUnit ?? "",
            inventoryId: p.inventoryId, quantity: Number(p.quantity ?? 0), productCategory: p.productCategory ?? "other",
          }))
      );
    } catch { setArchived([]); }
  }, [branchInventoryIds]);
  const handleRestore = (item: SellableProduct) => {
    void gqlRestoreProduct(item.id)
      .then(() => {
        setArchived((p) => p.filter((x) => x.id !== item.id));
        notify.success("Restored", `"${item.name}" restored to Products.`);
        void useProductsStore.getState().refresh();
      })
      .catch((e) => showAlert("Error", toUserMessage(e, "Could not restore product.")));
  };
  const archivedSection = (
    <>
      <TouchableOpacity
        style={styles.archiveToggle}
        onPress={() => { const n = !showArchived; setShowArchived(n); if (n) void loadArchived(); }}
        activeOpacity={0.7}
      >
        <Text style={styles.archiveToggleText}>{showArchived ? "Hide archived products" : "Show archived products"}</Text>
      </TouchableOpacity>
      {showArchived && (archived.length === 0 ? (
        <Text style={styles.archiveEmpty}>No archived products.</Text>
      ) : archived.map((item) => (
        <View key={item.id} style={[styles.productCard, styles.archivedCard]}>
          <View style={styles.productHeader}>
            <Text style={[styles.productName, { flex: 1, color: C.gray500 }]} numberOfLines={1}>{item.name}</Text>
            <TouchableOpacity
              style={[styles.restoreBtn, !canArchiveProduct && { opacity: 0.4 }]}
              onPress={() => handleRestore(item)}
              disabled={!canArchiveProduct}
              hitSlop={8}
            >
              <Text style={styles.restoreBtnText}>Restore</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.stockValue, { color: C.gray400 }]}>{formatPeso(item.price)}</Text>
        </View>
      )))}
    </>
  );

  useEffect(() => {
    setItems(
      storeProducts
        .filter((p) => !p.isArchived && branchInventoryIds.has(p.inventoryId))
        .map((p) => ({
          id: p._id, name: p.productName, price: Number(p.price ?? 0), unit: p.productUnit ?? "",
          inventoryId: p.inventoryId, quantity: Number(p.quantity ?? 0), productCategory: p.productCategory ?? "other",
        }))
    );
    setLoading(false);
  }, [storeProducts, branchInventoryIds, refreshKey]);

  const handleDeleteProduct = (item: SellableProduct) => {
    showConfirm(
      "Remove Product",
      `Remove "${item.name}" from your sellable products? It will no longer appear at the POS counter.`,
      () => {
        void gqlArchiveProduct(item.id)
          .then(() => {
            setItems((prev) => prev.filter((p) => p.id !== item.id));
            notify.success("Removed", `"${item.name}" removed from Products.`);
            void useProductsStore.getState().refresh();
          })
          .catch((e) => showAlert("Error", toUserMessage(e, "Could not remove product.")));
      },
      { confirmLabel: "Remove", destructive: true }
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.brand500} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><I.Package /></View>
          <Text style={styles.emptyText}>No retail products yet</Text>
          <TouchableOpacity
            style={[styles.submitBtn, { marginTop: SP._16, paddingHorizontal: SP._24 }, !canAddProduct && { opacity: 0.4 }]}
            onPress={onAdd}
            disabled={!canAddProduct}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>Add Product for Sale</Text>
          </TouchableOpacity>
        </View>
        {archivedSection}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      {items.map((item) => (
        <View key={item.id} style={styles.productCard}>
          <View style={styles.productHeader}>
            <Text style={[styles.productName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={styles.unitBadge}>
                <Text style={styles.unitBadgeText}>{item.unit}</Text>
              </View>
              <TouchableOpacity
                style={[styles.cardArchiveBtn, !canEditProduct && { opacity: 0.4 }]}
                onPress={() => setEditTarget(item)}
                disabled={!canEditProduct}
                hitSlop={8}
              >
                <I.Edit />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cardArchiveBtn, !canArchiveProduct && { opacity: 0.4 }]}
                onPress={() => handleDeleteProduct(item)}
                disabled={!canArchiveProduct}
                hitSlop={8}
              >
                <I.Trash />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.stockValue, { color: C.brand500 }]}>
            {formatPeso(item.price)}
          </Text>
        </View>
      ))}
      {items.length > 0 && <Text style={styles.endOfList}>— End of results —</Text>}
      {archivedSection}
      <EditSellableProductModal
        visible={!!editTarget}
        product={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => setEditTarget(null)}
      />
    </ScrollView>
  );
}
