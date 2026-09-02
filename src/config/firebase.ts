// src/config/firebase.ts
// Firebase client SDK — authentication only.
// MongoDB (via NestJS GraphQL) is the database. Firestore is not used.
// Config is injected via app.config.ts extra → Constants.expoConfig.extra

import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, inMemoryPersistence, connectAuthEmulator } from "firebase/auth";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { devLog } from "../utils/devLog";
import { initAppCheck } from "./appCheck";
import { initAppCheckBridge } from "./appCheckBridge";

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function getFirebaseConfig(): FirebaseConfig {
  const extra = Constants.expoConfig?.extra as { firebaseConfig?: FirebaseConfig } | undefined;
  if (!extra?.firebaseConfig) {
    throw new Error("Firebase config missing from app.config.ts extra");
  }
  return extra.firebaseConfig;
}

const alreadyInitialized = getApps().length > 0;
const app = alreadyInitialized ? getApp() : initializeApp(getFirebaseConfig());


// APPCHK-003 — before Auth is constructed below and before any GraphQL call.
// A token requested before initialization resolves to nothing, and the first
// request of a cold start is exactly the one that matters.
initAppCheck();

// APPCHK-016X — EXPERIMENTAL, default OFF (EXPO_PUBLIC_APPCHK_016X=on).
// Bridges the native attestation above into the JS Firebase app so that
// firebase/auth can attach X-Firebase-AppCheck to Authentication requests.
// Must run on THIS app instance and before `auth` is constructed below.
// Remove this call and appCheckBridge.ts to revert the spike entirely.
initAppCheckBridge(app);

if (!alreadyInitialized) {
  const cfg = getFirebaseConfig();
  devLog(`🔥 [Firebase] Initialized — project: ${cfg.projectId}`);
} else {
  devLog("🔥 [Firebase] Reusing existing app instance (HMR)");
}

// In-memory persistence: the session survives backgrounding (the JS runtime
// stays alive) but NOT a force-close / cold start. So a fully closed app requires
// a fresh login, while backgrounding keeps the user signed in.
// If the module is evaluated a second time (HMR), fall back to getAuth().
const auth = alreadyInitialized
  ? getAuth(app)
  : initializeAuth(app, { persistence: inMemoryPersistence });

// Connect to Firebase Auth emulator when EXPO_PUBLIC_USE_EMULATOR=true.
// Android AVD maps host machine loopback to 10.0.2.2 — never "localhost".
// Override by setting EXPO_PUBLIC_EMULATOR_HOST (e.g. your LAN IP for a physical device).
if (!alreadyInitialized && process.env.EXPO_PUBLIC_USE_EMULATOR === "true") {
  const defaultHost = Platform.OS === "android" ? "10.0.2.2" : "localhost"; // NOSONAR
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? defaultHost;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  devLog(`🔥 [Firebase] Auth emulator → http://${host}:9099`);
}

export { app, auth };
