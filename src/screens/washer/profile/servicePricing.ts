// src/screens/washer/profile/servicePricing.ts
// Pure pricing helpers for the washer's Services section.
//
// The BE owns the real arithmetic (LALABA_BE_DEV/src/online-orders/pricing.util.ts
// and washer-service-offerings/washer-pricing.util.ts); this mirrors just
// enough of it to preview a price before saving. Kept free of React so it can
// be tested directly — a wrong preview here is a washer mispricing her work.

import type {
  WasherPricingModel,
  WasherServiceOffering,
  WasherServiceTemplate,
  WasherServiceUnit,
} from "../../../types/washer.types";

export const PRICING_MODEL_LABELS: Record<WasherPricingModel, string> = {
  PER_KG: "Per kilo",
  PER_LOAD: "Per load",
  BASE_EXCESS: "Base + excess",
  PER_ITEM: "Per item",
};

export const SERVICE_UNIT_LABELS: Record<WasherServiceUnit, string> = {
  PIECE: "piece",
  PAIR: "pair",
  SET: "set",
  PANEL: "panel",
};

export const ALL_SERVICE_UNITS: WasherServiceUnit[] = [
  "PIECE",
  "PAIR",
  "SET",
  "PANEL",
];

/** Everything the editor holds while the washer is typing. Strings, so a
 *  half-typed "18." doesn't get coerced mid-keystroke. */
export interface PricingDraft {
  model: WasherPricingModel;
  pricePeso: string;
  loadCapacityKg: string;
  baseWeightKg: string;
  excessRatePeso: string;
  minBillableKg: string;
  /** PER_ITEM. */
  unit: WasherServiceUnit;
  minQuantity: string;
  maxQuantity: string;
}

/**
 * What a preview is priced against. Weight and count are not interchangeable —
 * passing a kilo figure into a per-item price would silently read "7" as seven
 * comforters — so the caller has to say which one it is.
 */
export type PreviewBasket =
  | { kind: "weight"; kg: number }
  | { kind: "quantity"; count: number };

/** True for models billed by counted items rather than measured weight. */
export function isCountedModel(model: WasherPricingModel): boolean {
  return model === "PER_ITEM";
}

/** The method a template's own price uses — see the note on the field. */
export function platformModelOf(
  template: WasherServiceTemplate,
): WasherPricingModel {
  return template.platformPricingModel ?? "BASE_EXCESS";
}

export function pesoToCentavos(peso: string): number {
  const parsed = Number.parseFloat(peso);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
}

