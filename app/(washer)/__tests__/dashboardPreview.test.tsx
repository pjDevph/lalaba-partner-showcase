// app/(washer)/__tests__/dashboardPreview.test.tsx
// The "Your public profile" card claims to show exactly what customers see, so
// it must never compose a plausible-looking card out of local device state when
// the real public card (gqlMyProviderCard) can't be fetched.
//
// The stores are mocked as selector-hooks rather than driven for real: the
// dashboard's store graph pulls in Firebase/FCM native modules that don't exist
// under jest, and none of that is what's under test here.

import React from "react";
import { render, screen, waitFor } from "@testing-library/react-native";

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useFocusEffect: jest.fn(),
}));
jest.mock("../../../src/hooks/usePoll", () => ({ usePoll: jest.fn() }));
jest.mock("../../../src/services/graphql/washer", () => ({ gqlMyProviderCard: jest.fn() }));

// A local profile carrying media the SERVER doesn't have — the exact shape that
// used to leak into the preview via the `?? profile?.storeHeaderUrl` fallback.
const LOCAL_ONLY_COVER = "file:///local/never-uploaded.png";
const LOCAL_ONLY_AVATAR = "file:///local/avatar.png";

const mockWasherState = {
  profile: {
    branchId: "b1",
    businessName: "PJ Washer",
    location: "Local Area",
    storeHeaderUrl: LOCAL_ONLY_COVER,
    photoUrl: LOCAL_ONLY_AVATAR,
    isAvailable: false,
    // A pin AND a radius: discovery matches home washers by distance, so
    // without both she is off the marketplace and the dashboard says so. This
    // fixture stands for a fully set-up, listed washer.
    serviceRadiusKm: 5,
    mapLocation: { latitude: 14.53, longitude: 121.16 },
    maxOrdersPerDay: 3,
  },
  stats: null,
  loadWasher: jest.fn(),
  refreshStats: jest.fn(),
  toggleAvailability: jest.fn(),
};

jest.mock("../../../src/stores/washerStore", () => ({
  useWasherStore: (sel?: (s: unknown) => unknown) => (sel ? sel(mockWasherState) : mockWasherState),
}));
jest.mock("../../../src/stores/authStore", () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const st = { user: { uid: "u1", displayName: "PJ Washer" }, activeBranchId: "b1" };
    return sel ? sel(st) : st;
  },
}));
jest.mock("../../../src/stores/onlineOrdersStore", () => ({
  useOnlineOrdersStore: (sel?: (s: unknown) => unknown) => {
    const st = { incoming: [], isLoadingIncoming: false, fetchIncoming: jest.fn(), loadCouriers: jest.fn(), couriers: [] };
    return sel ? sel(st) : st;
  },
  STATUS_LABEL: {},
  ONLINE_ORDERS_POLL_MS: 30000,
}));
jest.mock("../../../src/stores/walletStore", () => ({
  useWalletStore: (sel?: (s: unknown) => unknown) => {
    const st = { balanceCentavos: 100000, activatedAt: "2026-08-12T04:09:18.634Z", load: jest.fn() };
    return sel ? sel(st) : st;
  },
  isNotVisible: () => false,
  isActivated: () => true,
}));

import WasherDashboard from "../dashboard";
import { gqlMyProviderCard } from "../../../src/services/graphql/washer";

const mockCard = gqlMyProviderCard as jest.MockedFunction<typeof gqlMyProviderCard>;

beforeEach(() => {
  mockCard.mockReset();
});

describe("washer dashboard — public profile preview", () => {
  it("shows an explicit failure state instead of a card built from local state", async () => {
    mockCard.mockRejectedValue(new Error("network down"));

    render(<WasherDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Couldn't load your public profile/i)).toBeOnTheScreen();
    });
    expect(screen.getByText("Retry")).toBeOnTheScreen();
  });

  it("never renders local-only media as the public cover photo", async () => {
    mockCard.mockRejectedValue(new Error("network down"));

    render(<WasherDashboard />);
    await waitFor(() => expect(screen.getByText("Retry")).toBeOnTheScreen());

    // Scoped to the preview card: the top-of-screen account avatar is the
    // washer's OWN photo and is legitimately local — it makes no claim about
    // what customers see.
    expect(screen.queryByTestId("preview-cover")).toBeNull();
    expect(screen.queryByTestId("preview-logo")).toBeNull();
  });

  it("renders the server card, and only the server card, when the fetch succeeds", async () => {
    mockCard.mockResolvedValue({
      name: "PJ Washer",
      areaLabel: "Mambog, Binangonan",
      coverPhotoUrl: "https://cdn.example/real-cover.png",
      logoUrl: null,
      isVerified: false,
      ratingAverage: 0,
      ratingCount: 0,
      statusText: "Closed",
      serviceCategories: [],
    } as never);

    render(<WasherDashboard />);

    await waitFor(() => expect(screen.getByText("Mambog, Binangonan")).toBeOnTheScreen());
    expect(screen.queryByText(/Couldn't load your public profile/i)).toBeNull();

    expect(screen.getByTestId("preview-cover").props.source.uri).toBe("https://cdn.example/real-cover.png");
    // logoUrl is null on the server card — the local avatar must not fill in.
    expect(screen.queryByTestId("preview-logo")).toBeNull();
  });

  it("labels the preview when the shop is off the marketplace", async () => {
    // Funded (walletStore mock says visible) but an empty catalog — the second
    // marketplace gate. The card must not imply customers can see it.
    mockCard.mockResolvedValue({
      name: "PJ Washer",
      areaLabel: "Mambog, Binangonan",
      coverPhotoUrl: null,
      logoUrl: null,
      isVerified: false,
      ratingAverage: 0,
      ratingCount: 0,
      statusText: "Accepting bookings",
      serviceCategories: [],
    } as never);

    render(<WasherDashboard />);
    await waitFor(() => expect(screen.getByText("Mambog, Binangonan")).toBeOnTheScreen());

    expect(screen.getByText(/Not shown in the marketplace right now/i)).toBeOnTheScreen();
    expect(screen.queryByText("This is what customers see")).toBeNull();
  });

  it("keeps the plain 'what customers see' caption once listed", async () => {
    mockCard.mockResolvedValue({
      name: "PJ Washer",
      areaLabel: "Mambog, Binangonan",
      coverPhotoUrl: null,
      logoUrl: null,
      isVerified: false,
      ratingAverage: 0,
      ratingCount: 0,
      statusText: "Accepting bookings",
      serviceCategories: ["Wash & Fold"],
    } as never);

    render(<WasherDashboard />);
    await waitFor(() => expect(screen.getByText("Mambog, Binangonan")).toBeOnTheScreen());

    expect(screen.getByText("This is what customers see")).toBeOnTheScreen();
    expect(screen.queryByText(/Not shown in the marketplace right now/i)).toBeNull();
  });

  it("shows no row the customer card doesn't have", async () => {
    mockCard.mockResolvedValue({
      name: "PJ Washer",
      areaLabel: "Mambog, Binangonan",
      coverPhotoUrl: null,
      logoUrl: null,
      isVerified: false,
      ratingAverage: 0,
      ratingCount: 0,
      statusText: "Accepting bookings",
      serviceCategories: [],
    } as never);

    render(<WasherDashboard />);
    await waitFor(() => expect(screen.getByText("Mambog, Binangonan")).toBeOnTheScreen());

    // serviceRadiusKm is local-only and absent from MyProviderCard, so a
    // "Serves within 5 km" row would be a claim the customer card never makes.
    expect(screen.queryByText(/Serves within/i)).toBeNull();
  });
});
