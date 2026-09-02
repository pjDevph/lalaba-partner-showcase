// src/stores/printerStore.ts
// Persisted print & slip settings.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaperWidth = "58mm" | "72mm" | "80mm";

export type DocumentLabel =
  | "Transaction Slip"
  | "Customer Claim Slip"
  | "Order Slip"
  | "Payment Acknowledgment"
  | "Invoice";

interface PrinterState {
  // ── Printer setup
  paperWidth: PaperWidth;

  // ── Business info printed on receipt (overrides merchant profile defaults)
  businessName:    string;
  businessAddress: string;
  businessPhone:   string;

  // ── Document labels
  documentLabel:     DocumentLabel;
  customerCopyLabel: string; // printed header for customer section
  merchantCopyLabel: string; // printed header for merchant section
  footerText:        string; // disclaimer / footer on customer copy

  // ── Fields on merchant copy
  showClaimCodeOnMerchant:   boolean;
  showCustomerPhone:         boolean;
  showCashierName:           boolean;
  showBranchName:            boolean;
  showPickupInstructions:    boolean;

  // ── Claim code display size
  claimCodeSize: "large" | "medium" | "small";

  // ── Tax / compliance mode
  taxModeEnabled: boolean;

  // ── Actions
  setPaperWidth:            (w: PaperWidth)    => void;
  setBusinessName:          (s: string)        => void;
  setBusinessAddress:       (s: string)        => void;
  setBusinessPhone:         (s: string)        => void;
  setDocumentLabel:         (l: DocumentLabel) => void;
  setCustomerCopyLabel:     (s: string)        => void;
  setMerchantCopyLabel:     (s: string)        => void;
  setFooterText:            (s: string)        => void;
  setShowClaimCodeOnMerchant: (v: boolean)     => void;
  setShowCustomerPhone:     (v: boolean)       => void;
  setShowCashierName:       (v: boolean)       => void;
  setShowBranchName:        (v: boolean)       => void;
  setShowPickupInstructions:(v: boolean)       => void;
  setClaimCodeSize:         (s: "large" | "medium" | "small") => void;
  setTaxModeEnabled:        (v: boolean)       => void;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      paperWidth:    "58mm",

      businessName:    "",
      businessAddress: "",
      businessPhone:   "",

      documentLabel:     "Transaction Slip",
      customerCopyLabel: "CUSTOMER CLAIM SLIP",
      merchantCopyLabel: "MERCHANT COPY",
      footerText:
        "This document is a transaction slip for order tracking and pickup verification. " +
        "It is not an official invoice or tax receipt.",

      showClaimCodeOnMerchant:  true,
      showCustomerPhone:        false,
      showCashierName:          true,
      showBranchName:           true,
      showPickupInstructions:   true,

      claimCodeSize: "large",
      taxModeEnabled: false,

      setPaperWidth:            (paperWidth)            => set({ paperWidth }),
      setBusinessName:          (businessName)          => set({ businessName }),
      setBusinessAddress:       (businessAddress)       => set({ businessAddress }),
      setBusinessPhone:         (businessPhone)         => set({ businessPhone }),
      setDocumentLabel:         (documentLabel)         => set({ documentLabel }),
      setCustomerCopyLabel:     (customerCopyLabel)     => set({ customerCopyLabel }),
      setMerchantCopyLabel:     (merchantCopyLabel)     => set({ merchantCopyLabel }),
      setFooterText:            (footerText)            => set({ footerText }),
      setShowClaimCodeOnMerchant: (v)                  => set({ showClaimCodeOnMerchant: v }),
      setShowCustomerPhone:     (showCustomerPhone)     => set({ showCustomerPhone }),
      setShowCashierName:       (showCashierName)       => set({ showCashierName }),
      setShowBranchName:        (showBranchName)        => set({ showBranchName }),
      setShowPickupInstructions:(showPickupInstructions)=> set({ showPickupInstructions }),
      setClaimCodeSize:         (claimCodeSize)         => set({ claimCodeSize }),
      setTaxModeEnabled:        (taxModeEnabled)        => set({ taxModeEnabled }),
    }),
    {
      name:    "lalaba-printer-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
