// src/utils/printReceipt.ts
// Shared type describing the data needed to render a receipt (customer + merchant copies).

import type { CreatePOSOrderResponse } from "../types/pos.types";
import type { GqlOrder } from "../services/graphql/orders";
import type { PaperWidth } from "../stores/printerStore";

export type PrintCopyType = "both" | "customer" | "merchant";

export interface ReceiptOptions {
  order:            CreatePOSOrderResponse;
  orderFull:        GqlOrder | null;
  copyType:         PrintCopyType;
  cashierName?:     string;
  businessName?:    string;
  businessPhone?:   string;
  businessAddress?: string;
  branchName?:      string;
  paperWidth:       PaperWidth;
  // label settings
  documentLabel:         string;
  customerCopyLabel:     string;
  merchantCopyLabel:     string;
  footerText:            string;
  claimCodeSize:         "large" | "medium" | "small";
  paymentMethod?:   string;
  amountReceived?:  number;
  // field toggles
  showClaimCodeOnMerchant:  boolean;
  showCustomerPhone:        boolean;
  showCashierName:          boolean;
  showBranchName:           boolean;
  showPickupInstructions:   boolean;
  // tax
  taxModeEnabled: boolean;
}
