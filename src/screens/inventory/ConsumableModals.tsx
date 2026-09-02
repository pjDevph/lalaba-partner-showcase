// Consumable inventory modals — Add / Restock / Adjust / Edit. Extracted from inventory.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { showAlert, showConfirm } from "../../lib/dialog";
import { useDialogStore } from "../../stores/dialogStore";
import { notify } from "../../stores/notificationStore";
import { useInventoryStore } from "../../stores/inventoryStore";
import { useProductsStore } from "../../stores/productsStore";
import { useCan } from "../../hooks/usePermission";
import { useFormValidation } from "../../hooks/useFormValidation";
import { restockSchema, adjustSchema, truncateQuantityDigits, formatCurrencyInput, parseCurrencyInput } from "../../lib/validation";
import { formatQuantityDisplay } from "../../utils/formatQuantity";
import type { Product, InventoryUnit } from "../../types/inventory.types";
import { I, SelectField, UNITS_CONSUMABLE, INVENTORY_CATEGORIES, compatibleUnits, OTHER_REASON, ADJUST_REASONS_ADD, ADJUST_REASONS_REMOVE } from "./shared";
import { styles } from "./styles";
import { toUserMessage } from "../../utils/userError";

interface AddProductModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: any) => Promise<void>;
  readonly isLoading: boolean;
}