export function centavosToPeso(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export function formatPeso(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const num = (v: string): number => Number.parseFloat(v);
const numOrNull = (v: string): number | null =>
  v.trim() === "" || !Number.isFinite(num(v)) ? null : num(v);

/**
 * The draft a washer starts from: her saved offering, or the platform's
 * fallback numbers expressed in whichever model the template allows. Starting
 * from the current price means "open the editor and save" is a no-op rather
 * than a surprise change.
 */
export function draftFrom(
  template: WasherServiceTemplate,
  offering: WasherServiceOffering | undefined,
): PricingDraft {
  if (offering) {
    return {
      model: offering.pricingModel,
      pricePeso: centavosToPeso(offering.priceCentavos),
      loadCapacityKg: offering.loadCapacityKg?.toString() ?? "",
      baseWeightKg: offering.baseWeightKg?.toString() ?? "",
      excessRatePeso:
        offering.excessRatePerKgCentavos == null
          ? ""
          : centavosToPeso(offering.excessRatePerKgCentavos),
      minBillableKg: offering.minBillableKg?.toString() ?? "",
      unit: offering.unit ?? "PIECE",
      minQuantity: offering.minQuantity?.toString() ?? "",
      maxQuantity: offering.maxQuantity?.toString() ?? "",
    };
  }
  const allowed = template.allowedPricingModels ?? [];
  return {
    // Base+excess when it's allowed, because that IS the platform fallback —
    // anything else would silently restate her current price as a new one.
    model: allowed.includes("BASE_EXCESS") ? "BASE_EXCESS" : (allowed[0] ?? "PER_KG"),
    pricePeso: centavosToPeso(template.basePriceCentavos),
    loadCapacityKg: template.baseWeightKg ? String(template.baseWeightKg) : "",
    baseWeightKg: String(template.baseWeightKg),
    excessRatePeso: centavosToPeso(template.excessRatePerKgCentavos),
    minBillableKg: "",
    unit: template.platformUnit ?? "PIECE",
    minQuantity: "",
    maxQuantity: "",
  };
}

/** Null when valid, otherwise the message to show. Mirrors assertOfferingAllowed. */
export function validateDraft(
  template: WasherServiceTemplate,
  draft: PricingDraft,
): string | null {
  const price = pesoToCentavos(draft.pricePeso);
  if (!Number.isFinite(price) || price <= 0) {
    return "Enter a price greater than zero.";
  }
  if (template.minPriceCentavos != null && price < template.minPriceCentavos) {
    return `Lalaba's minimum for this service is ${formatPeso(template.minPriceCentavos)}.`;
  }
  if (template.maxPriceCentavos != null && price > template.maxPriceCentavos) {
    return `Lalaba's maximum for this service is ${formatPeso(template.maxPriceCentavos)}.`;
  }

  if (draft.model === "PER_LOAD") {
    const capacity = numOrNull(draft.loadCapacityKg);
    if (capacity == null || capacity <= 0) {
      return "Enter how many kilos fit in one load of your machine.";
    }
  }
  if (draft.model === "BASE_EXCESS") {
    const base = numOrNull(draft.baseWeightKg);
    if (base == null || base < 0) return "Enter how many kilos the base price covers.";
    const excess = pesoToCentavos(draft.excessRatePeso);
    if (!Number.isFinite(excess) || excess < 0) {
      return "Enter the rate for every kilo above the base weight.";
    }
  }
  if (draft.model === "PER_ITEM") {
    if (!draft.unit) return "Choose what you are counting.";
    const min = numOrNull(draft.minQuantity);
    const max = numOrNull(draft.maxQuantity);
    if (
      draft.minQuantity.trim() !== "" &&
      (min == null || !Number.isInteger(min) || min < 1)
    ) {
      return "The smallest order must be a whole number of at least 1.";
    }
    if (
      draft.maxQuantity.trim() !== "" &&
      (max == null || !Number.isInteger(max) || max < 1)
    ) {
      return "The largest order must be a whole number of at least 1.";
    }
    if (min != null && max != null && min > max) {
      return "The smallest order cannot be larger than the largest order.";
    }
  }
  // Weight minimums are meaningless for per-load (a part load is a load) and
  // for per-item (nothing is weighed).
  if (draft.model !== "PER_LOAD" && draft.model !== "PER_ITEM") {
    const min = numOrNull(draft.minBillableKg);
    if (draft.minBillableKg.trim() !== "" && (min == null || min < 0)) {
      return "Minimum weight must be a number, or blank for none.";
    }
  }
  return null;
}

/** The mutation input for a validated draft. */
export function draftToInput(templateId: string, draft: PricingDraft) {
  const perLoad = draft.model === "PER_LOAD";
  const baseExcess = draft.model === "BASE_EXCESS";
  const perItem = draft.model === "PER_ITEM";
  return {
    serviceTemplateId: templateId,
    pricingModel: draft.model,
    priceCentavos: pesoToCentavos(draft.pricePeso),
    loadCapacityKg: perLoad ? numOrNull(draft.loadCapacityKg) : null,
    baseWeightKg: baseExcess ? numOrNull(draft.baseWeightKg) : null,
    excessRatePerKgCentavos: baseExcess
      ? pesoToCentavos(draft.excessRatePeso)
      : null,
    minBillableKg: perLoad || perItem ? null : numOrNull(draft.minBillableKg),
    unit: perItem ? draft.unit : null,
    minQuantity: perItem ? numOrNull(draft.minQuantity) : null,
    maxQuantity: perItem ? numOrNull(draft.maxQuantity) : null,
  };
}

/** Who bears the platform commission. Mirrors the backend FeeChargedTo. */
export type FeeChargedTo = "CUSTOMER" | "PROVIDER" | "SPLIT";

/**
 * What a basket costs the customer and what the washer receives, in centavos.
 *
 * `chargedTo` decides which is which, and it is NOT safe to assume. This used
 * to hardcode customer-paid — the customer pays her price plus the fee, she
 * keeps her price in full. That matches both seeded commission rules, but the
 * payer is admin-editable and the backend already prices provider-paid, so the
 * assumption would silently invert her earnings the day someone changed it.
 *
 * SPLIT returns the gross on both sides: the proportions are not exposed, and
 * a number we cannot stand behind is worse than no number. Callers should show
 * the rate and skip the breakdown when `chargedTo` is SPLIT.
 */
export function previewCentavos(
  draft: PricingDraft,
  basket: PreviewBasket,
  feePercent: number,
  chargedTo: FeeChargedTo = "CUSTOMER",
): { washerTakes: number; customerPays: number; loads?: number } | null {
  const price = pesoToCentavos(draft.pricePeso);
  if (!Number.isFinite(price)) return null;

  // A weight basket cannot price a per-item service and vice versa. Returning
  // null makes the caller show nothing rather than a confident wrong number.
  if (isCountedModel(draft.model) !== (basket.kind === "quantity")) return null;

  let washerTakes: number;
  let loads: number | undefined;

  switch (draft.model) {
    case "PER_KG": {
      const kg = basket.kind === "weight" ? basket.kg : 0;
      const min = numOrNull(draft.minBillableKg) ?? 0;
      washerTakes = Math.round(Math.max(kg, min) * price);
      break;
    }
    case "PER_LOAD": {
      const kg = basket.kind === "weight" ? basket.kg : 0;
      const capacity = numOrNull(draft.loadCapacityKg);
      if (capacity == null || capacity <= 0) return null;
      loads = Math.max(1, Math.ceil(kg / capacity));
      washerTakes = Math.round(loads * price);
      break;
    }
    case "BASE_EXCESS": {
      const kg = basket.kind === "weight" ? basket.kg : 0;
      const base = numOrNull(draft.baseWeightKg);
      const excess = pesoToCentavos(draft.excessRatePeso);
      if (base == null || !Number.isFinite(excess)) return null;
      const min = numOrNull(draft.minBillableKg) ?? 0;
      const billable = Math.max(kg, min);
      washerTakes = Math.round(price + Math.max(0, billable - base) * excess);
      break;
    }
    case "PER_ITEM": {
      const count = basket.kind === "quantity" ? basket.count : 0;
      washerTakes = Math.round(count * price);
      break;
    }
    default:
      return null;
  }

  const fee = Math.round(washerTakes * (feePercent / 100));

  if (chargedTo === "PROVIDER") {
    // Deducted: the customer pays the listed price, she receives less.
    return {
      washerTakes: washerTakes - fee,
      customerPays: washerTakes,
      loads,
    };
  }

  if (chargedTo === "SPLIT") {
    return { washerTakes, customerPays: washerTakes, loads };
  }

  // Added on top: she keeps her price in full.
  return {
    washerTakes,
    customerPays: washerTakes + fee,
    loads,
  };
}

/** One-line summary of a saved price, for the collapsed service row. */
export function describeOffering(
  template: WasherServiceTemplate,
  offering: WasherServiceOffering | undefined,
): string {
  if (template.pricingControl === "PLATFORM_FIXED" || !offering) {
    return describePlatformPricing(template);
  }
  switch (offering.pricingModel) {
    case "PER_KG":
      return (
        `${formatPeso(offering.priceCentavos)}/kg` +
        (offering.minBillableKg ? ` · min ${offering.minBillableKg} kg` : "")
      );
    case "PER_LOAD":
      return `${formatPeso(offering.priceCentavos)}/load · up to ${offering.loadCapacityKg ?? "?"} kg per load`;
    case "BASE_EXCESS":
      return `${formatPeso(offering.priceCentavos)} up to ${offering.baseWeightKg ?? 0} kg · ${formatPeso(offering.excessRatePerKgCentavos ?? 0)}/kg after`;
    case "PER_ITEM": {
      const unit = SERVICE_UNIT_LABELS[offering.unit ?? "PIECE"];
      const limits = describeQuantityLimits(
        offering.minQuantity,
        offering.maxQuantity,
        unit,
      );
      return `${formatPeso(offering.priceCentavos)}/${unit}${limits}`;
    }
    default:
      return "";
  }
}

/**
 * Lalaba's own price for a service, in whichever method the template declares.
 *
 * This used to be a hardcoded base+excess string, which was correct only while
 * a platform-priced service could not be anything else. A ₱250-per-load
 * service read through the old version as "₱250 up to 0 kg · ₱0.00/kg after".
 */
export function describePlatformPricing(
  template: WasherServiceTemplate,
): string {
  const price = formatPeso(template.basePriceCentavos);
  switch (platformModelOf(template)) {
    case "PER_KG":
      return (
        `${price}/kg` +
        (template.platformMinBillableKg
          ? ` · min ${template.platformMinBillableKg} kg`
          : "")
      );
    case "PER_LOAD":
      return `${price}/load · up to ${template.platformLoadCapacityKg ?? "?"} kg per load`;
    case "PER_ITEM":
      return `${price}/${SERVICE_UNIT_LABELS[template.platformUnit ?? "PIECE"]}`;
    case "BASE_EXCESS":
    default:
      return `${price} up to ${template.baseWeightKg} kg · ${formatPeso(template.excessRatePerKgCentavos)}/kg after`;
  }
}

function describeQuantityLimits(
  min: number | null,
  max: number | null,
  unit: string,
): string {
  if (min == null && max == null) return "";
  if (min != null && max != null) {
    return min === max
      ? ` · exactly ${min} ${unit}${min > 1 ? "s" : ""}`
      : ` · ${min}–${max} ${unit}s`;
  }
  if (min != null) return ` · min ${min} ${unit}${min > 1 ? "s" : ""}`;
  return ` · max ${max} ${unit}s`;
}
