// Shift banner + shift selector modal (staff shift start/end). Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, SP } from "../../theme/tokens";
import { showConfirm } from "../../lib/dialog";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useAuthStore } from "../../stores/authStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useNotificationStore } from "../../stores/notificationStore";
import { useQueueStore } from "../../stores/queueStore";
import { useStaffPinStore } from "../../stores/staffPinStore";
import { Icon } from "./shared";
import { S } from "./styles";
import { CashDrawerModal } from "./CashDrawerModal";

export function ShiftBanner() {
  const { activeStaff, endShift, showSelector, staffList, loadStaffList } =
    useActiveStaffStore();
  const { merchantId, role } = useAuthStore((s) => ({ merchantId: s.merchantId, role: s.role }));
  const orders = useQueueStore((s) => s.orders);

  const [showDrawer, setShowDrawer] = useState(false);

  useEffect(() => {
    if (merchantId && role === "MERCHANT") loadStaffList(merchantId);
  }, [merchantId, role, loadStaffList]);

  const shiftStartedAt = useActiveStaffStore((s) => s.shiftStartedAt);
  const cashSalesTotal = orders
    .filter((o) => {
      const isPaidCash = (o as any).paymentMethod === "CASH";
      if (!isPaidCash) return false;
      if (!shiftStartedAt) return true;
      const ts = (o.createdAt as any)?.toDate?.() ?? new Date(((o.createdAt as any)?.seconds || 0) * 1000);
      return ts >= shiftStartedAt;
    })
    .reduce((sum, o) => sum + ((o as any).totalAmount ?? 0), 0);

  const handleEndShift = () => {
    if (!merchantId) return;
    showConfirm(
      "End Shift",
      `End ${activeStaff?.name ?? "current"} shift and return to owner mode?`,
      () => { void endShift(merchantId); },
      { confirmLabel: "End Shift" }
    );
  };

  if (!activeStaff) {
    if (staffList.length === 0) return null;
    return (
      <TouchableOpacity style={S.shiftBannerEmpty} onPress={showSelector} activeOpacity={0.85}>
        <Icon.User c={C.gray500} />
        <Text style={S.shiftBannerEmptyText}>Shift not started — tap to start</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <View style={S.shiftBannerActive}>
        <View style={S.shiftBannerLeft}>
          <View style={S.shiftAvatarDot} />
          <View>
            <Text style={S.shiftBannerName}>{activeStaff.name}</Text>
            <Text style={S.shiftBannerRole}>{activeStaff.role} on shift</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: SP._8 }}>
          <TouchableOpacity
            style={[S.shiftEndBtn, { borderColor: "rgba(255,255,255,0.25)", paddingHorizontal: SP._10 }]}
            onPress={() => setShowDrawer(true)}
            activeOpacity={0.8}
            hitSlop={8}
          >
            <Text style={S.shiftEndBtnText}>Drawer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={S.shiftEndBtn}
            onPress={handleEndShift}
            activeOpacity={0.8}
            hitSlop={8}
          >
            <Text style={S.shiftEndBtnText}>End Shift</Text>
          </TouchableOpacity>
        </View>
      </View>
      <CashDrawerModal
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        cashSalesTotal={cashSalesTotal}
      />
    </>
  );
}

