import { useMaintenanceStore } from "../maintenanceStore";
import { getPublicMaintenanceStatus } from "../../services/graphql/maintenance";

jest.mock("../../services/graphql/maintenance", () => ({
  getPublicMaintenanceStatus: jest.fn(),
}));

const mocked = getPublicMaintenanceStatus as jest.MockedFunction<
  typeof getPublicMaintenanceStatus
>;

/**
 * GAP-MNT-001, app side.
 *
 * The rule that matters most here is the negative one: a request that fails
 * must NOT read as maintenance. Getting that backwards turns every network
 * blip into a self-inflicted platform-wide outage, which is strictly worse
 * than the problem this check exists to announce.
 */
describe("maintenance cold-start check", () => {
  const reset = () =>
    useMaintenanceStore.setState({
      active: false,
      mode: null,
      message: null,
      endsAt: null,
      supportEmail: null,
      supportPhone: null,
      bootstrapChecked: false,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    reset();
  });

  const status = (over: Record<string, unknown> = {}) =>
    ({
      blocked: true,
      type: "EMERGENCY",
      message: "Under maintenance.",
      endsAt: null,
      supportEmail: "help@lalaba.ph",
      supportPhone: null,
      ...over,
    }) as Awaited<ReturnType<typeof getPublicMaintenanceStatus>>;

  it("blocks before any sign-in when the app is down (TEST-MNT-002)", async () => {
    mocked.mockResolvedValue(status());
    await useMaintenanceStore.getState().checkPublic();

    const s = useMaintenanceStore.getState();
    expect(s.active).toBe(true);
    expect(s.mode).toBe("EMERGENCY");
    expect(s.message).toBe("Under maintenance.");
    expect(s.supportEmail).toBe("help@lalaba.ph");
    expect(s.bootstrapChecked).toBe(true);
  });

  it("leaves the app open when nothing is blocked", async () => {
    mocked.mockResolvedValue(status({ blocked: false, type: null, message: null }));
    await useMaintenanceStore.getState().checkPublic();

    expect(useMaintenanceStore.getState().active).toBe(false);
    expect(useMaintenanceStore.getState().bootstrapChecked).toBe(true);
  });

  // TEST-MNT-008 — the one that must never regress.
  it("does NOT treat a network failure as maintenance", async () => {
    mocked.mockRejectedValue(new Error("Network request failed"));
    await useMaintenanceStore.getState().checkPublic();

    expect(useMaintenanceStore.getState().active).toBe(false);
    // Still marked checked, or the splash would never release.
    expect(useMaintenanceStore.getState().bootstrapChecked).toBe(true);
  });

  it("does not hang the splash when the backend never answers", async () => {
    jest.useFakeTimers();
    mocked.mockImplementation(() => new Promise(() => {}));

    const pending = useMaintenanceStore.getState().checkPublic();
    jest.advanceTimersByTime(10_000);
    await pending;

    expect(useMaintenanceStore.getState().active).toBe(false);
    expect(useMaintenanceStore.getState().bootstrapChecked).toBe(true);
    jest.useRealTimers();
  });

  it("never rejects, whatever the backend does", async () => {
    mocked.mockRejectedValue(new Error("boom"));
    await expect(
      useMaintenanceStore.getState().checkPublic(),
    ).resolves.toBeUndefined();
  });

  it("ignores a blocked answer with no type rather than blocking blindly", async () => {
    // Defensive: `active` without a `mode` would render a screen that cannot
    // choose its own icon, title or countdown.
    mocked.mockResolvedValue(status({ type: null }));
    await useMaintenanceStore.getState().checkPublic();

    expect(useMaintenanceStore.getState().active).toBe(false);
  });

  describe("support contacts reach the screen (TEST-MNT-005/006/007)", () => {
    it("email only", async () => {
      mocked.mockResolvedValue(
        status({ supportEmail: "help@lalaba.ph", supportPhone: null }),
      );
      await useMaintenanceStore.getState().checkPublic();
      const s = useMaintenanceStore.getState();
      expect(s.supportEmail).toBe("help@lalaba.ph");
      expect(s.supportPhone).toBeNull();
    });

    it("phone only", async () => {
      mocked.mockResolvedValue(
        status({ supportEmail: null, supportPhone: "+63 900 000 0000" }),
      );
      await useMaintenanceStore.getState().checkPublic();
      const s = useMaintenanceStore.getState();
      expect(s.supportEmail).toBeNull();
      expect(s.supportPhone).toBe("+63 900 000 0000");
    });

    it("both", async () => {
      mocked.mockResolvedValue(
        status({ supportEmail: "help@lalaba.ph", supportPhone: "+63 900 000 0000" }),
      );
      await useMaintenanceStore.getState().checkPublic();
      const s = useMaintenanceStore.getState();
      expect(s.supportEmail).toBe("help@lalaba.ph");
      expect(s.supportPhone).toBe("+63 900 000 0000");
    });
  });

  // TEST-MNT-009 / TEST-MNT-010 — the other two detection moments still work.
  describe("the other two detection paths are unchanged", () => {
    it("a MAINTENANCE_MODE rejection blocks immediately, with contacts", () => {
      useMaintenanceStore.getState().setActive({
        mode: "EMERGENCY",
        message: "Down.",
        endsAt: null,
        supportEmail: "help@lalaba.ph",
        supportPhone: "+63 900 000 0000",
      });
      const s = useMaintenanceStore.getState();
      expect(s.active).toBe(true);
      expect(s.supportEmail).toBe("help@lalaba.ph");
    });

    it("clearing releases the app and forgets the contacts", () => {
      useMaintenanceStore.getState().setActive({
        mode: "EMERGENCY",
        message: "Down.",
        endsAt: null,
        supportEmail: "help@lalaba.ph",
        supportPhone: null,
      });
      useMaintenanceStore.getState().clear();
      const s = useMaintenanceStore.getState();
      expect(s.active).toBe(false);
      expect(s.supportEmail).toBeNull();
    });
  });
});
