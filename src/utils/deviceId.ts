// src/utils/deviceId.ts
// Generates and persists a stable device UUID in AsyncStorage.
// Used for device registration so the owner can approve/block this device.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoCrypto from "expo-crypto";

const KEY = "lalaba:deviceId";

let _cached: string | null = null;

function uuidv4(): string {
  const bytes = ExpoCrypto.getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function getDeviceId(): Promise<string> {
  if (_cached) return _cached;
  const stored = await AsyncStorage.getItem(KEY);
  if (stored) { _cached = stored; return stored; }
  const id = uuidv4();
  await AsyncStorage.setItem(KEY, id);
  _cached = id;
  return id;
}
