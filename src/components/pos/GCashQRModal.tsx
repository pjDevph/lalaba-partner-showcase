// src/components/pos/GCashQRModal.tsx
// Shows the merchant's personal GCash QR image for customer payment.
// Staff taps "GCash Received" to confirm — no Xendit API call in Phase 1A.

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface GCashQRModalProps {
  visible: boolean;
  gcashQrUrl: string | null;
  totalAmount: number;
  onConfirmReceived: (referenceId?: string) => void;
  onCancel: () => void;
}

export function GCashQRModal({
  visible,
  gcashQrUrl,
  totalAmount,
  onConfirmReceived,
  onCancel,
}: Readonly<GCashQRModalProps>) {
  const [refInput, setRefInput] = useState("");

  const handleConfirm = () => {
    onConfirmReceived(refInput.trim() || undefined);
    setRefInput("");
  };

  const handleCancel = () => {
    setRefInput("");
    onCancel();
  };

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>GCash Payment</Text>
          <TouchableOpacity onPress={handleCancel} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Amount */}
        <View style={styles.amountBadge}>
          <Text style={styles.amountLabel}>Amount to Pay</Text>
          <Text style={styles.amountValue}>₱{totalAmount.toFixed(2)}</Text>
        </View>

        {/* QR Code */}
        <View style={styles.qrContainer}>
          {gcashQrUrl ? (
            <Image
              source={{ uri: gcashQrUrl }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              <ActivityIndicator color="#0ea5e9" />
              <Text style={styles.qrPlaceholderText}>
                GCash QR not configured.{"\n"}Please add it in Merchant Settings.
              </Text>
            </View>
          )}
        </View>

        {/* Instructions */}
        <Text style={styles.instructions}>
          Ask customer to scan the QR code and send exactly{" "}
          <Text style={styles.instructionsBold}>₱{totalAmount.toFixed(2)}</Text>.
          {"\n"}Verify the payment in your GCash app, then tap &quot;GCash Received&quot;.
        </Text>

        {/* Reference number (optional) */}
        <TextInput
          style={styles.refInput}
          placeholder="GCash reference # (optional)"
          placeholderTextColor="#9ca3af"
          value={refInput}
          onChangeText={setRefInput}
          autoCapitalize="characters"
        />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.btnConfirm} onPress={handleConfirm}>
            <Text style={styles.btnConfirmText}>GCash Received ✓</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnCancel} onPress={handleCancel}>
            <Text style={styles.btnCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: { padding: 8 },
  closeBtnText: { fontSize: 18, color: "#6b7280" },
  amountBadge: {
    backgroundColor: "#0ea5e9",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  amountLabel: {
    color: "#bae6fd",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  amountValue: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "800",
    marginTop: 4,
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  qrImage: {
    width: 240,
    height: 240,
    borderRadius: 12,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 24,
  },
  qrPlaceholderText: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 18,
  },
  instructions: {
    fontSize: 14,
    color: "#374151",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  refInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    marginBottom: 20,
  },
  instructionsBold: {
    fontWeight: "700",
    color: "#0ea5e9",
  },
  actions: {
    gap: 12,
  },
  btnConfirm: {
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnConfirmText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnCancel: {
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnCancelText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
});
