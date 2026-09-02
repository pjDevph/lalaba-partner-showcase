import {
  centavosToPeso,
  describeOffering,
  describePlatformPricing,
  draftFrom,
  draftToInput,
  pesoToCentavos,
  previewCentavos,
  validateDraft,
  type PreviewBasket,
  type PricingDraft,
} from "../servicePricing";
import type {
  WasherServiceOffering,
  WasherServiceTemplate,
} from "../../../../types/washer.types";

const template = (over: Partial<WasherServiceTemplate> = {}): WasherServiceTemplate => ({
  _id: "t1",
  name: "Wash & Fold",
  description: null,
  pricingControl: "WASHER_SET",
  allowedPricingModels: ["PER_KG", "PER_LOAD", "BASE_EXCESS"],
  minPriceCentavos: null,
  maxPriceCentavos: null,
  platformPricingModel: "BASE_EXCESS",
  basePriceCentavos: 25000,
  baseWeightKg: 7,
  excessRatePerKgCentavos: 3000,
  platformLoadCapacityKg: null,
  platformUnit: null,
  platformMinBillableKg: null,
  isActive: true,
  ...over,
});

const draft = (over: Partial<PricingDraft> = {}): PricingDraft => ({
  model: "PER_KG",
  pricePeso: "35.00",
  loadCapacityKg: "",
  baseWeightKg: "",
  excessRatePeso: "",
  minBillableKg: "",
  unit: "PIECE",
  minQuantity: "",
  maxQuantity: "",
  ...over,
});

/** Preview baskets. Weight and count are not interchangeable — see PreviewBasket. */
const kg = (n: number): PreviewBasket => ({ kind: "weight", kg: n });
const qty = (n: number): PreviewBasket => ({ kind: "quantity", count: n });

describe("money conversion", () => {
  it("round-trips and rounds to the nearest centavo", () => {
    expect(pesoToCentavos("180.00")).toBe(18000);
    expect(pesoToCentavos("45.675")).toBe(4568);
    expect(centavosToPeso(18000)).toBe("180.00");
    expect(Number.isNaN(pesoToCentavos(""))).toBe(true);
  });
});

describe("draftFrom", () => {
  it("starts a fresh service at the platform price, so saving changes nothing", () => {
    const d = draftFrom(template(), undefined);
    expect(d.model).toBe("BASE_EXCESS");
    expect(d.pricePeso).toBe("250.00");
    expect(d.baseWeightKg).toBe("7");
    expect(d.excessRatePeso).toBe("30.00");
  });

  it("falls back to the first allowed model when base+excess is disallowed", () => {
    const d = draftFrom(template({ allowedPricingModels: ["PER_LOAD"] }), undefined);
    expect(d.model).toBe("PER_LOAD");
  });

  it("reloads a saved offering as-is", () => {
    const offering = {
      pricingModel: "PER_LOAD",
      priceCentavos: 18000,
      loadCapacityKg: 7,
      baseWeightKg: null,
      excessRatePerKgCentavos: null,
      minBillableKg: null,
    } as WasherServiceOffering;
    const d = draftFrom(template(), offering);
    expect(d).toMatchObject({
      model: "PER_LOAD",
      pricePeso: "180.00",
      loadCapacityKg: "7",
    });
  });
});

describe("previewCentavos", () => {
  // The fee rides ON TOP of the washer's price — she keeps what she charges.
  const FEE = 10;

  it("per kg: bills the basket at her rate", () => {
    const p = previewCentavos(draft({ pricePeso: "35" }), kg(8), FEE)!;
    expect(p.washerTakes).toBe(28000);
    expect(p.customerPays).toBe(30800);
  });

  it("per kg: applies her minimum weight to a small basket", () => {
    const d = draft({ pricePeso: "35", minBillableKg: "5" });
    expect(previewCentavos(d, kg(2), FEE)!.washerTakes).toBe(17500);
    expect(previewCentavos(d, kg(8), FEE)!.washerTakes).toBe(28000);
  });

  it("per load: rounds up to whole machine loads", () => {
    const d = draft({
      model: "PER_LOAD",
      pricePeso: "180",
      loadCapacityKg: "7",
    });
    const p = previewCentavos(d, kg(10), FEE)!;
    expect(p.loads).toBe(2);
    expect(p.washerTakes).toBe(36000);
    expect(p.customerPays).toBe(39600);
    expect(previewCentavos(d, kg(7), FEE)!.loads).toBe(1);
    expect(previewCentavos(d, kg(0.5), FEE)!.loads).toBe(1);
  });

  it("base + excess: base price plus the overflow", () => {
    const d = draft({
      model: "BASE_EXCESS",
      pricePeso: "250",
      baseWeightKg: "7",
      excessRatePeso: "30",
    });
    expect(previewCentavos(d, kg(10), FEE)!.washerTakes).toBe(34000);
    expect(previewCentavos(d, kg(5), FEE)!.washerTakes).toBe(25000);
  });

  it("returns null while a required field is still blank", () => {
    expect(
      previewCentavos(draft({ model: "PER_LOAD", loadCapacityKg: "" }), kg(8), FEE),
    ).toBeNull();
    expect(previewCentavos(draft({ pricePeso: "" }), kg(8), FEE)).toBeNull();
  });

  it("tracks the fee rate instead of assuming 10%", () => {
    const p = previewCentavos(draft({ pricePeso: "100" }), kg(1), 15)!;
    expect(p.washerTakes).toBe(10000);
    expect(p.customerPays).toBe(11500);
  });

  it("per item: bills the count at her rate", () => {
    const d = draft({ model: "PER_ITEM", pricePeso: "250", unit: "PIECE" });
    expect(previewCentavos(d, qty(2), FEE)!.washerTakes).toBe(50000);
    expect(previewCentavos(d, qty(1), FEE)!.customerPays).toBe(27500);
  });

  it("refuses to price a basket in the wrong units", () => {
    // The trap the discriminated basket exists to close: an 8 kg basket handed
    // to a ₱250/piece service would have quoted ₱2,000 for eight comforters
    // nobody ordered.
    const perItem = draft({ model: "PER_ITEM", pricePeso: "250" });
    expect(previewCentavos(perItem, kg(8), FEE)).toBeNull();
    const perKg = draft({ pricePeso: "35" });
    expect(previewCentavos(perKg, qty(2), FEE)).toBeNull();
  });
});

