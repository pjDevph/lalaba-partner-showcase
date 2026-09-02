// src/stores/__tests__/servicesStore.test.ts
// Unit tests for servicesStore — session-only store for active laundry services.
// Covers load(), refresh(), and reset() including guards, error handling, and mock control.

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../services/graphql/laundryServices", () => ({
  gqlMyServices: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { useServicesStore } from "../servicesStore";
import { gqlMyServices } from "../../services/graphql/laundryServices";

const mockGqlMyServices = gqlMyServices as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeService(overrides: Record<string, unknown> = {}) {
  return {
    _id:              "service-1",
    uid:              "merchant-1",
    branchId:         "branch-1",
    serviceName:      "Wash and Fold",
    price:            80,
    pricingType:      "FLAT",
    category:         "WASH_AND_FOLD",
    requiresWeighing: false,
    isActive:         true,
    isOnline:         true,
    isFeatured:       false,
    isArchived:       false,
    ...overrides,
  };
}

const SERVICE_A = makeService({ _id: "svc-a", name: "Wash and Fold" });
const SERVICE_B = makeService({ _id: "svc-b", name: "Dry Clean" });

// ── Reset store before each test ──────────────────────────────────────────────

beforeEach(() => {
  useServicesStore.setState({ services: [], isLoaded: false, isLoading: false });
  jest.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// load()
// ══════════════════════════════════════════════════════════════════════════════

describe("load()", () => {
  it("HP: load() fetches services and stores them in state", async () => {
    mockGqlMyServices.mockResolvedValue([SERVICE_A, SERVICE_B]);

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().services).toEqual([SERVICE_A, SERVICE_B]);
  });

  it("HP: load() sets isLoaded=true after successful fetch", async () => {
    mockGqlMyServices.mockResolvedValue([SERVICE_A]);

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().isLoaded).toBe(true);
  });

  it("HP: load() sets isLoading=false after successful fetch (finally guard)", async () => {
    mockGqlMyServices.mockResolvedValue([SERVICE_A]);

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().isLoading).toBe(false);
  });

  it("HP: load() calls gqlMyServices with { limit: 100, isArchived: false }", async () => {
    mockGqlMyServices.mockResolvedValue([]);

    await useServicesStore.getState().load();

    expect(mockGqlMyServices).toHaveBeenCalledTimes(1);
    expect(mockGqlMyServices).toHaveBeenCalledWith({ limit: 100, isArchived: false });
  });

  it("HP: load() with empty response sets services to empty array and isLoaded=true", async () => {
    mockGqlMyServices.mockResolvedValue([]);

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().services).toEqual([]);
    expect(useServicesStore.getState().isLoaded).toBe(true);
  });

  it("EC: load() when already isLoaded=true — skips fetch entirely", async () => {
    useServicesStore.setState({ isLoaded: true, services: [SERVICE_A] });

    await useServicesStore.getState().load();

    expect(mockGqlMyServices).not.toHaveBeenCalled();
    expect(useServicesStore.getState().services).toEqual([SERVICE_A]); // untouched
  });

  it("EC: load() when already isLoading=true — skips fetch entirely", async () => {
    useServicesStore.setState({ isLoading: true });

    await useServicesStore.getState().load();

    expect(mockGqlMyServices).not.toHaveBeenCalled();
  });

  it("EC: load() on network error — does not throw", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Network error"));

    await expect(useServicesStore.getState().load()).resolves.toBeUndefined();
  });

  it("EC: load() on network error — isLoaded stays false", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Network error"));

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().isLoaded).toBe(false);
  });

  it("EC: load() on network error — isLoading ends as false (finally always runs)", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Timeout"));

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().isLoading).toBe(false);
  });

  it("EC: load() on network error — services array remains empty", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Server error"));

    await useServicesStore.getState().load();

    expect(useServicesStore.getState().services).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// refresh()
// ══════════════════════════════════════════════════════════════════════════════

describe("refresh()", () => {
  it("HP: refresh() fetches services even when isLoaded=true (no guard)", async () => {
    useServicesStore.setState({ isLoaded: true, services: [SERVICE_A] });
    mockGqlMyServices.mockResolvedValue([SERVICE_B]);

    await useServicesStore.getState().refresh();

    expect(mockGqlMyServices).toHaveBeenCalledTimes(1);
  });

  it("HP: refresh() updates services array with fresh data from server", async () => {
    useServicesStore.setState({ isLoaded: true, services: [SERVICE_A] });
    mockGqlMyServices.mockResolvedValue([SERVICE_B]);

    await useServicesStore.getState().refresh();

    expect(useServicesStore.getState().services).toEqual([SERVICE_B]);
  });

  it("HP: refresh() sets isLoaded=true after successful fetch", async () => {
    mockGqlMyServices.mockResolvedValue([SERVICE_A]);

    await useServicesStore.getState().refresh();

    expect(useServicesStore.getState().isLoaded).toBe(true);
  });

  it("HP: refresh() sets isLoading=false after successful fetch", async () => {
    mockGqlMyServices.mockResolvedValue([]);

    await useServicesStore.getState().refresh();

    expect(useServicesStore.getState().isLoading).toBe(false);
  });

  it("HP: refresh() calls gqlMyServices with { limit: 100, isArchived: false }", async () => {
    mockGqlMyServices.mockResolvedValue([]);

    await useServicesStore.getState().refresh();

    expect(mockGqlMyServices).toHaveBeenCalledWith({ limit: 100, isArchived: false });
  });

  it("EC: refresh() on network error — does not throw", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Network error"));

    await expect(useServicesStore.getState().refresh()).resolves.toBeUndefined();
  });

  it("EC: refresh() on network error — isLoading ends as false (finally always runs)", async () => {
    mockGqlMyServices.mockRejectedValue(new Error("Timeout"));

    await useServicesStore.getState().refresh();

    expect(useServicesStore.getState().isLoading).toBe(false);
  });

  it("EC: refresh() on network error — existing services are preserved", async () => {
    useServicesStore.setState({ services: [SERVICE_A], isLoaded: true });
    mockGqlMyServices.mockRejectedValue(new Error("Server error"));

    await useServicesStore.getState().refresh();

    // services should be unchanged — refresh only overwrites on success
    expect(useServicesStore.getState().services).toEqual([SERVICE_A]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// reset()
// ══════════════════════════════════════════════════════════════════════════════

describe("reset()", () => {
  it("HP: reset() clears services to empty array", () => {
    useServicesStore.setState({ services: [SERVICE_A, SERVICE_B] });
    useServicesStore.getState().reset();
    expect(useServicesStore.getState().services).toEqual([]);
  });

  it("HP: reset() sets isLoaded to false", () => {
    useServicesStore.setState({ isLoaded: true });
    useServicesStore.getState().reset();
    expect(useServicesStore.getState().isLoaded).toBe(false);
  });

  it("HP: reset() sets isLoading to false", () => {
    useServicesStore.setState({ isLoading: true });
    useServicesStore.getState().reset();
    expect(useServicesStore.getState().isLoading).toBe(false);
  });

  it("HP: load() after reset() fetches again because isLoaded guard was cleared", async () => {
    // First load populates the store
    mockGqlMyServices.mockResolvedValue([SERVICE_A]);
    await useServicesStore.getState().load();
    expect(useServicesStore.getState().isLoaded).toBe(true);

    // Reset clears the guard
    useServicesStore.getState().reset();
    expect(useServicesStore.getState().isLoaded).toBe(false);

    // Second load should actually call the API again
    mockGqlMyServices.mockResolvedValue([SERVICE_B]);
    await useServicesStore.getState().load();

    expect(mockGqlMyServices).toHaveBeenCalledTimes(2);
    expect(useServicesStore.getState().services).toEqual([SERVICE_B]);
  });

  it("EC: reset() on already-empty state does not throw", () => {
    expect(() => useServicesStore.getState().reset()).not.toThrow();
    expect(useServicesStore.getState().services).toEqual([]);
    expect(useServicesStore.getState().isLoaded).toBe(false);
    expect(useServicesStore.getState().isLoading).toBe(false);
  });
});
