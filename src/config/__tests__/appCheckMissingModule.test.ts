jest.mock("@react-native-firebase/app-check", () => {
  throw new Error("Native module RNFBAppModule not found. Re-check module install, linking, configuration, build and install steps.");
});
describe("binary without the App Check native module", () => {
  it("EC: importing config/appCheck does not throw at module load", () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../appCheck");
    }).not.toThrow();
  });
  it("EC: initAppCheck degrades instead of crashing", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("../appCheck") as typeof import("../appCheck");
    expect(() => m.initAppCheck()).not.toThrow();
  });
  it("EC: token accessors return null rather than throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("../appCheck") as typeof import("../appCheck");
    await expect(m.getAppCheckToken()).resolves.toBeNull();
    await expect(m.getNativeAppCheckToken()).resolves.toBeNull();
  });
});