describe("validateDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(template(), draft())).toBeNull();
  });

  it("rejects a zero or missing price", () => {
    expect(validateDraft(template(), draft({ pricePeso: "0" }))).toMatch(/greater than zero/);
    expect(validateDraft(template(), draft({ pricePeso: "" }))).toMatch(/greater than zero/);
  });

  it("enforces the platform guardrails with the actual limit in the message", () => {
    const bounded = template({ minPriceCentavos: 2000, maxPriceCentavos: 10000 });
    expect(validateDraft(bounded, draft({ pricePeso: "5" }))).toMatch(/₱20.00/);
    expect(validateDraft(bounded, draft({ pricePeso: "500" }))).toMatch(/₱100.00/);
    expect(validateDraft(bounded, draft({ pricePeso: "35" }))).toBeNull();
  });

  it("requires the fields the chosen model depends on", () => {
    expect(
      validateDraft(template(), draft({ model: "PER_LOAD", loadCapacityKg: "" })),
    ).toMatch(/fit in one load/);
    expect(
      validateDraft(
        template(),
        draft({ model: "BASE_EXCESS", baseWeightKg: "7", excessRatePeso: "" }),
      ),
    ).toMatch(/every kilo above/);
  });

  it("rejects inverted or fractional per-item quantity limits", () => {
    const itemTemplate = template({
      allowedPricingModels: ["PER_KG", "PER_LOAD", "BASE_EXCESS", "PER_ITEM"],
    });
    const d = (over: Partial<PricingDraft>) =>
      draft({ model: "PER_ITEM", pricePeso: "250", unit: "PIECE", ...over });

    expect(
      validateDraft(itemTemplate, d({ minQuantity: "5", maxQuantity: "2" })),
    ).toMatch(/cannot be larger than/);
    expect(validateDraft(itemTemplate, d({ minQuantity: "1.5" }))).toMatch(
      /whole number/,
    );
    expect(
      validateDraft(itemTemplate, d({ minQuantity: "2", maxQuantity: "2" })),
    ).toBeNull();
    expect(validateDraft(itemTemplate, d({}))).toBeNull();
  });
});

describe("draftToInput", () => {
  it("sends only the fields the chosen model uses", () => {
    const perLoad = draftToInput(
      "t1",
      draft({
        model: "PER_LOAD",
        pricePeso: "180",
        loadCapacityKg: "7",
        // Left over from editing base+excess before switching — must not be sent.
        baseWeightKg: "9",
        excessRatePeso: "25",
        minBillableKg: "5",
      }),
    );
    expect(perLoad).toEqual({
      serviceTemplateId: "t1",
      pricingModel: "PER_LOAD",
      priceCentavos: 18000,
      loadCapacityKg: 7,
      baseWeightKg: null,
      excessRatePerKgCentavos: null,
      minBillableKg: null,
      unit: null,
      minQuantity: null,
      maxQuantity: null,
    });
  });

  it("sends the unit and limits only for per-item", () => {
    expect(
      draftToInput(
        "t1",
        draft({
          model: "PER_ITEM",
          pricePeso: "250",
          unit: "PAIR",
          minQuantity: "1",
          maxQuantity: "5",
          // Left over from editing per-load before switching.
          loadCapacityKg: "7",
          minBillableKg: "3",
        }),
      ),
    ).toEqual({
      serviceTemplateId: "t1",
      pricingModel: "PER_ITEM",
      priceCentavos: 25000,
      loadCapacityKg: null,
      baseWeightKg: null,
      excessRatePerKgCentavos: null,
      minBillableKg: null,
      unit: "PAIR",
      minQuantity: 1,
      maxQuantity: 5,
    });
  });
});

