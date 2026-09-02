import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

interface StaffPinState {
  pins: Record<string, string>; // staffId → SHA-256 hash of "lalaba:pin:<staffId>:<pin>"
  setPin:          (staffId: string, pin: string) => Promise<void>;
  verifyPin:       (staffId: string, pin: string) => Promise<boolean>;
  hasPin:          (staffId: string) => boolean;
  removePin:       (staffId: string) => void;
}

async function hashPin(staffId: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `lalaba:pin:${staffId}:${pin}`
  );
}

export const useStaffPinStore = create<StaffPinState>()(
  persist(
    (set, get) => ({
      pins: {},

      setPin: async (staffId, pin) => {
        const hash = await hashPin(staffId, pin);
        set((s) => ({ pins: { ...s.pins, [staffId]: hash } }));
      },

      verifyPin: async (staffId, pin) => {
        const stored = get().pins[staffId];
        if (!stored) return false;
        const hash = await hashPin(staffId, pin);
        return stored === hash;
      },

      hasPin: (staffId) => !!get().pins[staffId],

      removePin: (staffId) =>
        set((s) => {
          const p = { ...s.pins };
          delete p[staffId];
          return { pins: p };
        }),
    }),
    { name: "staff-pins-v2", storage: createJSONStorage(() => AsyncStorage) }
  )
);
