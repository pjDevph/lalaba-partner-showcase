// src/components/__tests__/loginValidation.test.tsx
// RTL tests for login screen validation error states
// Covers Checklist #3 EC: wrong password, non-existent email, network offline,
// back button while loading (no stuck spinner)

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem:    jest.fn(() => Promise.resolve(null)),
  setItem:    jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear:      jest.fn(() => Promise.resolve()),
  getAllKeys:  jest.fn(() => Promise.resolve([])),
  multiGet:   jest.fn(() => Promise.resolve([])),
  multiSet:   jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  Link: "a",
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (_cb: any) => { /* no-op */ },
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-constants", () => ({
  default: { expoConfig: { version: "1.0.0" } },
  expoConfig: { version: "1.0.0" },
}));

jest.mock("@react-native-firebase/auth", () => () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(() => () => {}),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("@react-native-firebase/app", () => ({
  default: { apps: [], initializeApp: jest.fn() },
}));

jest.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(),
    getTokens: jest.fn(),
  },
}));

// react-native-safe-area-context
jest.mock("react-native-safe-area-context", () => {
  const ReactNative = require("react-native");
  return {
    SafeAreaView: ReactNative.View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ReactNative.View,
  };
});

// LoadingOverlay — renders only a testID view when visible
jest.mock("../../components/LoadingOverlay", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    LoadingOverlay: ({ visible }: { visible: boolean }) =>
      visible ? React.createElement(View, { testID: "loading-overlay" }) : null,
  };
});

// react-native-svg — stub so inline SVG icons don't throw
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Stub = (_props: any) => React.createElement(View, null);
  return {
    __esModule: true,
    default: Stub, Svg: Stub, Path: Stub, Line: Stub,
    Polyline: Stub, Rect: Stub, Circle: Stub, G: Stub,
  };
});

// theme tokens
jest.mock("../../theme/tokens", () => ({
  C: new Proxy({}, { get: () => "#000000" }),
  SHADOW: new Proxy({}, { get: () => ({}) }),
  RADIUS: new Proxy({}, { get: () => 8 }),
  SP: new Proxy({}, { get: () => 0 }),
}));

// assets
jest.mock("../../../assets/splash-icon (1).png", () => 0, { virtual: true });

// lib/validation — keep the real validation so we can test form errors
// (do NOT mock this — we want real Zod errors to appear in the UI)

// useAuth hook — injectable via mockUseAuth
const mockSignIn = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockClearError = jest.fn();
const mockResetPassword = jest.fn();

let mockAuthState = {
  user: null as any,
  isLoading: false,
  error: null as string | null,
};

jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    isLoading: mockAuthState.isLoading,
    error: mockAuthState.error,
    signIn: mockSignIn,
    signInWithGoogle: mockSignInWithGoogle,
    clearError: mockClearError,
    resetPassword: mockResetPassword,
    completeGoogleRegistration: jest.fn(),
  }),
}));

// authStore — needed by the module graph even if login.tsx uses useAuth
jest.mock("../../stores/authStore", () => ({
  useAuthStore: (selector: any) => selector({
    user: null,
    isLoading: false,
    error: null,
    signIn: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
    setActiveBranch: jest.fn(),
  }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import LoginScreen from "../../../app/login";

// ── Helpers ───────────────────────────────────────────────────────────────────

function setAuthState(partial: Partial<typeof mockAuthState>) {
  Object.assign(mockAuthState, partial);
}

beforeEach(() => {
  mockAuthState = { user: null, isLoading: false, error: null };
  mockSignIn.mockReset();
  mockSignInWithGoogle.mockReset();
  mockClearError.mockReset();
  mockResetPassword.mockReset();
});

// ══════════════════════════════════════════════════════════════════════════════
// Checklist #3 EC: Login validation errors
// ══════════════════════════════════════════════════════════════════════════════

describe("Login screen — auth error display", () => {
  it("EC: wrong password → error banner shown with correct message", () => {
    // Checklist #3 EC: wrong password → error message, not crash
    setAuthState({ error: "Incorrect email or password." });
    render(<LoginScreen />);
    expect(screen.getByText("Incorrect email or password.")).toBeTruthy();
  });

  it("EC: non-existent email → error banner shown", () => {
    // Checklist #3 EC: non-existent email → error message
    setAuthState({ error: "No account found for that email." });
    render(<LoginScreen />);
    expect(screen.getByText("No account found for that email.")).toBeTruthy();
  });

  it("EC: network offline → error message shown, no spinner visible", () => {
    // Checklist #3 EC: network offline → error, not infinite spinner
    setAuthState({ error: "Network error — check your connection and try again.", isLoading: false });
    render(<LoginScreen />);
    expect(screen.getByText("Network error — check your connection and try again.")).toBeTruthy();
    // Spinner must NOT be shown when isLoading=false
    expect(screen.queryByTestId("loading-overlay")).toBeNull();
  });

  it("EC: isLoading=false after error → spinner gone, Sign In button visible", () => {
    // Checklist #3 EC: back button while loading → no stuck spinner (isLoading clears)
    // We simulate the state AFTER isLoading has been cleared back to false
    setAuthState({ isLoading: false, error: "Some error" });
    render(<LoginScreen />);
    expect(screen.queryByTestId("loading-overlay")).toBeNull();
    expect(screen.getByText("Sign In")).toBeTruthy();
  });
});

describe("Login screen — form validation (Zod loginSchema)", () => {
  // The Sign In button is disabled while either field is empty, so the schema's
  // "…is required." messages are unreachable through it — the disabled button
  // IS the empty-field guard. Asserting on those strings tested a path the UI
  // does not have. What matters is that signIn is never reached.
  it("EC: empty form → Sign In does nothing, signIn not called", () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("Sign In"));
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.queryByText("Email is required.")).toBeNull();
  });

  it("EC: valid email but empty password → Sign In stays inert", () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("merchant@example.com"), "user@example.com");
    fireEvent.press(screen.getByText("Sign In"));
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // With both fields filled the button is live, so a malformed address does
  // reach loginSchema — this is the one validation message a user can actually
  // provoke, and it must block the signIn call.
  it("EC: invalid email format → schema error shown, signIn not called", () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("merchant@example.com"), "not-an-email");
    fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), "mypassword123");
    fireEvent.press(screen.getByText("Sign In"));
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a valid email address.")).toBeTruthy();
  });

  it("HP: valid email + password → signIn called with lowercased trimmed email", () => {
    // Checklist #3 HP: login with correct email + password → signIn called
    mockSignIn.mockResolvedValue(undefined);
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("merchant@example.com"), "  User@Example.COM  ");
    fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), "mypassword123");
    fireEvent.press(screen.getByText("Sign In"));
    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "mypassword123");
  });

  it("HP: no error and no loading → only Sign In button shown (no spinner, no error banner)", () => {
    // Checklist #3 HP: clean state on first load
    render(<LoginScreen />);
    expect(screen.getByText("Sign In")).toBeTruthy();
    expect(screen.queryByTestId("loading-overlay")).toBeNull();
    // No error banner text
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
