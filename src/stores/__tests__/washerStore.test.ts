// src/stores/__tests__/washerStore.test.ts
// updateProfile must roll back the optimistic patch AND rethrow on failure so
// screens can show a real failure state (no false "Saved") — GAP-P0-010.

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/graphql/washer", () => ({
  fetchWasherProfile: jest.fn(),
  gqlToggleWasherAvailability: jest.fn(),
  gqlUpdateWasherProfile: jest.fn(),
  fetchWasherStats: jest.fn(),
}));

import { useWasherStore } from "../washerStore";
import { gqlUpdateWasherProfile } from "../../services/graphql/washer";
import type { WasherProfile } from "../../types/washer.types";

const mockUpdate = gqlUpdateWasherProfile as jest.Mock;

const BASE_PROFILE: WasherProfile = {
  washerId: "w1",
  userId: "u1",
  branchId: "b1",
  displayName: "Wash Ni Juan",
  phone: "09171234567",
  photoUrl: null,
  bio: "old bio",
  machineType: "TOP_LOAD",
  machineCapacityKg: 8,
  machineBrand: null,
  address: null,
  mapLocation: null,
  serviceRadiusKm: 3,
  offeredServiceTemplateIds: [],
  logoUrl: null,
  coverPhotoUrl: null,
  description: null,
  // Phase 1 shape this line still carries alongside the structured fields
  // above — mapProfile derives barangay/city from `address` and defaults the
  // rest, so a real profile always has them.
  barangay: "Bel-Air",
  city: "Makati",
  pricePerKg: 0,
  platformFeePercent: 10,
  services: [],
  storeName: null,
  storeHeaderUrl: null,
  storeFeaturedPhotos: [],
  storeDescription: null,
  status: "ACTIVE",
  verificationStatus: "VERIFIED",
  isAvailable: true,
  slotsUsedToday: 0,
  maxOrdersPerDay: 3,
  createdAt: null,
  updatedAt: null,
};

beforeEach(() => {
  useWasherStore.setState({
    profile: { ...BASE_PROFILE },
    cert: null,
    stats: null,
    isLoading: false,
    error: null,
  });
  jest.clearAllMocks();
});

describe("washerStore.updateProfile", () => {
  it("applies the server result on success", async () => {
    mockUpdate.mockResolvedValueOnce({ ...BASE_PROFILE, bio: "server bio" });
    await useWasherStore.getState().updateProfile({ bio: "new bio" });
    expect(useWasherStore.getState().profile?.bio).toBe("server bio");
    expect(useWasherStore.getState().error).toBeNull();
  });

  it("RETHROWS on failure so the screen's catch runs", async () => {
    const boom = new Error("MongoServerError: boom");
    mockUpdate.mockRejectedValueOnce(boom);
    await expect(
      useWasherStore.getState().updateProfile({ bio: "new bio" })
    ).rejects.toBe(boom);
  });

  it("rolls back the optimistic patch on failure", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("nope"));
    await useWasherStore.getState().updateProfile({ bio: "new bio" }).catch(() => {});
    const s = useWasherStore.getState();
    expect(s.profile?.bio).toBe("old bio");
    expect(s.error).toBe("nope");
  });

  it("is a no-op when there is no profile loaded", async () => {
    useWasherStore.setState({ profile: null });
    await useWasherStore.getState().updateProfile({ bio: "x" });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
