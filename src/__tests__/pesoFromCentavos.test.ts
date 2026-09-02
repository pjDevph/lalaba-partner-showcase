import { peso, pesoFromCentavos } from "../screens/dashboard/providerHome";

// Two helpers named `peso` exist across the two apps and they take DIFFERENT
// units: this one takes pesos, the customer app's takes centavos. Handing a
// `*Centavos` field to the wrong one renders it 100x too large — and a wrong
// price still looks like a price, so nothing about it reads as broken.
// "From ₱220/kg" shipped as "From ₱22,000/kg" exactly this way.
describe("pesoFromCentavos", () => {
  it("renders 22000 centavos as ₱220, not ₱22,000", () => {
    expect(pesoFromCentavos(22000)).toBe("₱220");
  });

  it("agrees with the customer app for the same wire value", () => {
    // The customer card renders peso(22000) => "₱220" from the same field.
    expect(pesoFromCentavos(22000)).toBe("₱220");
    expect(pesoFromCentavos(19900)).toBe("₱199");
  });

  it("still differs from peso(), which takes pesos — that is the trap", () => {
    expect(peso(22000)).toBe("₱22,000");
    expect(pesoFromCentavos(22000)).toBe("₱220");
  });

  it("handles zero and null without inventing a price", () => {
    expect(pesoFromCentavos(0)).toBe("₱0");
    expect(pesoFromCentavos(null)).toBe("₱—");
    expect(pesoFromCentavos(undefined)).toBe("₱—");
  });
});
