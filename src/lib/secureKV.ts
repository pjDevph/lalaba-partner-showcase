// src/lib/secureKV.ts
// Small key-value wrapper around expo-secure-store (Keychain / Keystore) with
// an AsyncStorage fallback, used for secrets that must NOT live in plain
// AsyncStorage (biometric credential ids — see authStore).
//
// The fallback exists for environments where the native module isn't linked
// (e.g. an Expo Go build predating the dependency, or jest). When it engages,
// values are no better protected than before — callers should treat SecureStore
// as the target state and the fallback as a migration bridge only.

import AsyncStorage from "@react-native-async-storage/async-storage";

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  isAvailableAsync?: () => Promise<boolean>;
};

let SecureStore: SecureStoreModule | null = null;
try {
  // Lazy/optional: keep the app booting even if the native module is missing.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require("expo-secure-store");
} catch {
  SecureStore = null;
}

/** Which backend secrets are actually stored in — for diagnostics/evidence. */
export const secureKVBackend: "secure-store" | "async-storage" =
  SecureStore ? "secure-store" : "async-storage";

// Namespaced fallback keys so they can't collide with zustand persist blobs.
const fallbackKey = (key: string) => `securekv.${key}`;

export async function secureGet(key: string): Promise<string | null> {
  if (SecureStore) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  }
  return AsyncStorage.getItem(fallbackKey(key));
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      // fall through to AsyncStorage so the value isn't silently lost
    }
  }
  await AsyncStorage.setItem(fallbackKey(key), value);
}

export async function secureDelete(key: string): Promise<void> {
  if (SecureStore) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // still clear any fallback copy below
    }
  }
  await AsyncStorage.removeItem(fallbackKey(key)).catch(() => {});
}
