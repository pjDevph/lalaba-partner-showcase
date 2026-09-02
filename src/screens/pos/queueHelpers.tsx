// Shared POS queue/claim helpers — waiting-time label + receipt download hook.
import { useState, useCallback } from "react";
import * as Sharing from "expo-sharing";
import { useNotificationStore } from "../../stores/notificationStore";
import { usePrinterStore } from "../../stores/printerStore";
import { useMerchantStore } from "../../stores/merchantStore";
import { useActiveStaffStore } from "../../stores/activeStaffStore";
import { useAuthStore } from "../../stores/authStore";
import { useReceiptImageCapture } from "../../hooks/useReceiptImageCapture";
import type { POSOrder, CreatePOSOrderResponse } from "../../types/pos.types";
import type { GqlOrder } from "../../services/graphql/orders";
import { toUserMessage } from "../../utils/userError";

export function getWaitingTime(createdAt: any): string {
  const ts = createdAt as any;
  const date = ts?.toDate?.() ?? (ts?.seconds ? new Date(ts.seconds * 1000) : null);
  if (!date) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function posOrderAsGql(o: POSOrder): GqlOrder {
  const ts = o.createdAt as any;
  const iso = ts?.toDate?.()?.toISOString?.()
    ?? (ts?.seconds ? new Date(ts.seconds * 1000).toISOString() : new Date().toISOString());
  return {
    _id:            o.id,
    claimCode:      o.claimCode,
    orderNumber:    (o as any).orderNumber ?? "",
    walkinCustomer: o.walkinCustomer ?? {},
    items:          (o.items ?? []).map((it) => ({
      serviceId:   it.serviceId,
      serviceName: it.serviceName ?? it.productName ?? "",
      quantity:    it.weightKg ?? 1,
      unitPrice:   it.unitPrice ?? 0,
      subtotal:    it.lineTotal ?? 0,
    })),
    subtotal:       o.subtotal,
    discountAmount: o.discountAmount ?? 0,
    discountCode:   o.discountCode,
    total:          o.totalAmount,
    change:         o.changeGiven,
    paymentMethod:  o.paymentMethod,
    amountReceived: o.amountReceived,
    status:         o.status,
    notes:          o.notes,
    createdAt:      iso,
    updatedAt:      iso,
  } as unknown as GqlOrder;
}

// ─── Receipt download ────────────────────────────────────────────────────────
// Captures a combined claim-slip + merchant-copy receipt as a PNG image for a
// past order and hands it to the OS share sheet (save to device or send via
// any app) — no physical printer required. Replaces the old "Reprint" flow.
// Renders the receipt off-screen via `hiddenReceipt`; callers must include it
// in their own JSX tree for the capture to work.
export function useReceiptDownload() {
  const push = useNotificationStore((s) => s.push);
  const printerStore = usePrinterStore();
  const merchant = useMerchantStore((s) => s.profile);
  const branches = useMerchantStore((s) => s.branches);
  const selectedBranchId = useMerchantStore((s) => s.selectedBranchId);
  const { getActor } = useActiveStaffStore();
  const { user } = useAuthStore((s) => ({ user: s.user }));
  const merchantId = useAuthStore((s) => s.merchantId);
  const [downloading, setDownloading] = useState(false);
  const { captureReceipt, hiddenReceipt } = useReceiptImageCapture();

  const download = useCallback(async (order: POSOrder) => {
    setDownloading(true);
    try {
      const branch = branches.find((b) => b.id === selectedBranchId);
      const cashierName = getActor({ id: user?.uid ?? merchantId ?? "owner", name: user?.displayName ?? "Owner" }).name;
      const orderResp: CreatePOSOrderResponse = {
        orderId: order.id, claimCode: order.claimCode,
        totalAmount: order.totalAmount, amountReceived: order.amountReceived ?? 0,
        changeGiven: order.changeGiven, paymentMethod: order.paymentMethod ?? "cash", status: "CREATED",
      };
      const uri = await captureReceipt({
        order: orderResp,
        orderFull: posOrderAsGql(order),
        copyType: "both",
        cashierName,
        businessName: printerStore.businessName || merchant?.businessName || "LALABA LAUNDRY",
        businessAddress: printerStore.businessAddress,
        businessPhone: printerStore.businessPhone,
        branchName: branch?.name ?? "",
        paperWidth: printerStore.paperWidth,
        documentLabel: printerStore.documentLabel,
        customerCopyLabel: printerStore.customerCopyLabel,
        merchantCopyLabel: printerStore.merchantCopyLabel,
        footerText: printerStore.footerText,
        claimCodeSize: printerStore.claimCodeSize,
        showClaimCodeOnMerchant: printerStore.showClaimCodeOnMerchant,
        showCustomerPhone: printerStore.showCustomerPhone,
        showCashierName: printerStore.showCashierName,
        showBranchName: printerStore.showBranchName,
        showPickupInstructions: printerStore.showPickupInstructions,
        taxModeEnabled: printerStore.taxModeEnabled,
        paymentMethod: order.paymentMethod,
        amountReceived: order.amountReceived,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Save Receipt" });
      }
      push({ type: "success", title: "Receipt ready", message: canShare ? undefined : `Saved: ${uri}` });
    } catch (err: unknown) {
      push({ type: "error", title: "Download failed", message: toUserMessage(err, "Try again.") });
    } finally {
      setDownloading(false);
    }
  }, [branches, selectedBranchId, getActor, user, merchantId, printerStore, merchant, push, captureReceipt]);

  return { download, downloading, hiddenReceipt };
}
