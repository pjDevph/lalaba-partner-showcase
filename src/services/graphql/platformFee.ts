// src/services/graphql/platformFee.ts
// What the platform charges the signed-in provider, and who actually pays it.

import { graphqlRequest } from "../../config/graphql";

/** Who bears the commission. Mirrors the backend FeeChargedTo enum. */
export type FeeChargedTo = "CUSTOMER" | "PROVIDER" | "SPLIT";

export type FeeCalculationType =
  | "FIXED"
  | "PERCENTAGE"
  | "FIXED_PLUS_PERCENTAGE";

export interface EffectiveCommission {
  /** 10 means 10%. */
  percent: number;
  chargedTo: FeeChargedTo;
  calculationType: FeeCalculationType;
  /**
   * False when no commission rule is configured and the platform fallback is
   * being reported. Show the rate, but don't present it as a quotable term or
   * compute a net from it.
   */
  isConfigured: boolean;
}

/**
 * The commission this provider is on right now.
 *
 * Replaces reading `currentPlatformFeePercent` and assuming the customer pays
 * it on top. Both seeded rules happen to work that way, but `chargedTo` is
 * admin-editable and the backend already prices PROVIDER — so an app that
 * assumes would eventually tell a provider the opposite of the truth about
 * their own money.
 *
 * `providerType` is required: merchant and washer rates can legitimately
 * diverge, and defaulting would quietly answer with the wrong one.
 */
export async function gqlMyEffectiveCommission(
  providerType: "MERCHANT" | "WASHER",
): Promise<EffectiveCommission> {
  const data = await graphqlRequest<{
    myEffectiveCommission: EffectiveCommission;
  }>(
    `query MyEffectiveCommission($providerType: ProviderType!) {
       myEffectiveCommission(providerType: $providerType) {
         percent
         chargedTo
         calculationType
         isConfigured
       }
     }`,
    { providerType },
  );
  return data.myEffectiveCommission;
}

/** Peso-formatted breakdown of what a price means once commission applies. */
export function commissionBreakdown(
  price: number,
  commission: EffectiveCommission | null,
): {
  customerPays: number;
  providerReceives: number;
  feeAmount: number;
  /** True when the split is knowable — false for SPLIT or a non-percentage rule. */
  isQuotable: boolean;
} | null {
  if (!commission || !(price > 0)) return null;

  const feeAmount = (price * commission.percent) / 100;

  if (commission.chargedTo === "CUSTOMER") {
    // Added on top: the provider keeps their price in full.
    return {
      customerPays: price + feeAmount,
      providerReceives: price,
      feeAmount,
      isQuotable: commission.calculationType === "PERCENTAGE",
    };
  }

  if (commission.chargedTo === "PROVIDER") {
    // Deducted: the customer pays the listed price, the provider receives less.
    return {
      customerPays: price,
      providerReceives: price - feeAmount,
      feeAmount,
      isQuotable: commission.calculationType === "PERCENTAGE",
    };
  }

  // SPLIT — the proportions aren't exposed, so show the rate and decline to
  // imply a net rather than guess one.
  return {
    customerPays: price,
    providerReceives: price,
    feeAmount,
    isQuotable: false,
  };
}