describe("describeOffering", () => {
  it("summarises each model for the collapsed row", () => {
    expect(describeOffering(template(), undefined)).toBe(
      "₱250.00 up to 7 kg · ₱30.00/kg after",
    );
    expect(
      describeOffering(template(), {
        pricingModel: "PER_LOAD",
        priceCentavos: 18000,
        loadCapacityKg: 7,
      } as WasherServiceOffering),
    ).toBe("₱180.00/load · up to 7 kg per load");
    expect(
      describeOffering(template(), {
        pricingModel: "PER_KG",
        priceCentavos: 3500,
        minBillableKg: 5,
      } as WasherServiceOffering),
    ).toBe("₱35.00/kg · min 5 kg");
  });

  it("ignores a stale offering on a platform-priced service", () => {
    expect(
      describeOffering(template({ pricingControl: "PLATFORM_FIXED" }), {
        pricingModel: "PER_KG",
        priceCentavos: 9900,
      } as WasherServiceOffering),
    ).toBe("₱250.00 up to 7 kg · ₱30.00/kg after");
  });

  it("summarises a per-item offering with its unit and limits", () => {
    const perItem = (over: Partial<WasherServiceOffering>) =>
      describeOffering(template(), {
        pricingModel: "PER_ITEM",
        priceCentavos: 25000,
        unit: "PIECE",
        minQuantity: null,
        maxQuantity: null,
        ...over,
      } as WasherServiceOffering);

    expect(perItem({})).toBe("₱250.00/piece");
    expect(perItem({ minQuantity: 2 })).toBe("₱250.00/piece · min 2 pieces");
    expect(perItem({ minQuantity: 1, maxQuantity: 5 })).toBe(
      "₱250.00/piece · 1–5 pieces",
    );
    expect(perItem({ minQuantity: 2, maxQuantity: 2 })).toBe(
      "₱250.00/piece · exactly 2 pieces",
    );
    expect(perItem({ unit: "PAIR" })).toBe("₱250.00/pair");
  });
});

describe("describePlatformPricing", () => {
  // The bug this closes: the old version read the three base+excess columns
  // whatever the method was, so a ₱250-per-load service showed to the washer
  // as "₱250.00 up to 0 kg · ₱0.00/kg after".
  it("describes Lalaba's price in whichever method the template declares", () => {
    expect(
      describePlatformPricing(
        template({
          platformPricingModel: "PER_LOAD",
          platformLoadCapacityKg: 7,
        }),
      ),
    ).toBe("₱250.00/load · up to 7 kg per load");

    expect(
      describePlatformPricing(
        template({ platformPricingModel: "PER_ITEM", platformUnit: "PANEL" }),
      ),
    ).toBe("₱250.00/panel");

    expect(
      describePlatformPricing(
        template({
          platformPricingModel: "PER_KG",
          basePriceCentavos: 3500,
          platformMinBillableKg: 3,
        }),
      ),
    ).toBe("₱35.00/kg · min 3 kg");
  });

  it("reads a template with no method as base + excess", () => {
    // Templates written before the field existed come back null.
    expect(
      describePlatformPricing(
        template({ platformPricingModel: null as never }),
      ),
    ).toBe("₱250.00 up to 7 kg · ₱30.00/kg after");
  });
});


// ── Who bears the commission ─────────────────────────────────────────────────
// The preview used to assume the customer always pays the fee on top. Both
// seeded rules work that way, but the payer is admin-editable, so an assumption
// here inverts a washer's earnings the day it changes.

describe("previewCentavos — chargedTo", () => {
  const d = draft({ model: "PER_KG", pricePeso: "100" });

  it("HP: customer-paid adds the fee on top and she keeps her price", () => {
    const p = previewCentavos(d, kg(1), 10, "CUSTOMER")!;
    expect(p.washerTakes).toBe(10000);
    expect(p.customerPays).toBe(11000);
  });

  it("SEC: provider-paid deducts it — the customer pays the listed price", () => {
    const p = previewCentavos(d, kg(1), 10, "PROVIDER")!;
    expect(p.customerPays).toBe(10000);
    expect(p.washerTakes).toBe(9000);
  });

  it("EC: SPLIT reports the gross on both sides rather than guessing", () => {
    const p = previewCentavos(d, kg(1), 10, "SPLIT")!;
    expect(p.customerPays).toBe(10000);
    expect(p.washerTakes).toBe(10000);
  });

  it("HP: defaults to customer-paid, matching the seeded rules", () => {
    expect(previewCentavos(d, kg(1), 10)).toEqual(
      previewCentavos(d, kg(1), 10, "CUSTOMER"),
    );
  });
});
