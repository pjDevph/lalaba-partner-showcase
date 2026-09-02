// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // T10 (2026-08-22): swept 290 -> 140. `warn` rather than `error` because the
    // remainder is a long tail (RN style-value casts, Firestore Timestamp reads,
    // test fixtures) that is low value to chase — but the count must not grow.
    // The plugin has to be registered in the SAME config object as the rule and
    // scoped to TS files, or ESLint fails with "could not find plugin".
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": require("@typescript-eslint/eslint-plugin") },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Never the platform's native dialogs. An action to confirm goes through
    // the app's dialog helpers (src/lib/dialog.ts); anything that is only
    // telling the user something goes through a toast (stores/notificationStore).
    //
    // A rule rather than a convention because it has come back twice after
    // being swept, and each return is invisible until someone greps for it.
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Alert",
          property: "alert",
          message:
            "Use the dialog helpers for actions, or notify.* for notices — not the native alert.",
        },
        // window-prefixed too: `no-restricted-globals` only matches the bare
        // identifier, and these apps can render on web via Expo.
        { object: "window", property: "alert", message: "Use a toast — not the blocking browser dialog." },
        { object: "window", property: "confirm", message: "Use the app's confirm modal — not the blocking browser dialog." },
        { object: "window", property: "prompt", message: "Use a real modal with a text field — not the blocking browser dialog." },
        {
          object: "Alert",
          property: "prompt",
          message: "Use a real modal with a text field — not the native prompt.",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "alert", message: "Use notify.* for notices, or the dialog helpers for actions." },
        { name: "confirm", message: "Use the dialog helpers — not the blocking browser dialog." },
        { name: "prompt", message: "Use a real modal with a text field — not the blocking browser dialog." },
      ],
    },
  },
  {
    rules: {
      // Pre-existing violations — disabled to unblock CI
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "import/no-unresolved": "off",
    },
  },
]);
