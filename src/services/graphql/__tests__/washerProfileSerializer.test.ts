// src/services/graphql/__tests__/washerProfileSerializer.test.ts
// GAP-P0-010: the update-profile serializer must emit ONLY the fields the BE
// UpdateWasherProfileInput accepts, strip every legacy/derived key, and
// round-trip the full structured address.

jest.mock("../../../config/graphql", () => ({
  graphqlRequest: jest.fn(),
}));

import { serializeWasherProfileInput } from "../washer";
import type { WasherAddress } from "../../../types/washer.types";

const FULL_ADDRESS: WasherAddress = {
  streetAddress: "123 Sampaguita St",
  barangayName: "Barangay Uno",
  cityMunicipalityName: "Quezon City",
  provinceName: "Metro Manila",
  regionName: "NCR",
  unit: "Unit 2B",
  zipCode: "1100",
};

describe("serializeWasherProfileInput", () => {
  it("keeps every whitelisted field", () => {
    const input = serializeWasherProfileInput({
      displayName: "Wash Ni Juan",
      phone: "09171234567",
      photoUrl: "https://cdn/photo.jpg",
      bio: "Hi",
      description: "Store desc",
      logoUrl: "https://cdn/logo.jpg",
      coverPhotoUrl: "https://cdn/cover.jpg",
      address: FULL_ADDRESS,
      mapLocation: { latitude: 14.6, longitude: 121.0 },
      offeredServiceTemplateIds: ["t1", "t2"],
      serviceRadiusKm: 3,
      machineType: "TOP_LOAD",
      machineBrand: "LG",
      machineCapacityKg: 8,
    });
    expect(Object.keys(input).sort()).toEqual([
      "address", "bio", "coverPhotoUrl", "description", "displayName",
      "logoUrl", "machineBrand", "machineCapacityKg", "machineType",
      "mapLocation", "offeredServiceTemplateIds", "phone", "photoUrl",
      "serviceRadiusKm",
    ]);
  });

  it("strips ids, status, timestamps and legacy shim keys", () => {
    const input = serializeWasherProfileInput({
      washerId: "w1",
      userId: "u1",
      branchId: "b1",
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      isAvailable: true,
      slotsUsedToday: 2,
      maxOrdersPerDay: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Legacy keys the old FE profile carried (removed from the type, but the
      // serializer must defend against stale persisted blobs at runtime):
      barangay: "Barangay Uno",
      city: "QC",
      services: [{ serviceId: "s1" }],
      pricePerKg: 45,
      platformFeePercent: 10,
      storeHeaderUrl: "https://cdn/x.jpg",
      storeFeaturedPhotos: ["a", "b"],
      storeDescription: "old",
      bio: "keep me",
    } as never);
    expect(input).toEqual({ bio: "keep me" });
  });

  it("round-trips the full structured address (5 required + optionals)", () => {
    const input = serializeWasherProfileInput({ address: FULL_ADDRESS });
    expect(input.address).toEqual({
      streetAddress: "123 Sampaguita St",
      barangayName: "Barangay Uno",
      cityMunicipalityName: "Quezon City",
      provinceName: "Metro Manila",
      regionName: "NCR",
      unit: "Unit 2B",
      zipCode: "1100",
    });
  });

  it("omits empty optional address fields instead of sending blanks", () => {
    const input = serializeWasherProfileInput({
      address: { ...FULL_ADDRESS, unit: null, zipCode: "" },
    });
    expect(input.address).toEqual({
      streetAddress: "123 Sampaguita St",
      barangayName: "Barangay Uno",
      cityMunicipalityName: "Quezon City",
      provinceName: "Metro Manila",
      regionName: "NCR",
    });
  });

  it("reshapes mapLocation to latitude/longitude only", () => {
    const input = serializeWasherProfileInput({
      mapLocation: { latitude: 14.6, longitude: 121.0, accuracy: 5 } as never,
    });
    expect(input.mapLocation).toEqual({ latitude: 14.6, longitude: 121.0 });
  });

  it("keeps explicit nulls (clearing a field) but drops undefined", () => {
    const input = serializeWasherProfileInput({ bio: null, machineBrand: undefined });
    expect(input).toEqual({ bio: null });
  });
});
