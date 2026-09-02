// src/components/PartnerFeeBreakdown.tsx
// What Lalaba charges on this order, and what the provider keeps.
//
// PRESENTATION ONLY. Every figure is read from the order snapshot the backend
// wrote; nothing here recomputes a fee, applies a percentage, or decides what
// a promotion was worth. The one subtraction is `gross − discount`, which is
// the same arithmetic the wallet does and is shown so the rows add up on
// screen.
//
// This exists because a partner incentive was previously invisible: the fee
// was simply not charged, and the provider had no way to see that Lalaba had
// paid it. It also answers the support question that follows a waived order —
// "why did Lalaba still deduct ₱5 when I had free platform fee?" — because the
// penalty is a row of its own rather than folded into one number.

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../theme/tokens";
import { pesos } from "../services/graphql/onlineOrders";
import type { GqlOnlineOrder } from "../services/graphql/onlineOrders";

type Pricing = GqlOnlineOrder["pricing"];

function Row({
  label,
  value,
  tone = "normal",
  strong = false,
}: Readonly<{
  label: string;
  value: string;
  tone?: "normal" | "credit" | "muted";
  strong?: boolean;
}>) {
  const color =
    tone === "credit" ? C.success700 : tone === "muted" ? C.gray500 : C.gray800;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, strong && styles.strong, { color }]}>
        {label}
      </Text>
      <Text style={[styles.value, strong && styles.strong, { color }]}>
        {value}
      </Text>
    </View>
  );
}

export function PartnerFeeBreakdown({
  pricing,
}: Readonly<{ pricing: Pricing }>) {
  const gross = pricing.platformFeeCentavos ?? 0;
  // Nothing to explain before the fee has been computed — an order still
  // waiting to be weighed has no figure worth showing, and a row of zeroes
  // reads like the fee is nil rather than not yet known.
  if (!gross) return null;

  const discount = pricing.platformFeeDiscountCentavos ?? 0;
  const surcharge = pricing.platformFeeSurchargeCentavos ?? 0;
  const collectible = Math.max(0, gross - discount);

  const service =
    pricing.actualServiceTotalCentavos ?? pricing.customerTotalCentavos ?? null;
  // The provider's take is the service price: the platform fee is what Lalaba
  // charges on top of it, not a cut taken out of it.
  const youReceive = service;

  const rulePart = Math.max(0, gross - surcharge);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Lalaba charges</Text>

      {/* The rule fee and any penalty are separated whenever both exist,
          because only one of them can ever be waived — and a provider looking
          at a "free platform fee" order that still costs something needs to
          see which part it was. */}
      {surcharge > 0 ? (
        <>
          <Row
            label={
              pricing.platformFeePercent != null
                ? `Platform fee (${pricing.platformFeePercent}%)`
                : "Platform fee"
            }
            value={pesos(rulePart)}
          />
          <Row label="Quality surcharge fee" value={pesos(surcharge)} />
        </>
      ) : (
        <Row
          label={
            pricing.platformFeePercent != null
              ? `Platform fee (${pricing.platformFeePercent}%)`
              : "Platform fee"
          }
          value={pesos(gross)}
        />
      )}

      {discount > 0 ? (
        <Row
          label={
            pricing.platformFeePromoCode
              ? `Partner reward · ${pricing.platformFeePromoCode}`
              : "Partner reward"
          }
          value={`−${pesos(discount)}`}
          tone="credit"
        />
      ) : null}

      <View style={styles.rule} />

      <Row
        label="Total Lalaba charges"
        value={pesos(collectible)}
        strong
      />

      {youReceive != null ? (
        <Row label="You receive" value={pesos(youReceive)} tone="muted" />
      ) : null}

      {discount > 0 && collectible > 0 ? (
        <Text style={styles.note}>
          Your reward covers the platform fee. The quality surcharge is charged
          separately.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.gray200,
    padding: SP._16,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: C.gray900,
    marginBottom: SP._8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  label: { flex: 1, fontSize: 13.5 },
  value: { fontSize: 13.5, fontVariant: ["tabular-nums"] },
  strong: { fontWeight: "800", color: C.gray900 },
  rule: { height: 1, backgroundColor: C.gray200, marginVertical: SP._8 },
  note: { fontSize: 11.5, color: C.gray500, marginTop: SP._8, lineHeight: 16 },
});