// ─── Shift selector modal ──────────────────────────────────────────────────────
export function ShiftSelectorModal() {
  const { staffList, selectorVisible, hideSelector, startShift, loadStaffList, setStartingCash } =
    useActiveStaffStore();
  const { merchantId } = useAuthStore((s) => ({ merchantId: s.merchantId }));
  const push = useNotificationStore((s) => s.push);
  const insets = useSafeAreaInsets();

  const { width: _sw, height: _sh } = useWindowDimensions();
  const isShiftLandscape = _sw > _sh;

  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startingCashInput, setStartingCashInput] = useState("");
  const [pinInput, setPinInput] = useState("");

  useEffect(() => {
    if (selectorVisible && merchantId) {
      loadStaffList(merchantId);
      setSelected(null);
      setStartingCashInput("");
      setPinInput("");
    }
  }, [selectorVisible, merchantId, loadStaffList]);

  const currentBranchId = useMerchantStore.getState().selectedBranchId;
  const activeStaffList = staffList.filter((s) => {
    if (!s.isActive || s.isArchived) return false;
    // Couriers share the merchant's staff roster but hold no POS permissions —
    // starting a shift as one would leave the terminal with nothing enabled.
    if (s.role === "COURIER") return false;
    if (!s.branchIds || s.branchIds.length === 0) return true;
    return currentBranchId ? s.branchIds.includes(currentBranchId) : true;
  });

  const handleStart = async () => {
    const staff = activeStaffList.find((s) => s.id === selected);
    if (!staff) { push({ type: "error", title: "No staff selected", message: "Tap a name first." }); return; }
    if (!merchantId) return;
    const { hasPin, verifyPin } = useStaffPinStore.getState();
    if (hasPin(selected!) && !(await verifyPin(selected!, pinInput))) {
      push({ type: "error", title: "Incorrect PIN", message: "Enter the correct 4-digit PIN." });
      return;
    }
    setBusy(true);
    const result = await startShift(staff, merchantId, currentBranchId ?? null);
    if (result.success) {
      const cash = Number.parseFloat(startingCashInput) || 0;
      setStartingCash(cash);
    }
    setBusy(false);
    if (!result.success) {
      push({ type: "error", title: "Error", message: result.error ?? "Could not start shift." });
    }
  };

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={selectorVisible} transparent statusBarTranslucent animationType="slide" onRequestClose={hideSelector}>
      <View style={[S.shiftModalBackdrop, isShiftLandscape && { justifyContent: "center" }]}>
        <TouchableOpacity style={isShiftLandscape ? StyleSheet.absoluteFillObject : { flex: 1 }} onPress={hideSelector} activeOpacity={1} />
        <View style={isShiftLandscape ? S.sheetLandscapeWrapper : undefined}>
          <View style={[S.shiftModalSheet, { paddingBottom: Math.max(insets.bottom, SP._16) }, isShiftLandscape && S.sheetLandscape]}>
            <View style={S.shiftModalHandle} />
            <Text style={S.shiftModalTitle}>Start Shift</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SP._16 }}>
              <View style={{ flexDirection: "row", gap: SP._8, paddingHorizontal: SP._16 }}>
                {activeStaffList.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[
                      S.shiftStaffChip,
                      selected === s.id && S.shiftStaffChipOn,
                    ]}
                    onPress={() => { setSelected(s.id); setPinInput(""); }}
                    activeOpacity={0.8}
                  >
                    <View style={[S.shiftStaffAvatar, { backgroundColor: selected === s.id ? C.brand500 : C.gray200 }]}>
                      <Text style={[S.shiftStaffAvatarText, { color: selected === s.id ? C.white : C.gray600 }]}>
                        {(s.name || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[S.shiftStaffName, selected === s.id && { color: C.brand700 }]}>{s.name}</Text>
                    <Text style={S.shiftStaffRole}>{s.role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {selected && useStaffPinStore.getState().hasPin(selected) && (
              <View style={{ paddingHorizontal: SP._16, marginBottom: SP._12 }}>
                <Text style={S.shiftModalLabel}>Enter PIN</Text>
                <TextInput
                  style={S.shiftPinInput}
                  value={pinInput}
                  onChangeText={(v) => setPinInput(v.replace(/\D/g, "").slice(0, 4))}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  placeholder="••••"
                  placeholderTextColor={C.gray400}
                />
              </View>
            )}

            <View style={{ paddingHorizontal: SP._16, marginBottom: SP._12 }}>
              <Text style={S.shiftModalLabel}>Starting Cash in Drawer (₱) (optional)</Text>
              <TextInput
                style={S.cashInput}
                placeholder="0.00"
                value={startingCashInput}
                onChangeText={setStartingCashInput}
                keyboardType="decimal-pad"
                placeholderTextColor={C.gray400}
              />
            </View>

            <View style={{ padding: SP._16 }}>
              <TouchableOpacity
                style={[S.shiftStartBtn, (!selected || busy) && { opacity: 0.5 }]}
                onPress={() => void handleStart()}
                disabled={!selected || busy}
                activeOpacity={0.85}
              >
                {busy
                  ? <ActivityIndicator color={C.white} />
                  : <Text style={S.shiftStartBtnText}>Start Shift</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Cash Drawer Modal ────────────────────────────────────────────────────────