export function AddProductModal({ visible, onClose, onSubmit, isLoading }: AddProductModalProps) {
  const canAddInventory = useCan("canAddInventory");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  // See RestockModal/AdjustModal: hide this Modal while showAlert/showConfirm's
  // own native Modal (GlobalDialog) is up — iOS can only present one native
  // modal at a time, so without this the alert silently fails to appear.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  const branchInventory = useInventoryStore((s) => s.products).filter((p) => !p.isArchived);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("g");
  const [category, setCategory] = useState("other");
  const [quantity, setQuantity] = useState("");
  const [threshold, setThreshold] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const nameError = name.trim() && branchInventory.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
    ? "Already exists." : undefined;
  const [openPicker, setOpenPicker] = useState<"category" | "unit" | null>(null);

  const reset = () => {
    setName(""); setUnit("g"); setCategory("other"); setQuantity(""); setThreshold(""); setCostPerUnit(""); setOpenPicker(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!canAddInventory) return;
    if (!name.trim() || !quantity || !threshold || !costPerUnit) {
      showAlert("Missing information", "Please fill in all fields.");
      return;
    }
    const nameLower = name.trim().toLowerCase();
    if (branchInventory.some((p) => p.name.trim().toLowerCase() === nameLower)) {
      showAlert("Duplicate item", `A stock item named "${name.trim()}" already exists.`);
      return;
    }
    try {
      await onSubmit({
        name: name.trim(),
        unit,
        category,
        quantity: parseFloat(quantity),
        threshold: parseFloat(threshold),
        costPerUnit: parseCurrencyInput(costPerUnit),
      });
      reset();
      onClose();
      notify.success("Success", `"${name.trim()}" added to Inventory.`);
    } catch (err) {
      showAlert("Error", toUserMessage(err, "Failed to create the stock item. Please try again."));
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={handleClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <View style={{ width: 36 }} />
            <Text style={styles.modalTitle}>Add Stock Item</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8} style={styles.modalCloseBtn}>
              <I.X />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.modalDescBox}>
              <Text style={styles.modalDescText}>
                Supplies you use when performing laundry services. Stock is automatically deducted when a service is sold.
              </Text>
              <Text style={styles.modalDescExample}>
                e.g. Ariel Detergent, Downy Fabric Softener, Zonrox Bleach
              </Text>
            </View>

            <Text style={styles.requiredNote}><Text style={{ color: C.error500, fontWeight: "700" }}>*</Text> Required fields</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Item Name<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={[styles.input, !!nameError && styles.inputError]}
                placeholder="e.g., Laundry Detergent"
                placeholderTextColor={C.gray400}
                value={name}
                onChangeText={setName}
                autoFocus
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <SelectField
              label="Category"
              value={INVENTORY_CATEGORIES.find((c) => c.value === category)?.label ?? category}
              options={INVENTORY_CATEGORIES.map((c) => c.label)}
              open={openPicker === "category"}
              onToggle={() => setOpenPicker((v) => v === "category" ? null : "category")}
              onSelect={(label) => {
                const found = INVENTORY_CATEGORIES.find((c) => c.label === label);
                setCategory(found?.value ?? label);
                setOpenPicker(null);
              }}
            />

            <SelectField
              label="Unit"
              value={unit}
              options={UNITS_CONSUMABLE}
              open={openPicker === "unit"}
              onToggle={() => setOpenPicker((v) => v === "unit" ? null : "unit")}
              onSelect={(u) => { setUnit(u as InventoryUnit); setOpenPicker(null); }}
            />

            <View style={styles.formGroup}>
              <Text style={styles.label}>Current Quantity<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={(v) => setQuantity(truncateQuantityDigits(v))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Low Stock Threshold<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="Alert when below this amount"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={threshold}
                onChangeText={(v) => setThreshold(truncateQuantityDigits(v))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cost per Unit (₱)<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={costPerUnit}
                onChangeText={(v) => setCostPerUnit(formatCurrencyInput(v))}
              />
            </View>
          </ScrollView>

          {(() => {
            const isFormValid = !!name.trim() && !!quantity && !!threshold && !!costPerUnit && !nameError;
            return (
              <View style={styles.invFooterRow}>
                <TouchableOpacity style={styles.invCancelBtn} onPress={handleClose} activeOpacity={0.7}>
                  <Text style={styles.invCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, { flex: 1, marginTop: 0 }, (isLoading || !isFormValid || !canAddInventory) && { opacity: 0.45 }]}
                  onPress={handleSubmit}
                  disabled={isLoading || !isFormValid || !canAddInventory}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>{isLoading ? "Creating..." : !canAddInventory ? "No permission to add stock" : "Add to Inventory"}</Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface RestockModalProps {
  readonly visible: boolean;
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onSubmit: (quantity: number, note?: string) => Promise<void>;
  readonly isLoading: boolean;
}

export function RestockModal({ visible, product, onClose, onSubmit, isLoading }: RestockModalProps) {
  const canEditInventory = useCan("canEditInventory");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  // See AdjustModal: hide this Modal while the showConfirm dialog (its own
  // native Modal) is up, to avoid iOS "already presenting" double-modal.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  // See AdjustModal: covers the gap between GlobalDialog's hide() and this
  // submit actually settling, so the Modal doesn't flash back mid-dismissal.
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedQuantity = quantity.trim() === "" ? NaN : parseFloat(quantity);
  const { isValid, errors } = useFormValidation(restockSchema, {
    quantity: parsedQuantity,
    reason: note.trim() || undefined,
  });

  const doSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(parsedQuantity, note.trim() || undefined);
      notify.success("Restocked", `Added ${parsedQuantity} ${product?.unit ?? ""} to "${product?.name ?? "item"}".`);
      setQuantity("");
      setNote("");
      onClose();
    } catch (err) {
      showAlert("Error", toUserMessage(err, "Failed to restock. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!product || !canEditInventory) return;
    showConfirm(
      "Confirm Restock",
      `Add ${parsedQuantity} ${product.unit} to "${product.name}"?`,
      () => { void doSubmit(); },
      { confirmLabel: "Add Stock" }
    );
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen && !isSubmitting} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Restock</Text>
            <TouchableOpacity onPress={onClose}>
              <I.X />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {product && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product</Text>
                <View style={{ paddingVertical: SP._10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.gray900 }}>
                    {product.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    Current: {formatQuantityDisplay(product.quantity, isTablet)} {product.unit}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity to Add</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={(v) => setQuantity(truncateQuantityDigits(v))}
                autoFocus
              />
              {quantity.length > 0 && errors.quantity && (
                <Text style={styles.errorText}>{errors.quantity}</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 60, paddingTop: SP._10 }]}
                placeholder="e.g., Supplier shipment received"
                placeholderTextColor={C.gray400}
                multiline
                value={note}
                onChangeText={setNote}
                maxLength={200}
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitBtn, (isLoading || !isValid || !canEditInventory) && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading || !isValid || !canEditInventory}
          >
            <Text style={styles.submitBtnText}>{isLoading ? "Restocking..." : !canEditInventory ? "No permission to restock" : "Confirm Restock"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface AdjustModalProps {
  readonly visible: boolean;
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onSubmit: (quantity: number, note: string) => Promise<void>;
  readonly isLoading: boolean;
}

export function AdjustModal({ visible, product, onClose, onSubmit, isLoading }: AdjustModalProps) {
  const canEditInventory = useCan("canEditInventory");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const [isAdd, setIsAdd] = useState(true);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [reasonPickerOpen, setReasonPickerOpen] = useState(false);
  // GlobalDialog (showConfirm) is its own native <Modal>. iOS can only
  // present one RCTFabricModalHostViewController at a time, so this Modal
  // must hide itself while the confirm dialog is up rather than staying
  // visible underneath it — otherwise UIKit logs "already presenting" and
  // the confirm dialog can fail to appear.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  // GlobalDialog calls hide() *before* our onConfirm callback runs, so
  // there's a gap (the await inside doSubmit) where isDialogOpen is already
  // false but `visible` is still true. Without this flag the gate below
  // would flip true again mid-dismissal of the confirm dialog and freeze
  // the native modal stack. Stays true until the submit actually settles.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal instance persists across opens (visible just toggles) — reset the
  // form each time it opens so a dismissed-without-submitting entry doesn't
  // leak into the next product.
  useEffect(() => {
    if (visible) {
      setIsAdd(true);
      setQuantity("");
      setReason("");
      setCustomReason("");
      setReasonPickerOpen(false);
    }
  }, [visible, product]);

  const reasonOptions = isAdd ? ADJUST_REASONS_ADD : ADJUST_REASONS_REMOVE;
  const isOtherReason = reason === OTHER_REASON;
  const note = isOtherReason ? customReason.trim() : reason;

  // Add/Remove have different quick-reason lists — clear a stale pick (e.g.
  // "Damaged in transit" while Add is selected) whenever direction flips.
  const handleSetIsAdd = (next: boolean) => {
    setIsAdd(next);
    setReason("");
    setCustomReason("");
  };

  const parsedQuantity = quantity.trim() === "" ? NaN : parseFloat(quantity);
  const signedQuantity = isAdd ? parsedQuantity : -parsedQuantity;
  const { isValid, errors } = useFormValidation(adjustSchema, {
    quantityChange: signedQuantity,
    reason: note,
  });
  // Removing more than is on hand would drive stock negative — the BE
  // rejects this outright, so catch it client-side with an inline warning
  // instead of letting the user hit a failed-request round trip.
  const exceedsStock = !isAdd && !!product && !Number.isNaN(parsedQuantity) && parsedQuantity > product.quantity;
  const canSubmit = isValid && !exceedsStock;

  const doSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(signedQuantity, note);
      notify.success("Adjusted", `"${product?.name ?? "Item"}" stock adjusted.`);
      setQuantity("");
      setReason("");
      setCustomReason("");
      onClose();
    } catch (err) {
      showAlert("Error", toUserMessage(err, "Failed to adjust stock. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!product || !canEditInventory) return;
    showConfirm(
      "Confirm Adjustment",
      `${isAdd ? "Add" : "Remove"} ${Math.abs(parsedQuantity)} ${product.unit} ${isAdd ? "to" : "from"} "${product.name}"?\n\nReason: ${note}`,
      () => { void doSubmit(); },
      { confirmLabel: isAdd ? "Add Stock" : "Remove Stock" }
    );
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen && !isSubmitting} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Adjust Stock</Text>
            <TouchableOpacity onPress={onClose}>
              <I.X />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {product && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Product</Text>
                <View style={{ paddingVertical: SP._10 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.gray900 }}>
                    {product.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    Current: {formatQuantityDisplay(product.quantity, isTablet)} {product.unit}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Adjustment Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[styles.toggleBtn, isAdd && styles.toggleBtnActive]}
                  onPress={() => handleSetIsAdd(true)}
                >
                  <Text style={[styles.toggleText, isAdd && styles.toggleTextActive]}>Add (+)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, !isAdd && styles.toggleBtnActive]}
                  onPress={() => handleSetIsAdd(false)}
                >
                  <Text style={[styles.toggleText, !isAdd && styles.toggleTextActive]}>Remove (-)</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Quantity</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={(v) => setQuantity(truncateQuantityDigits(v))}
                autoFocus
              />
              {quantity.length > 0 && errors.quantityChange && (
                <Text style={styles.errorText}>{errors.quantityChange}</Text>
              )}
              {quantity.length > 0 && !errors.quantityChange && exceedsStock && product && (
                <Text style={styles.errorText}>
                  Only {formatQuantityDisplay(product.quantity, isTablet)} {product.unit} available — cannot remove more than current stock.
                </Text>
              )}
            </View>

            <SelectField
              label="Reason (required)"
              value={reason || "Select a reason"}
              options={reasonOptions}
              open={reasonPickerOpen}
              onToggle={() => setReasonPickerOpen((v) => !v)}
              onSelect={(v) => { setReason(v); setReasonPickerOpen(false); }}
            />

            {isOtherReason && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>State reason</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, paddingTop: SP._10 }]}
                  placeholder="e.g., Damaged during transport, spillage, breakage"
                  placeholderTextColor={C.gray400}
                  multiline
                  value={customReason}
                  onChangeText={setCustomReason}
                  maxLength={200}
                />
                {customReason.length > 0 && errors.reason && (
                  <Text style={styles.errorText}>{errors.reason}</Text>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitBtn, (isLoading || !canSubmit || !canEditInventory) && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading || !canSubmit || !canEditInventory}
          >
            <Text style={styles.submitBtnText}>
              {isLoading ? "Adjusting..." : !canEditInventory ? "No permission to adjust stock" : "Confirm Adjustment"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Edit Inventory Item Modal ────────────────────────────────────────────────

interface EditProductModalProps {
  readonly visible: boolean;
  readonly product: Product | null;
  readonly onClose: () => void;
  readonly onSubmit: (data: { productName: string; cost: number; threshold: number; inventoryUnit: InventoryUnit; inventoryCategory: string }) => Promise<void>;
  readonly isLoading: boolean;
}

export function EditProductModal({ visible, product, onClose, onSubmit, isLoading }: EditProductModalProps) {
  const canEditInventory = useCan("canEditInventory");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  // See RestockModal/AdjustModal: hide this Modal while GlobalDialog is up.
  const isDialogOpen = useDialogStore((s) => !!s.dialog);
  const branchInventory = useInventoryStore((s) => s.products).filter((p) => !p.isArchived);
  const [productName, setProductName] = useState("");
  const [cost, setCost] = useState("");
  const [threshold, setThreshold] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("g");
  const [category, setCategory] = useState("other");
  const [openPicker, setOpenPicker] = useState<"category" | "unit" | null>(null);
  const nameError = productName.trim() && branchInventory.some(
    (p) => p.id !== product?.id && p.name.trim().toLowerCase() === productName.trim().toLowerCase()
  ) ? "Already exists." : undefined;

  // Sellable products inherit this stock item's unit, and stock is deducted via
  // convertQuantity(productUnit → inventoryUnit). Switching to a unit the BE
  // can't convert to the current one (e.g. g → pieces) would break those
  // deductions — but only if such products actually exist. So the unit is fully
  // editable (a mistaken "g" on a laundry bag must be fixable), and we only warn
  // when the change crosses conversion families AND products are linked.
  const linkedProducts = useProductsStore((s) => s.products)
    .filter((p) => !p.isArchived && p.inventoryId === product?.id);
  const unitCrossesFamily = !!product && !compatibleUnits(product.unit).includes(unit);

  // Pre-populate fields when modal opens with a product
  useEffect(() => {
    if (product) {
      setProductName(product.name);
      setCost(formatCurrencyInput(product.costPerUnit.toString()));
      setThreshold(product.threshold.toString());
      setUnit(product.unit);
      setCategory(product.category ?? "other");
      setOpenPicker(null);
    }
  }, [product]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async () => {
    if (!canEditInventory || !!nameError) return;
    if (!productName.trim()) {
      showAlert("Missing information", "Item name is required.");
      return;
    }
    const parsedCost = parseCurrencyInput(cost);
    const parsedThreshold = parseFloat(threshold);
    if (isNaN(parsedCost) || parsedCost < 0) {
      showAlert("Invalid cost", "Please enter a valid cost.");
      return;
    }
    if (isNaN(parsedThreshold) || parsedThreshold < 0) {
      showAlert("Invalid threshold", "Please enter a valid threshold (0 or greater).");
      return;
    }

    const save = async () => {
      try {
        await onSubmit({ productName: productName.trim(), cost: parsedCost, threshold: parsedThreshold, inventoryUnit: unit, inventoryCategory: category });
        notify.success("Item updated", `"${productName.trim()}" updated.`);
        onClose();
      } catch (err) {
        showAlert("Error", toUserMessage(err, "Failed to update the item. Please try again."));
      }
    };

    // Cross-family unit change with linked products can silently misdeduct stock
    // until those products' units are corrected — make the user confirm.
    if (unitCrossesFamily && linkedProducts.length > 0) {
      const n = linkedProducts.length;
      showConfirm(
        "Change unit?",
        `${n} sold product${n > 1 ? "s" : ""} linked to "${product?.name}" inherit its unit. Changing from ${product?.unit} to ${unit} can't be auto-converted, so their stock deductions may be wrong until you re-check each product's unit. Continue?`,
        () => { void save(); },
        { confirmLabel: "Change anyway", destructive: true }
      );
      return;
    }
    await save();
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible && !isDialogOpen} transparent animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} onRequestClose={handleClose}>
      <KeyboardAvoidingView style={[styles.modal, isTablet && styles.modalTablet]} behavior="padding">
        <View style={[styles.modalContent, isTablet && styles.modalContentTablet, { paddingBottom: insets.bottom + SP._24 }]}>
          <View style={styles.modalHeader}>
            <View style={{ width: 36 }} />
            <Text style={styles.modalTitle}>Edit Item</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={8} style={styles.modalCloseBtn}>
              <I.X />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Item Name</Text>
              <TextInput
                style={[styles.input, !!nameError && styles.inputError]}
                placeholder="e.g., Laundry Detergent"
                placeholderTextColor={C.gray400}
                value={productName}
                onChangeText={setProductName}
                autoFocus
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
            </View>

            <SelectField
              label="Category"
              value={INVENTORY_CATEGORIES.find((c) => c.value === category)?.label ?? category}
              options={INVENTORY_CATEGORIES.map((c) => c.label)}
              open={openPicker === "category"}
              onToggle={() => setOpenPicker((v) => v === "category" ? null : "category")}
              onSelect={(label) => {
                const found = INVENTORY_CATEGORIES.find((c) => c.label === label);
                setCategory(found?.value ?? label);
                setOpenPicker(null);
              }}
            />

            <SelectField
              label="Unit"
              value={unit}
              options={UNITS_CONSUMABLE}
              open={openPicker === "unit"}
              onToggle={() => setOpenPicker((v) => v === "unit" ? null : "unit")}
              onSelect={(u) => { setUnit(u as InventoryUnit); setOpenPicker(null); }}
            />
            {unitCrossesFamily && linkedProducts.length > 0 && (
              <Text style={[styles.modalDescText, { marginTop: -SP._8, marginBottom: SP._16, color: C.warning700 }]}>
                {linkedProducts.length} linked product{linkedProducts.length > 1 ? "s" : ""} inherit this unit — changing from {product?.unit} to {unit} may require re-checking their units.
              </Text>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cost per Unit (₱)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={cost}
                onChangeText={(v) => setCost(formatCurrencyInput(v))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Low Stock Threshold</Text>
              <TextInput
                style={styles.input}
                placeholder="Alert when below this amount"
                placeholderTextColor={C.gray400}
                keyboardType="decimal-pad"
                value={threshold}
                onChangeText={(v) => setThreshold(truncateQuantityDigits(v))}
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.submitBtn, (isLoading || !canEditInventory || !!nameError) && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={isLoading || !canEditInventory || !!nameError}
          >
            <Text style={styles.submitBtnText}>{isLoading ? "Saving..." : !canEditInventory ? "No permission to edit" : "Save Changes"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
