// Add/edit customer drawer for a walk-in order. Extracted from pos.tsx.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { PH_MOBILE_RE, truncatePhoneDigits, phoneFormatError, emailSchema } from "../../lib/validation";
import { notify } from "../../stores/notificationStore";
import type { POSOrder } from "../../types/pos.types";
import { Icon } from "./shared";
import { P, S } from "./styles";

export function AddCustomerDrawer({ visible, initial, onClose, onSave, recentOrders = [], isDelivery = false }: Readonly<{
  visible: boolean;
  initial: { readonly name?: string; readonly phone?: string; readonly email?: string; readonly address?: string };
  onClose: () => void;
  onSave: (c: { readonly name: string; readonly phone: string; readonly email?: string; readonly address?: string }) => void;
  recentOrders?: POSOrder[];
  isDelivery?: boolean;
}>) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [addressError, setAddressError] = useState("");
  useEffect(() => {
    if (visible) {
      setName(initial.name ?? ""); setPhone(initial.phone ?? "");
      setEmail(initial.email ?? ""); setAddress(initial.address ?? "");
      setCustSearch("");
      setNameError(""); setPhoneError(""); setEmailError(""); setAddressError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const isNameValid = name.trim().length > 0;
  const isPhoneValid = PH_MOBILE_RE.test(phone.trim());
  const isEmailValid = !email.trim() || emailSchema.safeParse(email.trim()).success;
  const isAddressValid = !isDelivery || address.trim().length > 0;
  const canSave = isNameValid && isPhoneValid && isEmailValid && isAddressValid;

  // Deduplicated recent customers from order history
  const recentCustomers = React.useMemo(() => {
    const seen = new Map<string, { name: string; phone: string; count: number }>();
    for (const o of recentOrders) {
      const n = o.walkinCustomer?.name?.trim();
      const p = o.walkinCustomer?.phone?.trim();
      if (!n || !p) continue;
      const key = p;
      const prev = seen.get(key);
      seen.set(key, { name: n, phone: p, count: (prev?.count ?? 0) + 1 });
    }
    return Array.from(seen.values()).slice(0, 20);
  }, [recentOrders]);

  const filteredCustomers = custSearch.trim()
    ? recentCustomers.filter(
        (c) =>
          c.name.toLowerCase().includes(custSearch.toLowerCase()) ||
          c.phone.includes(custSearch)
      )
    : recentCustomers;

  const save = () => {
    setNameError(isNameValid ? "" : "Customer name is required.");
    setPhoneError(isPhoneValid ? "" : "Enter a valid mobile number (e.g. 09171234567 or 639171234567).");
    setEmailError(isEmailValid ? "" : "Enter a valid email address.");
    setAddressError(isAddressValid ? "" : "A delivery address is required for delivery orders.");
    if (!canSave) return;
    onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() || undefined, address: address.trim() || undefined });
    notify.success(`"${name.trim()}" saved as customer.`);
    onClose();
  };
  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={S.drawerBackdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView style={S.drawer} behavior="padding">
          <View style={[S.drawerHeader, { paddingTop: SP._16 + insets.top }]}>
            <View style={{ flex: 1 }}>
              <Text style={S.drawerTitle}>Add Customer</Text>
              <Text style={S.drawerSub}>For claim ticket / receipt details</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={{ paddingHorizontal: 4 }}><Ionicons name="close" size={18} color={P.muted} /></TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: SP._16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Recent customers lookup */}
            {recentCustomers.length > 0 && (
              <View style={{ marginBottom: SP._16 }}>
                <Text style={[S.fLabel, { marginBottom: SP._6 }]}>Recent Customers</Text>
                <View style={[S.searchRow, { marginBottom: SP._8 }]}>
                  <Icon.Search />
                  <TextInput
                    style={[S.searchInput, { flex: 1 }]}
                    placeholder="Search name or phone..."
                    value={custSearch}
                    onChangeText={setCustSearch}
                    placeholderTextColor={P.muted}
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SP._16, paddingHorizontal: SP._16 }}>
                  <View style={{ flexDirection: "row", gap: SP._8 }}>
                    {filteredCustomers.map((c) => (
                      <TouchableOpacity
                        key={c.phone}
                        style={[S.shiftStaffChip, { minWidth: 120, maxWidth: 180 }]}
                        onPress={() => { setName(c.name); setPhone(c.phone); }}
                        activeOpacity={0.8}
                      >
                        <View style={[S.shiftStaffAvatar, { backgroundColor: C.brand100 }]}>
                          <Text style={[S.shiftStaffAvatarText, { color: C.brand700 }]}>{c.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <Text style={S.shiftStaffName} numberOfLines={1}>{c.name}</Text>
                        <Text style={S.shiftStaffRole}>{c.phone} · {c.count}×</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={{ height: 1, backgroundColor: P.border, marginVertical: SP._12 }} />
              </View>
            )}

            <Text style={S.fLabel}>Customer Name *</Text>
            <TextInput
              style={[S.fInput, !!nameError && { borderColor: P.errorRed }]}
              placeholder="Enter customer name"
              placeholderTextColor={P.muted}
              value={name}
              onChangeText={(v) => { setName(v); if (v.trim()) setNameError(""); }}
              onBlur={() => { if (!name.trim()) setNameError("Customer name is required."); }}
            />
            {!!nameError && <Text style={S.cashError}>{nameError}</Text>}
            <Text style={S.fLabel}>Mobile Number *</Text>
            <TextInput
              style={[S.fInput, !!phoneError && { borderColor: P.errorRed }]}
              placeholder="09XX-XXX-XXXX or 639XX-XXX-XXXX"
              placeholderTextColor={P.muted}
              value={phone}
              onChangeText={(v) => {
                const digits = truncatePhoneDigits(v);
                setPhone(digits);
                setPhoneError(phoneFormatError(digits));
              }}
              onBlur={() => {
                if (phone && !PH_MOBILE_RE.test(phone)) {
                  setPhoneError("Enter a valid mobile number (e.g. 09171234567 or 639171234567).");
                }
              }}
              keyboardType="phone-pad"
              maxLength={phone.startsWith("6") ? 12 : 11}
            />
            {!!phoneError && <Text style={S.cashError}>{phoneError}</Text>}
            <Text style={S.fLabel}>Email Address (optional)</Text>
            <TextInput
              style={[S.fInput, !!emailError && { borderColor: P.errorRed }]}
              placeholder="Enter email address"
              placeholderTextColor={P.muted}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                const trimmed = v.trim();
                setEmailError(trimmed && !emailSchema.safeParse(trimmed).success ? "Enter a valid email address." : "");
              }}
              onBlur={() => {
                const trimmed = email.trim();
                if (trimmed && !emailSchema.safeParse(trimmed).success) {
                  setEmailError("Enter a valid email address.");
                }
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!emailError && <Text style={S.cashError}>{emailError}</Text>}
            <Text style={S.fLabel}>{isDelivery ? "Delivery Address *" : "Address / Notes (optional)"}</Text>
            <TextInput
              style={[S.fInput, { height: 70, textAlignVertical: "top", paddingTop: 10 }, !!addressError && { borderColor: P.errorRed }]}
              placeholder={isDelivery ? "Enter delivery address" : "Enter address or notes"}
              placeholderTextColor={P.muted}
              value={address}
              onChangeText={(v) => { setAddress(v); if (!isDelivery || v.trim()) setAddressError(""); }}
              onBlur={() => { if (isDelivery && !address.trim()) setAddressError("A delivery address is required for delivery orders."); }}
              multiline
            />
            {!!addressError && <Text style={S.cashError}>{addressError}</Text>}
          </ScrollView>
          <View style={[S.drawerFooter, { paddingBottom: SP._16 + insets.bottom }]}>
            <TouchableOpacity style={S.drawerCancel} onPress={onClose} activeOpacity={0.8}><Text style={S.drawerCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity
              style={[S.drawerSave, !canSave && S.drawerSaveDisabled]}
              onPress={save}
              activeOpacity={0.85}
              disabled={!canSave}
            >
              <Text style={S.drawerSaveText}>Save Customer</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
