// src/utils/deviceInfo.ts
// Best-effort device name + marketing model without adding a native module.
// Android exposes Brand/Model via Platform.constants; iOS has no marketing
// model without expo-device, so we fall back to the OS-reported device name.

import { Platform } from "react-native";
import Constants from "expo-constants";

export function getDeviceName(): string {
  return Constants.deviceName?.trim() || (Platform.OS === "ios" ? "iPhone" : "Android device");
}

export function getDeviceModel(): string {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  if (Platform.OS === "android") {
    const brand = String(c.Brand ?? "").trim();
    const model = String(c.Model ?? "").trim();
    const label = [brand && brand[0].toUpperCase() + brand.slice(1), model]
      .filter(Boolean)
      .join(" ")
      .trim();
    return label || getDeviceName();
  }
  // iOS: no marketing model available without expo-device.
  return getDeviceName();
}
