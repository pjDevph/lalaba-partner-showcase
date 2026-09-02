// Sellable-product modals — Add / Edit (linked to an inventory item). Extracted from inventory.tsx.
import React, { useState, useEffect } from "react";
import { errField } from "../../utils/userError";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { showAlert } from "../../lib/dialog";
import { useDialogStore } from "../../stores/dialogStore";
import { notify } from "../../stores/notificationStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useProductsStore } from "../../stores/productsStore";
import { useCan } from "../../hooks/usePermission";
import { gqlCreateProduct, gqlUpdateProduct } from "../../services/graphql/products";
import { formatCurrencyInput, parseCurrencyInput, truncateQuantityDigits } from "../../lib/validation";
import { formatQuantityDisplay } from "../../utils/formatQuantity";
import type { InventoryUnit } from "../../types/inventory.types";
import { I, SelectField, UnitField, ReadOnlyField, compatibleUnits, categoryLabel, type SellableProduct } from "./shared";
import { styles } from "./styles";

interface AddSellableProductModalProps {
  readonly visible: boolean;
  readonly branchId: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function AddSellableProductModal({ visible, branchId: _branchId, onClose, onSuccess }: AddSellableProductModalProps) {
  const canAddProduct = useCan("canAddProduct");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  // See RestockModal/AdjustModal: hide this Modal while GlobalDialog is up —
  // otherwise showAlert (e.g. "Duplicate product") silently fails to render
  // on iOS since only one native Modal can present at a time.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  const branchInventory = useInventoryStore((s) => s.products).filter((p) => !p.isArchived);
  const branchInventoryIds = new Set(branchInventory.map((p) => p.id));
  const branchProducts = useProductsStore((s) => s.products)
    .filter((p) => !p.isArchived && branchInventoryIds.has(p.inventoryId));

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [inventoryId, setInventoryId] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<"unit" | "inventory" | null>(null);

  const selectedInventory = branchInventory.find((p) => p.id === inventoryId);
  // Category is inherited wholesale from the linked stock item — a sellable
  // product is just a counter-sale portion of that item, so it can't sit in a
  // different category. Derived, not state, so it can never drift out of sync.
  const category = selectedInventory?.category ?? "";
  const nameError = name.trim() && branchProducts.some((p) => p.productName.trim().toLowerCase() === name.trim().toLowerCase())
    ? "Already exists." : undefined;

  const reset = () => {
    setName(""); setPrice(""); setInventoryId(""); setConsumeQty("");
    setUnit(""); setOpenPicker(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const parsedPrice = parseCurrencyInput(price);
  const parsedConsumeQty = parseFloat(consumeQty);
  const isFormValid =
    !!name.trim() &&
    !Number.isNaN(parsedPrice) && parsedPrice > 0 &&
    !!inventoryId && !!unit &&
    !Number.isNaN(parsedConsumeQty) && parsedConsumeQty > 0 &&
    !nameError;

  const handleSubmit = async () => {
    if (nameError) {
      showAlert("Duplicate product", `A product named "${name.trim()}" already exists.`);
      return;
    }
    if (!isFormValid) {
      showAlert("Missing information", "Name, price, linked stock item, and quantity used are required.");
      return;
    }
    setSaving(true);
    try {
      await gqlCreateProduct({
        inventoryId,
        productName:     name.trim(),
        price:           parsedPrice,
        quantity:        parsedConsumeQty,
        productUnit:     unit,
        productCategory: category,
      });
      await useProductsStore.getState().refresh();
      reset();
      onSuccess();
      notify.success("Success", `"${name.trim()}" added to Products.`);
    } catch (err: unknown) {
      showAlert("Error", errField(err, "message") ?? "Failed to add product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={handleClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Product</Text>
            <TouchableOpacity onPress={handleClose}><I.X /></TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalDescBox}>
              <Text style={styles.modalDescText}>
                Items sold directly to customers at the counter. These appear on POS checkout as purchasable products.
              </Text>
              <Text style={styles.modalDescExample}>
                e.g. Ariel Sachet, Downy Sachet, Laundry Bag, Plastic Hanger Set
              </Text>
            </View>

            <Text style={styles.requiredNote}><Text style={{ color: C.error500, fontWeight: "700" }}>*</Text> Required fields</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Product Name<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={[styles.input, !!nameError && styles.inputError]}
                placeholder="e.g. Detergent Bottle"
                placeholderTextColor={C.gray400}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price (₱)<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={(v) => setPrice(formatCurrencyInput(v))}
              />
            </View>

            <SelectField
              label="Linked Stock Item *"
              value={selectedInventory?.name ?? "Select a stock item"}
              options={branchInventory.length ? branchInventory.map((p) => p.name) : ["No stock items yet — add one in Inventory first"]}
              open={openPicker === "inventory"}
              onToggle={() => branchInventory.length && setOpenPicker((v) => v === "inventory" ? null : "inventory")}
              onSelect={(name) => {
                const found = branchInventory.find((p) => p.name === name);
                // Unit is inherited from the linked item — re-derive it on every
                // link change so a stale pick can't survive onto another item.
                if (found) { setInventoryId(found.id); setUnit(found.unit); }
                setOpenPicker(null);
              }}
            />
            {!!selectedInventory && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16 }]}>
                Current stock: {formatQuantityDisplay(selectedInventory.quantity, isTablet)} {selectedInventory.unit}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Uses per sale<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 50"
                  placeholderTextColor={C.gray400}
                  keyboardType="decimal-pad"
                  value={consumeQty}
                  onChangeText={(v) => setConsumeQty(truncateQuantityDigits(v))}
                />
              </View>
              <UnitField
                inventoryUnit={selectedInventory?.unit}
                value={unit}
                open={openPicker === "unit"}
                onToggle={() => setOpenPicker((v) => v === "unit" ? null : "unit")}
                onSelect={(u) => { setUnit(u); setOpenPicker(null); }}
                style={{ flex: 1 }}
              />
            </View>
            {!!selectedInventory && compatibleUnits(selectedInventory.unit).length > 1 && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16 }]}>
                Inherited from "{selectedInventory.name}" ({selectedInventory.unit}). You can switch between {compatibleUnits(selectedInventory.unit).join(" and ")}.
              </Text>
            )}
            {!!selectedInventory && !!consumeQty && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16 }]}>
                Selling one "{name.trim() || "product"}" deducts {consumeQty} {unit} from "{selectedInventory.name}".
              </Text>
            )}

            <ReadOnlyField label="Category" value={categoryLabel(category)} />
          </ScrollView>

          <View style={styles.invFooterRow}>
            <TouchableOpacity style={styles.invCancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.invCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { flex: 1, marginTop: 0 }, (saving || !isFormValid || !canAddProduct) && { opacity: 0.45 }]}
              onPress={handleSubmit}
              disabled={saving || !isFormValid || !canAddProduct}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>{saving ? "Adding…" : !canAddProduct ? "No permission to add products" : "Add Product"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Sellable Product Modal ──────────────────────────────────────────────
// The linked Inventory item can't be changed after creation (BE's
// UpdateProductInput omits inventoryId) — shown read-only for context.

interface EditSellableProductModalProps {
  readonly visible: boolean;
  readonly product: SellableProduct | null;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function EditSellableProductModal({ visible, product, onClose, onSuccess }: EditSellableProductModalProps) {
  const canEditProduct = useCan("canEditProduct");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  // See RestockModal/AdjustModal: hide this Modal while GlobalDialog is up.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  const branchInventory = useInventoryStore((s) => s.products);
  const linkedInventory = branchInventory.find((p) => p.id === product?.inventoryId);
  const branchInventoryIds = new Set(branchInventory.filter((p) => !p.isArchived).map((p) => p.id));
  const branchProducts = useProductsStore((s) => s.products)
    .filter((p) => !p.isArchived && p._id !== product?.id && branchInventoryIds.has(p.inventoryId));

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [consumeQty, setConsumeQty] = useState("");
  const [unit, setUnit] = useState<InventoryUnit | "">("");
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<"unit" | null>(null);

  const linkedUnit = linkedInventory?.unit;
  // Inherited from the linked item (which can't be changed after creation), so
  // this also repairs products stored under a category the item no longer uses.
  const category = linkedInventory?.category ?? product?.productCategory ?? "";

  // Pre-populate fields whenever a new product is targeted for editing.
  // The unit is inherited from the linked inventory item: a stored unit the BE
  // can't convert to the item's unit (legacy free-form picks) falls back to the
  // item's own unit rather than being offered back as a valid choice.
  useEffect(() => {
    if (product) {
      setName(product.name);
      setPrice(formatCurrencyInput(String(product.price)));
      setConsumeQty(String(product.quantity));
      const allowed = compatibleUnits(linkedUnit);
      setUnit(
        allowed.includes(product.unit as InventoryUnit)
          ? (product.unit as InventoryUnit)
          : (linkedUnit ?? "")
      );
      setOpenPicker(null);
    }
  }, [product, linkedUnit]);

  const handleClose = () => { setOpenPicker(null); onClose(); };

  const nameError = name.trim() && branchProducts.some((p) => p.productName.trim().toLowerCase() === name.trim().toLowerCase())
    ? "Already exists." : undefined;

  const parsedPrice = parseCurrencyInput(price);
  const parsedConsumeQty = parseFloat(consumeQty);
  const isFormValid =
    !!name.trim() && !!unit &&
    !Number.isNaN(parsedPrice) && parsedPrice > 0 &&
    !Number.isNaN(parsedConsumeQty) && parsedConsumeQty > 0 &&
    !nameError;

  const handleSubmit = async () => {
    if (!product) return;
    if (nameError) {
      showAlert("Duplicate product", `A product named "${name.trim()}" already exists.`);
      return;
    }
    if (!isFormValid) {
      showAlert("Missing information", "Name, price, and quantity used are required.");
      return;
    }
    setSaving(true);
    try {
      await gqlUpdateProduct(product.id, {
        productName:     name.trim(),
        price:           parsedPrice,
        quantity:        parsedConsumeQty,
        productUnit:     unit,
        productCategory: category,
      });
      await useProductsStore.getState().refresh();
      onSuccess();
      notify.success("Success", `"${name.trim()}" updated.`);
    } catch (err: unknown) {
      showAlert("Error", errField(err, "message") ?? "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={handleClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Product</Text>
            <TouchableOpacity onPress={handleClose}><I.X /></TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Product Name<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={[styles.input, !!nameError && styles.inputError]}
                placeholder="e.g. Detergent Bottle"
                placeholderTextColor={C.gray400}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Price (₱)<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={(v) => setPrice(formatCurrencyInput(v))}
              />
            </View>

            <ReadOnlyField label="Linked Stock Item" value={linkedInventory?.name ?? "—"} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Uses per sale<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 50"
                  placeholderTextColor={C.gray400}
                  keyboardType="decimal-pad"
                  value={consumeQty}
                  onChangeText={(v) => setConsumeQty(truncateQuantityDigits(v))}
                />
              </View>
              <UnitField
                inventoryUnit={linkedUnit}
                value={unit}
                open={openPicker === "unit"}
                onToggle={() => setOpenPicker((v) => v === "unit" ? null : "unit")}
                onSelect={(u) => { setUnit(u); setOpenPicker(null); }}
                style={{ flex: 1 }}
              />
            </View>
            {!!linkedInventory && compatibleUnits(linkedUnit).length > 1 && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16 }]}>
                Inherited from "{linkedInventory.name}" ({linkedUnit}). You can switch between {compatibleUnits(linkedUnit).join(" and ")}.
              </Text>
            )}
            {!!linkedInventory && !!consumeQty && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16 }]}>
                Selling one "{name.trim() || "product"}" deducts {consumeQty} {unit} from "{linkedInventory.name}".
              </Text>
            )}

            <ReadOnlyField label="Category" value={categoryLabel(category)} />
          </ScrollView>

          <View style={styles.invFooterRow}>
            <TouchableOpacity style={styles.invCancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.invCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { flex: 1, marginTop: 0 }, (saving || !isFormValid || !canEditProduct) && { opacity: 0.45 }]}
              onPress={handleSubmit}
              disabled={saving || !isFormValid || !canEditProduct}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>{saving ? "Saving…" : !canEditProduct ? "No permission to edit products" : "Save Changes"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
