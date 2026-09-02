// POS status banners — pending offline queue, network pill, offline/reconnected. Extracted from pos.tsx.
import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { C } from "../../theme/tokens";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { useOfflineQueueStore } from "../../stores/offlineQueueStore";

export function PendingQueueBanner() {
  const pending    = useOfflineQueueStore((s) => s.pending);
  const isFlushing = useOfflineQueueStore((s) => s.isFlushing);
  if (pending.length === 0) return null;
  const orderSuffix = pending.length > 1 ? "s" : "";
  return (
    <View style={pendingBannerStyle}>
      {isFlushing
        ? <ActivityIndicator size="small" color="#92400E" />
        : <Text style={pendingBadge}>{pending.length}</Text>
      }
      <Text style={pendingBannerText}>
        {isFlushing
          ? `Syncing ${pending.length} offline order${orderSuffix}…`
          : `${pending.length} order${orderSuffix} queued offline — will sync when connected`
        }
      </Text>
    </View>
  );
}
const pendingBannerStyle = {
  backgroundColor: "#FEF3C7",
  paddingVertical: 6,
  paddingHorizontal: 16,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
};
const pendingBadge = {
  backgroundColor: "#D97706",
  color: "#FFFFFF",
  fontSize: 11,
  fontWeight: "700" as const,
  borderRadius: 10,
  paddingHorizontal: 6,
  paddingVertical: 1,
  minWidth: 20,
  textAlign: "center" as const,
};
const pendingBannerText = {
  fontSize: 12,
  fontWeight: "600" as const,
  color: "#92400E",
  flex: 1,
};

// ─── Network status pill (always-visible dot in the POS header) ──────────────
// Shows ● Offline / ● Syncing / ● Online so the cashier always knows the state.
export function NetworkStatusPill() {
  const { isOffline } = useNetworkStatus();
  const pending    = useOfflineQueueStore((s) => s.pending);
  const isFlushing = useOfflineQueueStore((s) => s.isFlushing);

  const isSyncing = !isOffline && (isFlushing || pending.length > 0);

  const dotColor = isOffline ? "#FCA5A5" : isSyncing ? "#FCD34D" : "#86EFAC";
  const onlineLabel = isSyncing ? "Syncing…" : "Online";
  const label = isOffline ? "Offline" : onlineLabel;

  return (
    <View style={netPill.wrap}>
      <View style={[netPill.dot, { backgroundColor: dotColor }]} />
      <Text style={netPill.label}>{label}</Text>
    </View>
  );
}
const netPill = {
  wrap:  { flexDirection: "row" as const, alignItems: "center" as const, gap: 5 },
  dot:   { width: 7, height: 7, borderRadius: 3.5 },
  label: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.2, color: "rgba(255,255,255,0.9)" as const },
};

// ─── Offline banner ───────────────────────────────────────────────────────────
export function OfflineBanner() {
  const { isOffline, justReconnected } = useNetworkStatus();
  if (!isOffline && !justReconnected) return null;
  return (
    <View style={offlineBannerStyle(isOffline)}>
      <Text style={offlineBannerText(isOffline)}>
        {isOffline ? "⚠ No internet connection — orders will be queued offline" : "✓ Back online"}
      </Text>
    </View>
  );
}
function offlineBannerStyle(offline: boolean) {
  return {
    backgroundColor: offline ? C.error100 : "#DCFCE7",
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center" as const,
  };
}
function offlineBannerText(offline: boolean) {
  return {
    fontSize: 13,
    fontWeight: "600" as const,
    color: offline ? C.error700 : "#15803D",
    letterSpacing: 0.1,
  };
}
