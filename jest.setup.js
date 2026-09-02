// Jest setup — shared stubs for things that only exist at app runtime.
//
// src/config/firebase.ts reads its config from `Constants.expoConfig.extra`,
// which app.config.ts populates at bundle time and Jest does not. Any suite
// that transitively imports it (posOrderStore, activeStaffStore, the login
// screen) used to die at import with "Firebase config missing from
// app.config.ts extra" — so those suites were excluded from `test:ci` rather
// than fixed, and stayed dark. They run again now.
//
// The values are deliberately fake: nothing here talks to a real Firebase
// project. They only have to be present and well-shaped enough for
// initializeApp to succeed.

// AsyncStorage is also a native module: importing it in Node throws
// "NativeModule: AsyncStorage is null". The package ships an official in-memory
// mock for exactly this. Suites that want to assert on reads/writes still mock
// it themselves — a local jest.mock wins over this one.
jest.mock(
  "@react-native-async-storage/async-storage",
  () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// react-native-webview is native too: importing it asks TurboModuleRegistry for
// 'RNCWebViewModule' and throws when it is absent. The map modal it powers is a
// device concern, so a plain View stand-in is enough for anything under test.
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { __esModule: true, WebView: View, default: View };
});

// @react-native-firebase/* are NATIVE modules — importing one in Node throws
// "Native module RNFBAppModule not found". Push notifications are a device
// concern with no emulator, so nothing under test exercises them for real; the
// only requirement is that importing the module does not explode.
jest.mock("@react-native-firebase/messaging", () => {
  const messaging = () => ({
    requestPermission: jest.fn().mockResolvedValue(1),
    getToken: jest.fn().mockResolvedValue("test-fcm-token"),
    deleteToken: jest.fn().mockResolvedValue(undefined),
    onMessage: jest.fn(() => () => {}),
    onTokenRefresh: jest.fn(() => () => {}),
    onNotificationOpenedApp: jest.fn(() => () => {}),
    getInitialNotification: jest.fn().mockResolvedValue(null),
    setBackgroundMessageHandler: jest.fn(),
  });
  messaging.AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return { __esModule: true, default: messaging };
});

jest.mock("@react-native-firebase/app", () => ({
  __esModule: true,
  default: { apps: [], initializeApp: jest.fn() },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebaseConfig: {
          apiKey: "test-api-key",
          authDomain: "lalaba-test.firebaseapp.com",
          projectId: "lalaba-test",
          storageBucket: "lalaba-test.appspot.com",
          messagingSenderId: "000000000000",
          appId: "1:000000000000:web:testappid",
        },
      },
    },
  },
}));

// firebase/auth's React Native entry pulls in native persistence that has no
// place in a Node test run. Auth is never exercised for real here — suites that
// care about auth behaviour mock the store, not the SDK.
jest.mock("firebase/auth", () => ({
  __esModule: true,
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  getAuth: jest.fn(() => ({ currentUser: null })),
  inMemoryPersistence: {},
  connectAuthEmulator: jest.fn(),
  onAuthStateChanged: jest.fn(() => () => {}),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  updatePassword: jest.fn(),
  reauthenticateWithCredential: jest.fn(),
  EmailAuthProvider: { credential: jest.fn() },
}));

// APPCHK — the App Check native module (RNFBAppModule) does not exist under
// Jest, so importing it fails the whole suite at load time. Mocked to the
// shape src/config/appCheck.ts actually uses; behaviour is covered by the
// backend AppCheckGuard spec and by on-device evidence, not from here.
jest.mock("@react-native-firebase/app-check", () => {
  const provider = { configure: jest.fn() };
  const appCheck = () => ({
    newReactNativeFirebaseAppCheckProvider: () => provider,
  });
  return {
    __esModule: true,
    default: appCheck,
    firebase: {
      appCheck: () => ({
        initializeAppCheck: jest.fn(),
        getToken: jest.fn().mockResolvedValue({ token: "test-app-check-token" }),
      }),
    },
  };
});
