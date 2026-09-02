// Inventory content for a selected branch — stock list, logs, tabs, Excel export. Extracted from inventory.tsx.
import React, { useState, useCallback } from "react";
import type { InventoryUnit } from "../../types/inventory.types";
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { C, SP } from "../../theme/tokens";
import { showAlert, showConfirm } from "../../lib/dialog";
import { formatPeso } from "../../lib/format";
import { notify } from "../../stores/notificationStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useProductsStore } from "../../stores/productsStore";
import { useCan } from "../../hooks/usePermission";
import { useBurgerClearance } from "../../hooks/useBurgerClearance";
import { gqlMyInventory } from "../../services/graphql/inventory";
import { gqlAssertReportExport } from "../../services/graphql/analytics";
import { formatQuantityDisplay } from "../../utils/formatQuantity";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { Product, INVENTORY_LOG_LABELS } from "../../types/inventory.types";
import type { Branch } from "../../stores/merchantStore";
import { I } from "./shared";
import { AddButton } from "../../components/ui/AddButton";
import { TopBar } from "../../components/ui";
import { AddProductModal, RestockModal, AdjustModal, EditProductModal } from "./ConsumableModals";
import { AddSellableProductModal } from "./SellableModals";
import { ProductsTab } from "./ProductsTab";
import { styles } from "./styles";
import { toUserMessage } from "../../utils/userError";

export interface InventoryContentProps {
  readonly branch: Branch;
  readonly onBack: () => void;
  readonly initialTab?: "inventory" | "products";
}

