// Stub for `expo-constants` in tests.
//
// app.config.ts injects the Firebase client config into
// `Constants.expoConfig.extra` at bundle time. Jest never runs app.config.ts, so
// src/config/firebase.ts threw "Firebase config missing from app.config.ts
// extra" at import — killing every suite that transitively imported it
// (authStore, posOrderStore, activeStaffStore, the login screen). Those four
// were excluded from `test:ci` rather than fixed, so they had stopped running
// entirely.
//
// Mapped via moduleNameMapper rather than jest.mock() in a setup file: the
// jest-expo preset supplies its own expo-constants, and a setup-file mock does
// not reliably win against it.
//
// The values are fake and reach nothing — firebase/auth is stubbed separately
// in jest.setup.js, so no network or native module is involved.
module.exports = {
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        firebaseConfig: {
          apiKey: 'test-api-key',
          authDomain: 'lalaba-test.firebaseapp.com',
          projectId: 'lalaba-test',
          storageBucket: 'lalaba-test.appspot.com',
          messagingSenderId: '000000000000',
          appId: '1:000000000000:web:testappid',
        },
      },
    },
    executionEnvironment: 'standalone',
  },
};