export function InventoryContent({ branch, onBack, initialTab = "inventory" }: InventoryContentProps) {
  const { width: contentWidth, height: contentHeight } = useWindowDimensions();
  const isTablet = Math.min(contentWidth, contentHeight) >= 600;
  const canAddInventory = useCan("canAddInventory");
  const canEditInventory = useCan("canEditInventory");
  const canArchiveInventory = useCan("canArchiveInventory");
  const canAddProduct = useCan("canAddProduct");
  const canExportReports = useCan("canExportReports");
  const burgerClearance = useBurgerClearance();
  const { products, lowStock, logs, total, isLoading, setBranchId, refresh, loadMoreProducts,
    createProduct, updateProduct, restockProduct, adjustProduct, archiveProduct, restoreProduct } = useInventoryStore();
  const storeProductsForCount = useProductsStore((s) => s.products);

  const inventoryCount = products.filter((p) => !p.isArchived).length;
  const branchInventoryIdsForCount = new Set(products.filter((p) => !p.isArchived).map((p) => p.id));
  const productsCount = storeProductsForCount.filter((p) => !p.isArchived && branchInventoryIdsForCount.has(p.inventoryId)).length;

  const [showArchived, setShowArchived] = useState(false);
  const [archivedStock, setArchivedStock] = useState<Product[]>([]);
  const loadArchivedStock = useCallback(async () => {
    try {
      const { data: products } = await gqlMyInventory({ branchId: branch.id, isArchived: true });
      setArchivedStock(products.map((p) => ({
        id: p._id,
        merchantId: p.uid,
        branchId: p.branchId,
        name: p.productName,
        unit: p.inventoryUnit,
        category: p.inventoryCategory,
        quantity: p.stockQuantity,
        threshold: 0,
        costPerUnit: p.cost,
        isActive: p.isActive,
        isArchived: p.isArchived,
        createdAt: { seconds: 0, nanoseconds: 0 },
        updatedAt: { seconds: 0, nanoseconds: 0 },
      })));
    } catch { setArchivedStock([]); }
  }, [branch.id]);
  const handleRestoreItem = (item: Product) => {
    void restoreProduct(item.id)
      .then(() => { notify.success("Restored", `"${item.name}" restored to Inventory.`); return loadArchivedStock(); })
      .catch((e) => showAlert("Error", toUserMessage(e, "Could not restore.")));
  };

  const [activeTab, setActiveTab] = useState<"inventory" | "products">(initialTab);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [productRefreshKey, setProductRefreshKey] = useState(0);

  // Point the store at this branch and load on focus (covers mount, focus, and
  // branch change). A separate mount useEffect would double-fetch → flicker.
  useFocusEffect(
    useCallback(() => {
      setBranchId(branch.id);
      refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branch.id])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleCreateProduct = async (data: any) => {
    await createProduct({ ...data, branchId: branch.id });
  };

  const handleEdit = async (data: { productName: string; cost: number; threshold: number; inventoryUnit: InventoryUnit; inventoryCategory: string }) => {
    if (selectedProduct) {
      await updateProduct(selectedProduct.id, data);
      setSelectedProduct(null);
    }
  };

  const handleRestock = async (quantity: number, note?: string) => {
    if (selectedProduct) {
      await restockProduct(selectedProduct.id, { quantity, note });
      setSelectedProduct(null);
    }
  };

  const handleAdjust = async (quantity: number, note: string) => {
    if (selectedProduct) {
      await adjustProduct(selectedProduct.id, { quantity, note });
      setSelectedProduct(null);
    }
  };

  // Archive a stock item that's no longer needed or was added by mistake.
  const handleArchiveItem = (item: Product) => {
    showConfirm(
      "Remove Stock Item",
      `Remove "${item.name}" from inventory? Its stock history is kept, and you can re-add it later.`,
      () => {
        void archiveProduct(item.id)
          .then(() => notify.success("Removed", `"${item.name}" removed from Inventory.`))
          .catch((e) => showAlert("Error", toUserMessage(e, "Could not remove item.")));
      },
      { confirmLabel: "Remove", destructive: true }
    );
  };

  const exportXLSX = useCallback(async () => {
    if (!canExportReports) return;
    try {
      // Server-side permission gate — export cannot proceed without it.
      await gqlAssertReportExport();
      const wb = XLSX.utils.book_new();

      // Sheet 1 — Inventory (stock items)
      const invRows = [
        ["Name", "Unit", "Quantity", "Low Stock Threshold", "Cost Per Unit"],
        ...products.map((p) => [p.name, p.unit, p.quantity, p.threshold, p.costPerUnit]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(invRows), "Inventory");

      // Sheet 2 — Products (retail items sold to customers)
      let productRows: any[][] = [["Name", "Unit", "Price (₱)"]];
      try {
        const branchInventoryIdsForExport = new Set(products.filter((p) => !p.isArchived).map((p) => p.id));
        const allProducts = useProductsStore.getState().products;
        const retail = allProducts.filter((p) => !p.isArchived && branchInventoryIdsForExport.has(p.inventoryId));
        productRows = [
          ...productRows,
          ...retail.map((p) => [p.productName, p.productUnit ?? "", Number(p.price ?? 0)]),
        ];
      } catch { /* leave header-only sheet if fetch fails */ }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(productRows), "Products");

      const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
      const path = `${FileSystem.cacheDirectory}inventory_${branch.id}_${Date.now()}.xlsx`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          dialogTitle: "Export Inventory",
          UTI: "com.microsoft.excel.xlsx",
        });
        notify.success("Exported", "Inventory file is ready.");
      } else {
        notify.success("Exported", `File saved: ${path}`);
      }
    } catch (err) {
      showAlert("Export failed", toUserMessage(err, "Could not export inventory."));
    }
  }, [products, branch.id, canExportReports]);

  const getStockColor = (qty: number, threshold: number) => {
    if (qty <= threshold) return C.error500;
    if (qty <= threshold * 2) return C.warning500;
    return C.success500;
  };

  const getStockProgress = (qty: number, threshold: number) =>
    Math.min(1, qty / Math.max(threshold, 1));

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalStockValue = products.reduce((sum, p) => sum + p.quantity * p.costPerUnit, 0);

  const emptyStateText = isLoading
    ? "Loading…"
    : products.length === 0
    ? "No stock items yet"
    : "No items match your search";

  // White, like every other header. This was the last screen still painting
  // brand blue behind the status bar after the header unification.
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.white }]} edges={["top"]}>
      <TopBar
        blue
        large
        titleSize={19}
        title={branch.name}
        onBack={onBack}
        right={
          activeTab === "inventory" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginRight: burgerClearance }}>
              <TouchableOpacity onPress={exportXLSX} disabled={!canExportReports}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: !canExportReports ? "rgba(255,255,255,0.5)" : C.white }}>
                  Export
                </Text>
              </TouchableOpacity>
              <View style={{ width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.3)" }} />
              <AddButton
                variant="link"
                label="Add"
                onPress={() => setShowAddModal(true)}
                disabled={!canAddInventory}
              />
            </View>
          ) : (
            <View style={{ marginRight: burgerClearance }}>
              <AddButton
                variant="link"
                label="Add"
                onPress={() => setShowAddProductModal(true)}
                disabled={!canAddProduct}
              />
            </View>
          )
        }
      />

      <View style={{ flex: 1, width: "100%", maxWidth: 880, alignSelf: "center", backgroundColor: C.gray100 }}>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {(["inventory", "products"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
              {tab === "inventory" ? `Inventory (${inventoryCount})` : `Products (${productsCount})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.tabHint}>
        {activeTab === "inventory"
          ? 'Supplies you use to do laundry (detergent, fabcon…). Tap + or "Add Stock Item".'
          : 'Items you sell at the counter (sachets, hangers…). Tap + or "Add Product for Sale".'}
      </Text>

      {activeTab === "products" && (
        <ProductsTab
          branchId={branch.id}
          onAdd={() => setShowAddProductModal(true)}
          refreshKey={productRefreshKey}
        />
      )}

      {activeTab === "inventory" && (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.content}>
          {/* Low stock banner — only when items exist */}
          {lowStock.length > 0 && (
            <View style={styles.lowStockBanner}>
              <I.AlertTriangle c={C.warning700} />
              <Text style={styles.bannerText}>
                {lowStock.length} item{lowStock.length > 1 ? "s" : ""} running low on stock
              </Text>
            </View>
          )}

          {/* Summary chips + search — only meaningful when there is data */}
          {(products.length > 0 || isLoading) && (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Total Items</Text>
                  <Text style={styles.chipValue}>{products.length}</Text>
                </View>
                <View style={[styles.chip, lowStock.length > 0 && { backgroundColor: C.warning100 }]}>
                  <Text style={[styles.chipLabel, lowStock.length > 0 && { color: C.warning700 }]}>Low Stock</Text>
                  <Text style={[styles.chipValue, lowStock.length > 0 && { color: C.warning700 }]}>
                    {lowStock.length}
                  </Text>
                </View>
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Stock Value</Text>
                  <Text style={styles.chipValue}>
                    {totalStockValue > 0 ? formatPeso(totalStockValue, { maximumFractionDigits: 0 }) : "---"}
                  </Text>
                </View>
              </View>

              {/* Search */}
              <View style={styles.searchContainer}>
            <I.Search />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              placeholderTextColor={C.gray400}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
            </>
          )}

          {/* Product list or empty state */}
          {filteredProducts.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <I.Package />
              </View>
              <Text style={styles.emptyText}>
                {emptyStateText}
              </Text>
              {!isLoading && products.length === 0 && canAddInventory && (
                <TouchableOpacity
                  style={[styles.submitBtn, { marginTop: SP._16, paddingHorizontal: SP._24 }]}
                  onPress={() => setShowAddModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>Add Stock Item</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            filteredProducts.map((product) => {
              const stockColor = getStockColor(product.quantity, product.threshold);
              const progress = getStockProgress(product.quantity, product.threshold);

              return (
                <View key={product.id} style={styles.productCard}>
                  <View style={styles.productHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <View style={styles.unitBadge}>
                          <Text style={styles.unitBadgeText}>{product.unit}</Text>
                        </View>
                      </View>
                    </View>
                    {canArchiveInventory && (
                      <TouchableOpacity style={styles.cardArchiveBtn} onPress={() => handleArchiveItem(product)} hitSlop={8}>
                        <I.Trash />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.stockRow}>
                    <Text style={styles.stockLabel}>Stock</Text>
                    <Text style={[styles.stockValue, { color: stockColor }]}>
                      {formatQuantityDisplay(product.quantity, isTablet)} {product.unit}
                    </Text>
                  </View>

                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress * 100}%`, backgroundColor: stockColor },
                      ]}
                    />
                  </View>

                  <Text style={styles.thresholdText}>Threshold: {formatQuantityDisplay(product.threshold, isTablet)} {product.unit}</Text>

                  {canEditInventory && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.restockBtn]}
                        onPress={() => { setSelectedProduct(product); setShowRestockModal(true); }}
                      >
                        <Text style={[styles.actionBtnText, styles.restockBtnText]}>Restock</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.adjustBtn]}
                        onPress={() => { setSelectedProduct(product); setShowAdjustModal(true); }}
                      >
                        <Text style={[styles.actionBtnText, styles.adjustBtnText]}>Adjust</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.adjustBtn]}
                        onPress={() => { setSelectedProduct(product); setShowEditModal(true); }}
                      >
                        <Text style={[styles.actionBtnText, styles.adjustBtnText]}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Load more */}
          {products.length > 0 && products.length < total && (
            <TouchableOpacity
              style={[styles.archiveToggle, { marginTop: SP._4 }]}
              onPress={() => void loadMoreProducts()}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.archiveToggleText}>
                {isLoading ? "Loading…" : `Load more (${products.length} of ${total})`}
              </Text>
            </TouchableOpacity>
          )}
          {products.length > 0 && products.length >= total && (
            <Text style={styles.endOfList}>— End of results —</Text>
          )}

          {/* Archived stock items — view & restore mistaken/removed items */}
          {products.length > 0 && (
            <TouchableOpacity
              style={styles.archiveToggle}
              onPress={() => { const next = !showArchived; setShowArchived(next); if (next) void loadArchivedStock(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.archiveToggleText}>{showArchived ? "Hide archived items" : "Show archived items"}</Text>
            </TouchableOpacity>
          )}
          {showArchived && (
            archivedStock.length === 0 ? (
              <Text style={styles.archiveEmpty}>No archived items.</Text>
            ) : (
              archivedStock.map((item) => (
                <View key={item.id} style={[styles.productCard, styles.archivedCard]}>
                  <View style={styles.productHeader}>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                      <Text style={[styles.productName, { color: C.gray500 }]} numberOfLines={1}>{item.name}</Text>
                      <View style={styles.unitBadge}><Text style={styles.unitBadgeText}>{item.unit}</Text></View>
                    </View>
                    {canArchiveInventory && (
                      <TouchableOpacity style={styles.restoreBtn} onPress={() => handleRestoreItem(item)} hitSlop={8}>
                        <Text style={styles.restoreBtnText}>Restore</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.thresholdText}>Archived · was {item.quantity} {item.unit}</Text>
                </View>
              ))
            )
          )}

          {/* Recent Activity */}
          {logs.length > 0 && (
            <View style={[styles.productCard, { marginTop: SP._8 }]}>
              <Text style={styles.activityTitle}>Recent Activity</Text>
              {logs.slice(0, 10).map((log) => {
                const sign = log.quantity > 0 ? "+" : "";
                return (
                  <View key={log.id} style={styles.logRow}>
                    <Text style={styles.logType}>{(INVENTORY_LOG_LABELS as Record<string, string>)[log.type as string] ?? log.type}</Text>
                    <View style={styles.logDetails}>
                      <Text style={styles.logProduct}>{log.productName}</Text>
                      <Text style={styles.logTime}>
                        {new Date(log.createdAt.seconds * 1000).toLocaleDateString("en-PH", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                    <Text style={styles.logQty}>{sign}{log.quantity}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      )}

      </View>{/* end maxWidth wrapper */}

      <EditProductModal
        visible={showEditModal}
        product={selectedProduct}
        onClose={() => { setShowEditModal(false); setSelectedProduct(null); }}
        onSubmit={handleEdit}
        isLoading={isLoading}
      />
      <AddSellableProductModal
        visible={showAddProductModal}
        branchId={branch.id}
        onClose={() => setShowAddProductModal(false)}
        onSuccess={() => { setShowAddProductModal(false); setProductRefreshKey((k) => k + 1); }}
      />
      <AddProductModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleCreateProduct}
        isLoading={isLoading}
      />
      <RestockModal
        visible={showRestockModal}
        product={selectedProduct}
        onClose={() => setShowRestockModal(false)}
        onSubmit={handleRestock}
        isLoading={isLoading}
      />
      <AdjustModal
        visible={showAdjustModal}
        product={selectedProduct}
        onClose={() => setShowAdjustModal(false)}
        onSubmit={handleAdjust}
        isLoading={isLoading}
      />
    </SafeAreaView>
  );
}
