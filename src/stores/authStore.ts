// src/stores/authStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// AUTH STORE  (live backend — Firebase Auth + GraphQL)
//
// Authentication now runs against the real backend:
//   • register() → Firebase createUserWithEmailAndPassword, then the registerUser
//     GraphQL mutation creates the Mongo user document (role = merchant).
//   • signIn()   → Firebase signInWithEmailAndPassword, then `me` resolves the
//     profile + branch memberships.
//   • initAuthListener() → onAuthStateChanged keeps the session in sync and
//     restores it across app restarts (Firebase persists to AsyncStorage).
//
// Branch membership model is preserved so the rest of the app (routing, branch
// selection) keeps working: a MERCHANT's memberships are derived from
// myBranches; a STAFF member's from me.branchIds.
//
// All domains now use the real GraphQL backend — no mock backend remaining.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { errField } from "../utils/userError";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { secureGet, secureSet, secureDelete } from "../lib/secureKV";
import { auth } from "../config/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithCredential,
  signInWithCustomToken,
  GoogleAuthProvider,
} from "firebase/auth";
import Constants from "expo-constants";
import { setDeviceRequestFlowActive, ApiError } from "../config/graphql";
import { Platform } from "react-native";
import { fetchMe, registerUser, type GqlHomeAddress, type GqlConsentInput } from "../services/graphql/auth";
import { unregisterPushToken } from "../services/push";
import { getDeviceId } from "../utils/deviceId";
import {
  isBiometricAvailable,
  createKeypair,
  deleteKeypair,
  signChallenge,
} from "../services/biometrics/biometricAuth";
import {
  enrollBiometric as gqlEnrollBiometric,
  revokeBiometric as gqlRevokeBiometric,
  requestBiometricChallenge,
  biometricLogin as gqlBiometricLogin,
} from "../services/graphql/biometrics";
import { fetchMyBranches } from "../services/graphql/branches";
import { gqlMyPermissionGroups, clearPermissionsCache } from "../services/graphql/permissions";
import {
  resolvePermissions,
  permissionsFromGroups,
  ROLE_DEFAULTS,
  type PermissionMap,
  type StaffRole,
} from "../types/permissions";
import type { BranchMember } from "./merchantStore";
import { devLog, devWarn } from "../utils/devLog";

// Policy acceptances captured at registration. Reaching the "Create account"
// step requires accepting the Terms and Privacy Policy; the Partner Terms also
// cover the Merchant Agreement, which the backend requires for merchant/washer
// roles. Sending all three keeps registration valid across Partner roles.
const POLICY_VERSION = "1.0";
const registrationConsents = (): GqlConsentInput[] =>
  ["terms_of_service", "privacy_policy", "merchant_agreement"].map((policyType) => ({
    policyType,
    version: POLICY_VERSION,
    locale: "en",
  }));

export type UserRole = "MERCHANT" | "STAFF" | "WASHER" | "COURIER" | "ADMIN";

// ─── Branch role ─────────────────────────────────────────────────────────────
// A staff member's membership of a branch. There is no MANAGER: every
// membership is built with role "staff", so the distinction never existed
// outside the type. Access comes from per-branch permissions.
type BranchRole = "STAFF" | null;

// ─── AuthUser ────────────────────────────────────────────────────────────────
export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  firstName?: string | null;
  lastName?: string | null;
  homeAddress?: GqlHomeAddress | null;
  role: UserRole;
  merchantId: string | null;
  permissionIds: string[];
  // Courier liveness selfie, doubling as the profile picture. Null for every
  // other role, and for a courier who has not taken one yet.
  photoUrl?: string | null;
  // Gate state read by the courier branch of the routing effect in
  // app/_layout.tsx. Anything other than "ACTIVE" keeps the rider on
  // /courier-selfie. Null for every non-courier role.
  selfieStatus?: "ACTIVE" | "SUPERSEDED" | "REVOKED" | null;
}

// ─── AuthState ───────────────────────────────────────────────────────────────
interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  // ── Flat convenience fields (derived from user + branchMemberships) ────────
  merchantId: string | null;
  orgId: string | null;
  branchId: string | null;
  role: UserRole | null;

  // ── Branch membership state ────────────────────────────────────────────────
  branchIds: string[];
  activeBranchId: string | null;
  activeBranchName: string | null;
  activeBranchRole: BranchRole;
  branchMemberships: BranchMember[];

  // Device-lock: when a staff is on a registered device bound to one branch,
  // this holds that branchId so the UI restricts to it (reqs #2/#3). Null for
  // owners/washers or unlocked sessions.
  deviceBranchId: string | null;

  // Resolved per-staff permission map for an individually-authenticated
  // account (i.e. NOT using the shared-terminal shift selector). Starts as
  // the safe role-default baseline and is refined once per-staff overrides
  // (permissionIds) are translated — see refineResolvedPermissions().
  resolvedPermissions: PermissionMap | null;

  hasResolved: boolean;
  isNewGoogleUser: boolean;
  businessSetupDeferred: boolean;
  postRegistrationFlow: boolean;
  _signingIn: boolean;

  // ── Biometric login (device-bound keypair) ────────────────────────────────
  // credentialId + email survive sign-out so the login screen can offer "Sign
  // in with Face ID" on the next launch. Neither is a secret — the private key
  // lives biometric-gated in secure hardware and never touches JS/AsyncStorage.
  biometricCredentialId: string | null;
  biometricEnrolledEmail: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string, phone: string, roleId: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  // Enrol the CURRENT (signed-in) account for biometric login on this device.
  enableBiometric: () => Promise<{ ok: boolean; error?: string }>;
  // Sign in with Face ID / fingerprint using the enrolled device credential.
  signInWithBiometric: () => Promise<void>;
  // Remove biometric login from this device (deletes the keypair + revokes BE).
  disableBiometric: () => Promise<void>;
  completeGoogleRegistration: (phone: string, roleId: string) => Promise<void>;
  signOut: (reasonError?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  setActiveBranch: (branchId: string) => void;
  setDeviceBranch: (branchId: string | null) => void;
  setPhotoUrl: (photoUrl: string | null) => void;
  // Adopt the selfie state the SERVER reports, including a revocation. Unlike
  // setPhotoUrl this can move the courier backwards (ACTIVE → REVOKED), which
  // is the whole point: an admin can pull the photo mid-session.
  setSelfieState: (
    photoUrl: string | null,
    selfieStatus: AuthUser["selfieStatus"],
  ) => void;
  syncBranchNames: (branches: { id: string; name: string }[]) => void;
  refreshMemberships: (uid: string) => Promise<void>;
  refreshToken: () => Promise<void>;
  setBusinessSetupDeferred: (val: boolean) => void;
  setPostRegistrationFlow: (val: boolean) => void;
  clearError: () => void;
  initAuthListener: () => () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// BE role.roleId is lowercase ("merchant"/"staff"/"admin"); the app uses
// uppercase UserRole.
// One-shot "the user JUST signed in interactively" marker, consumed by the
// routing effect in app/_layout.tsx. Distinguishes a fresh login (staff on an
// unapproved device → /device-pending request-and-wait screen) from a restored
// session (same state → auto sign-out; signing in again files a new request).
// Module-level on purpose: it must never persist across app launches.
let interactiveSignIn = false;
export function markInteractiveSignIn(): void {
  interactiveSignIn = true;
}
export function consumeInteractiveSignIn(): boolean {
  const v = interactiveSignIn;
  interactiveSignIn = false;
  return v;
}

function normalizeRole(raw: string | undefined): UserRole {
  if (!raw) return "STAFF";
  return raw.toUpperCase() as UserRole;
}

function normalizeBranchRole(raw: string | undefined): BranchRole {
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up === "STAFF") return up;
  return null;
}

// Used by Google sign-in flow to split the provider's display name into parts.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function pickActiveBranchId(memberships: BranchMember[], current: string | null): string | null {
  const ids = memberships.map((m) => m.branchId);
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids.at(0) ?? null;
  return current && ids.includes(current) ? current : null;
}

function deriveBranchRole(memberships: BranchMember[], branchId: string | null): BranchRole {
  if (!branchId) return null;
  const m = memberships.find((mb) => mb.branchId === branchId);
  if (!m) return null;
  return normalizeBranchRole(m.role);
}

function deriveBranchName(memberships: BranchMember[], branchId: string | null): string | null {
  if (!branchId) return null;
  return memberships.find((mb) => mb.branchId === branchId)?.branchName ?? null;
}

interface ResolvedSession {
  user: AuthUser;
  branchMemberships: BranchMember[];
  resolvedBranch: { branchId: string; branchRole: string } | null;
}

// The BE throws UNAUTHENTICATED with this same code for several distinct
// cases (see GqlAuthGuard): "no backend doc yet" (new Google user),
// "device not registered/deactivated", "account disabled/deactivated",
// "staff setup incomplete". Only the first means "let them through to
// registration" — everything else is a definitive, user-facing rejection.
//
// "Account not found." is the ONLY UNAUTHENTICATED case that means "this
// Firebase login has no backend User doc yet" — everything else (deactivated,
// device, incomplete staff setup) is a real, definitive rejection and must
// never be treated as "go create an account", or a deactivated user gets
// silently routed into the new-user registration flow instead of being
// blocked with a clear reason.
function isNewAccountError(err: unknown): err is { code: string; message: string } {
  const code = errField(err, "code");
  const message = errField(err, "message");
  return code === "UNAUTHENTICATED" && !!message && /account not found/i.test(message);
}

// Best-effort extraction of a real backend rejection message, so the UI shows
// e.g. "This account is scheduled for deletion. Contact support to restore
// it." instead of a generic fallback that could otherwise make a deactivated
// account look like a role/permission problem.
function backendAuthErrorMessage(err: unknown): string | null {
  return errField(err, "code") === "UNAUTHENTICATED"
    ? (errField(err, "message") ?? null)
    : null;
}

function friendlyAuthError(code?: string): string {
  switch (code) {
    case "auth/user-not-found":
      return "No partner account found for this email. Check the email, or create an account.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
    case "network-error":
      return "Network error — check your connection and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

// Resolve identity + branch memberships from the backend.
//   • MERCHANT → memberships built from myBranches (role: owner).
//   • STAFF    → memberships built from me.branchIds (role: staff). Branch names
//     aren't available from `me`; left null (the UI tolerates this).
async function fetchSession(onError?: (err: unknown) => void): Promise<ResolvedSession | null> {
  try {
    const me = await fetchMe();
    if (!me) return null;

    // role may be null if the Role document is missing from the DB — fall back
    // to inferring from the user document shape rather than hard-failing.
    const rawRoleId = me.role?.roleId;
    const inferredRole: UserRole = me.merchantId && me.merchantId !== me._id ? "STAFF" : "MERCHANT";
    const role: UserRole = rawRoleId ? normalizeRole(rawRoleId) : inferredRole;
    const merchantId = me.merchantId ?? me._id;
    const displayName = `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() || null;

    const user: AuthUser = {
      uid: me._id,
      email: me.email ?? null,
      displayName,
      firstName: me.firstName ?? null,
      lastName: me.lastName ?? null,
      homeAddress: me.homeAddress ?? null,
      role,
      merchantId,
      permissionIds: me.permissionIds ?? [],
      photoUrl: me.photoUrl ?? null,
      selfieStatus: me.selfieStatus ?? null,
    };

    let branchMemberships: BranchMember[] = [];
    if (role === "MERCHANT") {
      const branches = await fetchMyBranches();
      branchMemberships = branches.map((b) => ({
        id: `${user.uid}_${b.id}`,
        userId: user.uid,
        merchantId,
        orgId: merchantId,
        branchId: b.id,
        branchName: b.name,
        role: "owner" as const,
        status: "active" as const,
      }));
    } else {
      const ids = me.branchIds ?? [];
      branchMemberships = ids.map((bid) => ({
        id: `${user.uid}_${bid}`,
        userId: user.uid,
        merchantId,
        orgId: merchantId,
        branchId: bid,
        branchName: null,
        role: "staff" as const,
        status: "active" as const,
      }));
    }

    const resolvedBranch =
      branchMemberships.length === 1
        ? { branchId: branchMemberships[0].branchId, branchRole: branchMemberships[0].role.toUpperCase() }
        : null;

    if (__DEV__) {
      console.log(
        `✅ [Auth] ${user.email ?? user.uid} → ${user.role}` +
        (branchMemberships.length
          ? ` | ${branchMemberships.length} branch(es)`
          : " | no branches")
      );
    }
    return { user, branchMemberships, resolvedBranch };
  } catch (err) {
    devWarn("[authStore] fetchSession failed:", err);
    onError?.(err);
    return null;
  }
}

// Applies a resolved session to the store state.
function sessionToState(session: ResolvedSession, currentActiveBranchId: string | null) {
  const { user, branchMemberships, resolvedBranch } = session;
  const branchIds = branchMemberships.map((m) => m.branchId);
  const activeBranchId =
    resolvedBranch?.branchId ?? pickActiveBranchId(branchMemberships, currentActiveBranchId);
  const activeBranchRole = resolvedBranch
    ? normalizeBranchRole(resolvedBranch.branchRole)
    : deriveBranchRole(branchMemberships, activeBranchId);
  const activeBranchName = deriveBranchName(branchMemberships, activeBranchId);
  return {
    user,
    merchantId: user.merchantId,
    orgId: user.merchantId,
    branchId: activeBranchId ?? user.merchantId,
    role: user.role,
    branchIds,
    activeBranchId,
    activeBranchName,
    activeBranchRole,
    branchMemberships,
  };
}

// MERCHANT maps to OWNER (matching the backend's owner floor). Everyone else
// is STAFF, whose baseline grants nothing — their real capabilities arrive from
// myPermissionGroups for the branch they are working.
function toStaffRoleForPermissions(role: UserRole | null): StaffRole {
  return role === "MERCHANT" ? "OWNER" : "STAFF";
}

// Ask the server what this account may do on the branch it is working, and
// widen the conservative baseline to match.
//
// This replaced a client-side resolution that fetched the whole permission
// catalogue, intersected it with the account-global `permissionIds`, and
// reverse-mapped names into gating keys. That union cannot answer a per-branch
// question — it says "may do this somewhere" — so it would have opened screens
// the backend guard then refuses.
//
// Fire-and-forget by design: a safe role-default baseline is already in state,
// so a slow or failed lookup leaves the app conservative rather than
// optimistic. Never the other way round.
async function refineResolvedPermissions(baseRole: StaffRole): Promise<void> {
  try {
    const groups = await gqlMyPermissionGroups();
    if (!groups.length) return;
    useAuthStore.setState({
      resolvedPermissions: resolvePermissions(
        baseRole,
        permissionsFromGroups(groups)
      ),
    });
  } catch (err) {
    devWarn("[authStore] refineResolvedPermissions failed:", err);
  }
}

// Wraps sessionToState with permission resolution: sets a safe synchronous
// role-default baseline immediately, then kicks off the async per-staff
// override refinement (fire-and-forget — updates the store when it lands).
function applySessionPatch(session: ResolvedSession, currentActiveBranchId: string | null) {
  const patch = sessionToState(session, currentActiveBranchId);
  const baseRole = toStaffRoleForPermissions(patch.role);
  if (patch.role !== "MERCHANT") {
    void refineResolvedPermissions(baseRole);
  }
  // Suppress the device-revocation auto sign-out for the whole window between
  // "this is a STAFF session" and "routing confirmed the device is approved"
  // (cleared in app/_layout.tsx once that's known). This MUST be set here,
  // synchronously as part of the state transition — not in a React effect.
  // Other always-mounted stores (analytics/products/services) fetch data the
  // instant this session lands in the store and, on an unapproved device, get
  // the exact "device not registered" rejection the trap listens for. Those
  // components' effects can fire before app/_layout.tsx's own routing effect
  // even runs (child effects commit before parent effects), so a flag set
  // there — or on app/device-pending.tsx's mount — is provably too late.
  setDeviceRequestFlowActive(patch.role === "STAFF");
  return { ...patch, resolvedPermissions: ROLE_DEFAULTS[baseRole] };
}

// Clears every per-merchant cached store so a freshly signed-in / registered
// account never inherits the PREVIOUS account's branches, profile, staff or
// orders.
async function resetSessionScopedStores(): Promise<void> {
  try {
    const [
      { useMerchantStore }, { useStaffStore }, { useQueueStore },
      { useAnalyticsStore }, { useInventoryStore }, { useServicesStore },
      { useOfflineQueueStore }, { useKycStatusStore }, { useWalletStore },
      { useWasherStore }, { useNotificationFeedStore },
    ] =
      await Promise.all([
        import("./merchantStore"),
        import("./staffStore"),
        import("./queueStore"),
        import("./analyticsStore"),
        import("./inventoryStore"),
        import("./servicesStore"),
        import("./offlineQueueStore"),
        import("./kycStatusStore"),
        import("./walletStore"),
        import("./washerStore"),
        import("./notificationFeedStore"),
      ]);
    useMerchantStore.getState().reset();
    useStaffStore.getState().reset();
    useQueueStore.getState().setOrders([]);
    useAnalyticsStore.getState().reset();
    useInventoryStore.getState().reset();
    useServicesStore.getState().reset();
    useOfflineQueueStore.getState().clear();
    // Verification progress is per-account; the cache is keyed by uid as well,
    // but dropping it here keeps stale entries from lingering on the device.
    useKycStatusStore.getState().reset();
    // The fee wallet is per branch AND per account — carrying it across a sign
    // out let the next account inherit the previous one's balance.
    useWalletStore.getState().reset();
    // Same hazard, and it was live: washerStore persists the profile (and with
    // it branchId) under "lalaba-washer", but was missing from this list — so
    // signing in as a second washer kept the FIRST washer's branchId, and every
    // washer-scoped query went out with a branch this account does not own. The
    // server refuses them (ownership check, 404), so nothing leaked; the screens
    // just broke. Reset it with the rest.
    useWasherStore.getState().reset();
    // The inbox is per account, and its rows can name orders and branches the
    // next account has no business seeing. Same hazard as the wallet above.
    useNotificationFeedStore.getState().reset();
  } catch {
    /* best-effort */
  }
}

const SIGNED_OUT: Partial<AuthState> = {
  user: null,
  merchantId: null,
  orgId: null,
  branchId: null,
  role: null,
  branchIds: [],
  activeBranchId: null,
  activeBranchName: null,
  activeBranchRole: null,
  branchMemberships: [],
  deviceBranchId: null,
  resolvedPermissions: null,
};

// ─── Store ────────────────────────────────────────────────────────────────────
// ─── Biometric credential storage (SecureStore, not AsyncStorage) ────────────
// The biometric credential id + enrolled email are secrets: they used to be
// persisted inside the plain-AsyncStorage zustand blob (partialize). They now
// live in expo-secure-store via secureKV; hydrateBiometricCredentials() loads
// them on startup and one-time-migrates any legacy AsyncStorage values.

const AUTH_PERSIST_KEY = "lalaba-merchant-auth";
const BIO_ID_KEY = "lalaba.biometric.credentialId";
const BIO_EMAIL_KEY = "lalaba.biometric.enrolledEmail";

async function persistBiometricCredentials(id: string, email: string | null): Promise<void> {
  await secureSet(BIO_ID_KEY, id).catch(() => {});
  if (email) await secureSet(BIO_EMAIL_KEY, email).catch(() => {});
  else await secureDelete(BIO_EMAIL_KEY).catch(() => {});
}

async function clearBiometricCredentials(): Promise<void> {
  await secureDelete(BIO_ID_KEY).catch(() => {});
  await secureDelete(BIO_EMAIL_KEY).catch(() => {});
}

/** Migrate legacy plain-AsyncStorage biometric fields → SecureStore, then
 *  scrub them from the persisted blob so they stop existing in plaintext. */
async function migrateLegacyBiometricFields(): Promise<{ id: string; email: string | null } | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_PERSIST_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw);
    const legacyId: unknown = blob?.state?.biometricCredentialId;
    const legacyEmail: unknown = blob?.state?.biometricEnrolledEmail;
    if (typeof legacyId !== "string" || !legacyId) return null;
    const email = typeof legacyEmail === "string" ? legacyEmail : null;
    await persistBiometricCredentials(legacyId, email);
    // Scrub the plaintext copy regardless of whether persist rewrites soon.
    delete blob.state.biometricCredentialId;
    delete blob.state.biometricEnrolledEmail;
    await AsyncStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify(blob));
    return { id: legacyId, email };
  } catch {
    return null;
  }
}

/** Load biometric credentials into the store on startup (SecureStore first,
 *  legacy AsyncStorage migration second). Exported for tests. */
export async function hydrateBiometricCredentials(): Promise<void> {
  try {
    let id = await secureGet(BIO_ID_KEY);
    let email = id ? await secureGet(BIO_EMAIL_KEY) : null;
    if (!id) {
      const migrated = await migrateLegacyBiometricFields();
      if (migrated) { id = migrated.id; email = migrated.email; }
    }
    if (id) {
      useAuthStore.setState({ biometricCredentialId: id, biometricEnrolledEmail: email ?? null });
    }
  } catch {
    // Leave the store as-is; biometric login is simply not offered.
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, _get) => ({
      user: null,
      isLoading: false,
      error: null,
      hasResolved: false,
      isNewGoogleUser: false,
      businessSetupDeferred: false,
      postRegistrationFlow: false,
      _signingIn: false,
      merchantId: null,
      orgId: null,
      branchId: null,
      role: null,
      branchIds: [],
      activeBranchId: null,
      activeBranchName: null,
      activeBranchRole: null,
      branchMemberships: [],
      deviceBranchId: null,
      resolvedPermissions: null,
      biometricCredentialId: null,
      biometricEnrolledEmail: null,

      signIn: async (email, password) => {
        // Drop any cached permission catalogue from a previous session so the
        // new user resolves grants against a fresh list — never a stale (or
        // empty, pre-seed) one pinned in module state across logins.
        clearPermissionsCache();
        // A deliberate sign-in ends any registration flow still in progress.
        // postRegistrationFlow suppresses routing in _layout.tsx so register.tsx
        // can own navigation; it is memory-only, so abandoning that flow WITHOUT
        // a cold start (press BACK out of the email-verify / branch-setup step,
        // which is one tap away) left it stuck on. The user then signs in
        // successfully — Me and MyBranches both return — and sits on the login
        // screen forever, because nothing is allowed to route them off it.
        set({ isLoading: true, error: null, _signingIn: true, postRegistrationFlow: false });
        try {
          await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
          let sessionErr: unknown;
          const session = await fetchSession((err) => { sessionErr = err; });
          if (!session || !["MERCHANT", "STAFF", "WASHER", "COURIER"].includes(session.user.role)) {
            // Clear _signingIn BEFORE signOut so the onAuthStateChanged(null) callback
            // runs normally and applies SIGNED_OUT with the preserved error message.
            set({
              error: backendAuthErrorMessage(sessionErr) ?? "Access denied — partner account required.",
              isLoading: false,
              _signingIn: false,
            });
            await firebaseSignOut(auth).catch(() => { });
            return;
          }
          await resetSessionScopedStores();
          markInteractiveSignIn();
          set({ ...applySessionPatch(session, null), isLoading: false, hasResolved: true, _signingIn: false });
        } catch (err: unknown) {
          set({ error: friendlyAuthError(errField(err, "code")), isLoading: false, _signingIn: false });
        }
      },

      register: async (email, password, firstName, lastName, phone, roleId) => {
        // Set postRegistrationFlow BEFORE creating the Firebase user so the
        // onAuthStateChanged listener fires with it already true, preventing
        // _layout.tsx from routing before register.tsx shows the setup prompt.
        set({ isLoading: true, error: null, postRegistrationFlow: true });
        try {
          await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
          // Send verification email immediately — non-blocking; failure is silent
          // because the account is already created and registration must proceed.
          if (auth.currentUser) sendEmailVerification(auth.currentUser).catch(() => { });

          try {
            await registerUser({
              role: roleId,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              phoneNumber: phone.trim(),
              consents: registrationConsents(),
            });
          } catch (mutationErr: unknown) {
            // Only roll back on definitive backend rejections — a response we know
            // the server produced. Network errors/timeouts mean the backend may have
            // already committed the MongoDB doc, and deleting the Firebase user here
            // would orphan it. The backend is idempotent: retrying registerUser
            // returns the existing doc.
            //
            // This app's client throws ApiError (src/config/graphql.ts), which uses
            // status 0 for "never got an answer" — connection failure, timeout, or a
            // token that could not be fetched. Anything with a real HTTP status came
            // from the server and is a definitive rejection. (This previously tested
            // `mutationErr.graphQLErrors`, an Apollo-only field that ApiError does not
            // carry — so every rejection looked like a network error, the user always
            // saw "Network error", and the rollback below never ran.)
            const isNetworkError = !(mutationErr instanceof ApiError) || mutationErr.status === 0;
            if (!isNetworkError) {
              await auth.currentUser?.delete().catch(() => { });
            }
            throw mutationErr;
          }

          // fetchMe can return null immediately after registerUser due to MongoDB
          // write-propagation latency. Retry once after a short pause so the
          // document has time to be readable before we give up.
          let session = await fetchSession();
          if (!session) {
            await new Promise<void>((res) => setTimeout(res, 1500));
            session = await fetchSession();
          }
          if (session) {
            await resetSessionScopedStores();
            set({ ...applySessionPatch(session, null), isLoading: false, hasResolved: true, postRegistrationFlow: true });
          } else {
            // Both attempts failed — registration is complete on the backend
            // but the session is temporarily unreadable. Clear the flow flag
            // so the auth listener can recover when it next fires.
            set({ isLoading: false, postRegistrationFlow: false });
          }
        } catch (err: unknown) {
          set({ isLoading: false, postRegistrationFlow: false });
          throw err; // register screen surfaces the message
        }
      },

      completeGoogleRegistration: async (phone, roleId) => {
        set({ isLoading: true, error: null, postRegistrationFlow: true });
        try {
          const firebaseUser = auth.currentUser;
          if (!firebaseUser) throw new Error("No Firebase user signed in");

          const displayName = firebaseUser.displayName ?? firebaseUser.email ?? "User";
          const { firstName, lastName } = splitName(displayName);
          await registerUser({ role: roleId, firstName, lastName, phoneNumber: phone, consents: registrationConsents() });

          const session = await fetchSession();
          if (session) {
            await resetSessionScopedStores();
            set({ ...applySessionPatch(session, null), isLoading: false, hasResolved: true, postRegistrationFlow: true });
          } else {
            set({ isLoading: false, postRegistrationFlow: false });
          }
        } catch (err: unknown) {
          set({ isLoading: false, postRegistrationFlow: false });
          throw err;
        }
      },

      resetPassword: async (email) => {
        await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      },

      signInWithGoogle: async () => {
        clearPermissionsCache();
        set({ isLoading: true, error: null });
        try {
          // Lazy import — avoids crashing at bundle load time if the native
          // module isn't linked yet (e.g. Expo Go or a stale binary).
          const { GoogleSignin, isSuccessResponse } =
            await import("@react-native-google-signin/google-signin");

          const extra = Constants.expoConfig?.extra as
            | { googleWebClientId?: string }
            | undefined;
          const webClientId = extra?.googleWebClientId ?? "";
          devLog(`🔵 [Google] Configuring — webClientId: ${webClientId ? webClientId.slice(0, 20) + "…" : "(MISSING)"}`);
          GoogleSignin.configure({ webClientId });

          devLog("🔵 [Google] Checking Play Services…");
          await GoogleSignin.hasPlayServices();
          devLog("🔵 [Google] Opening sign-in picker…");
          const response = await GoogleSignin.signIn();

          if (!isSuccessResponse(response)) {
            devLog("🔵 [Google] User cancelled or no success response");
            set({ isLoading: false });
            return;
          }

          const idToken = response.data.idToken;
          devLog(`🔵 [Google] Got idToken: ${idToken ? "yes" : "NO — null"}`);
          if (!idToken) throw new Error("Google sign-in returned no idToken");

          devLog("🔵 [Google] Signing in to Firebase with credential…");
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
          devLog("🔵 [Google] Firebase sign-in OK");

          // fetchSession swallows UNAUTHENTICATED when the Firebase user exists
          // but has no backend document yet (new Google user) — treat that as
          // the new-user path. Anything else (device rejection, deactivated
          // account, incomplete staff setup) is a real, definitive error and
          // must be surfaced instead of silently falling through to the
          // new-user flow — a deactivated account must never be able to
          // "re-register" its way back in.
          let sessionErr: unknown;
          const session = await fetchSession((err) => { sessionErr = err; });

          if (!session) {
            if (isNewAccountError(sessionErr)) {
              set({ isLoading: false, isNewGoogleUser: true });
              return;
            }
            await firebaseSignOut(auth).catch(() => { });
            set({
              error: backendAuthErrorMessage(sessionErr) ?? "Access denied — partner account required.",
              isLoading: false,
            });
            return;
          }

          if (!["MERCHANT", "STAFF", "WASHER", "COURIER"].includes(session.user.role)) {
            await firebaseSignOut(auth).catch(() => { });
            set({ error: "Access denied — partner account required.", isLoading: false });
            return;
          }

          await resetSessionScopedStores();
          markInteractiveSignIn();
          set({ ...applySessionPatch(session, null), isLoading: false, hasResolved: true });
        } catch (err: unknown) {
          const { statusCodes } = await import("@react-native-google-signin/google-signin").catch(() => ({ statusCodes: {} as Record<string, string> }));
          const code = errField(err, "code") ?? "";
          devWarn(`🔴 [Google] Sign-in error — code: ${code} | message: ${errField(err, "message") ?? err}`);
          if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
            set({ isLoading: false });
            return;
          }
          let msg = "Google sign-in failed. Please try again.";
          if (code === "auth/account-exists-with-different-credential") {
            msg = "An account with this email already exists. Sign in with email instead.";
          } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            msg = "Google Play Services are not available on this device.";
          }
          set({ error: msg, isLoading: false });
        }
      },

      // ── Biometric: enrol the current signed-in account on this device ────────
      enableBiometric: async () => {
        if (!auth.currentUser) {
          return { ok: false, error: "Sign in first to enable biometric login." };
        }
        const currentEmail = _get().user?.email ?? auth.currentUser.email ?? null;
        try {
          const avail = await isBiometricAvailable();
          if (!avail.available) {
            return { ok: false, error: `No ${avail.label} is set up on this device.` };
          }
          // Generate the hardware keypair (private key stays biometric-gated in
          // the Secure Enclave / Keystore; only the public key leaves the device).
          const publicKey = await createKeypair();
          const deviceId = await getDeviceId();
          const platform = Platform.OS === "ios" ? "ios" : "android";
          const c = (Platform.constants ?? {}) as Record<string, unknown>;
          const model = String(c.Model ?? c.Brand ?? "").trim();
          const deviceName =
            `${platform === "ios" ? "iPhone/iPad" : "Android"}${model ? ` (${model})` : ""}`;

          const cred = await gqlEnrollBiometric({ deviceId, deviceName, platform, publicKey });
          set({ biometricCredentialId: cred._id, biometricEnrolledEmail: currentEmail });
          await persistBiometricCredentials(cred._id, currentEmail);
          return { ok: true };
        } catch (err: unknown) {
          // Enrolment didn't complete — drop the local key so we never leave a
          // key on-device that the backend doesn't know about.
          await deleteKeypair().catch(() => {});
          return { ok: false, error: errField(err, "message") ?? "Could not enable biometric login." };
        }
      },

      // ── Biometric: sign in with Face ID / fingerprint ────────────────────────
      // Mirrors signIn(), but the Firebase session comes from a custom token the
      // backend mints only after verifying the challenge signature.
      signInWithBiometric: async () => {
        const credentialId = _get().biometricCredentialId;
        if (!credentialId) {
          set({ error: "Biometric login isn't set up on this device." });
          return;
        }
        clearPermissionsCache();
        set({ isLoading: true, error: null, _signingIn: true });
        try {
          const { challengeId, challenge } = await requestBiometricChallenge(credentialId);
          const signed = await signChallenge(challenge, "Sign in to Lalaba Merchant");
          if (!signed) {
            // User cancelled the biometric prompt — return quietly to the form.
            set({ isLoading: false, _signingIn: false });
            return;
          }
          const customToken = await gqlBiometricLogin({
            credentialId,
            challengeId,
            signature: signed.signature,
          });
          await signInWithCustomToken(auth, customToken);

          let sessionErr: unknown;
          const session = await fetchSession((err) => { sessionErr = err; });
          if (!session || !["MERCHANT", "STAFF", "WASHER", "COURIER"].includes(session.user.role)) {
            set({
              error: backendAuthErrorMessage(sessionErr) ?? "Access denied — partner account required.",
              isLoading: false,
              _signingIn: false,
            });
            await firebaseSignOut(auth).catch(() => { });
            return;
          }
          await resetSessionScopedStores();
          set({ ...applySessionPatch(session, null), isLoading: false, hasResolved: true, _signingIn: false });
        } catch (err: unknown) {
          // Only tear down local enrolment when the credential is genuinely gone
          // (revoked by an owner / disabled) or the signature no longer matches
          // the registered key — NOT for a merely expired challenge, which is
          // retryable and must keep the button available.
          const msg = String(errField(err, "message") ?? "");
          if (/not available|verification failed/i.test(msg)) {
            await deleteKeypair().catch(() => {});
            set({ biometricCredentialId: null, biometricEnrolledEmail: null });
            await clearBiometricCredentials();
          }
          set({
            error: errField(err, "message") ?? "Biometric sign-in failed. Use your password.",
            isLoading: false,
            _signingIn: false,
          });
        }
      },

      // ── Biometric: remove from this device ───────────────────────────────────
      disableBiometric: async () => {
        const credentialId = _get().biometricCredentialId;
        await deleteKeypair().catch(() => {});
        // Best-effort server revoke — only possible while a session exists.
        if (credentialId && auth.currentUser) {
          await gqlRevokeBiometric(credentialId).catch(() => {});
        }
        set({ biometricCredentialId: null, biometricEnrolledEmail: null });
        await clearBiometricCredentials();
      },

      signOut: async (reasonError?: string) => {
        // Clear local session FIRST so the UI/router reacts immediately; Firebase
        // signOut + store resets are best-effort and must never block sign-out.
        // postRegistrationFlow must be cleared here so the onAuthStateChanged null
        // handler (which guards against it) does not swallow the sign-out event.
        // reasonError (e.g. an unapproved-device block) is preserved by the
        // onAuthStateChanged(null) handler and surfaced on the login screen.
        set({
          ...SIGNED_OUT,
          error: reasonError ?? null,
          isLoading: false,
          hasResolved: true,
          businessSetupDeferred: false,
          postRegistrationFlow: false,
        });
        // Drop this device's FCM token before Firebase revokes the session (the
        // removeFcmToken mutation needs a valid token). Best-effort.
        void unregisterPushToken();
        void firebaseSignOut(auth).catch(() => { });
        void resetSessionScopedStores();
        // The permission catalogue is module-level cache — drop it so the next
        // account (or a re-login after a grant change) refetches a fresh list.
        clearPermissionsCache();
        // No session, no authenticated requests, so no more "device not
        // registered" rejections until the next sign-in — that call resets
        // this via applySessionPatch. Clearing it here is just hygiene.
        setDeviceRequestFlowActive(false);
      },

      setUser: (user) =>
        set({
          user,
          merchantId: user?.merchantId ?? null,
          orgId: user?.merchantId ?? null,
          branchId: user?.merchantId ?? null,
          role: user?.role ?? null,
          branchIds: [],
          activeBranchId: null,
          activeBranchName: null,
          activeBranchRole: null,
          branchMemberships: [],
          deviceBranchId: null,
        }),

      setActiveBranch: (branchId) => {
        const memberships = _get().branchMemberships;
        const activeBranchRole = deriveBranchRole(memberships, branchId);
        const activeBranchName = deriveBranchName(memberships, branchId);
        set(() => ({
          activeBranchId: branchId,
          activeBranchName,
          activeBranchRole,
          branchId: branchId,
        }));
      },

      setDeviceBranch: (branchId) => set({ deviceBranchId: branchId }),

      // Set straight after a successful selfie submission so the courier's
      // avatar is correct on arrival, without waiting for the next fetchMe.
      // selfieStatus moves with it — otherwise the routing effect would bounce
      // the courier straight back to the gate they just cleared.
      setPhotoUrl: (photoUrl) => {
        const user = _get().user;
        if (!user) return;
        set({
          user: {
            ...user,
            photoUrl,
            selfieStatus: photoUrl ? "ACTIVE" : user.selfieStatus,
          },
        });
      },

      // Written from the courier profile screen after re-reading the selfie off
      // the server. The routing effect in app/_layout.tsx has already burned
      // `routedFor` for this uid, so a revocation landing here does NOT bounce
      // the rider anywhere — it just makes the profile tell the truth (initials
      // instead of a dead photo URL) and surfaces the retake row.
      setSelfieState: (photoUrl, selfieStatus) => {
        const user = _get().user;
        if (!user) return;
        if (user.photoUrl === photoUrl && user.selfieStatus === selfieStatus) return;
        set({ user: { ...user, photoUrl, selfieStatus } });
      },

      syncBranchNames: (branches) => {
        const updated = _get().branchMemberships.map((m) => {
          const fresh = branches.find((b) => b.id === m.branchId);
          return fresh ? { ...m, branchName: fresh.name } : m;
        });
        const activeBranchName = deriveBranchName(updated, _get().activeBranchId);
        set({ branchMemberships: updated, activeBranchName });
      },

      refreshMemberships: async (_uid) => {
        try {
          const session = await fetchSession();
          if (!session) return;
          const next = applySessionPatch(session, _get().activeBranchId);
          set((s) => ({
            branchMemberships: next.branchMemberships,
            branchIds: next.branchIds,
            activeBranchId: next.activeBranchId,
            activeBranchName: next.activeBranchName,
            activeBranchRole: next.activeBranchRole,
            branchId: next.activeBranchId ?? s.merchantId ?? null,
            resolvedPermissions: next.resolvedPermissions,
          }));
        } catch (err) {
          devWarn("[authStore] refreshMemberships failed:", err);
        }
      },

      // Force-refresh the Firebase ID token (e.g. after role/claims change).
      refreshToken: async () => {
        try {
          await auth.currentUser?.getIdToken(true);
        } catch (err) {
          devWarn("[authStore] refreshToken failed:", err);
        }
      },

      setBusinessSetupDeferred: (val) => set({ businessSetupDeferred: val }),
      setPostRegistrationFlow: (val: boolean) => set({ postRegistrationFlow: val }),

      clearError: () => set({ error: null }),

      // Sessions are memory-only: a force-close / cold start requires a fresh
      // login, while backgrounding keeps the user signed in. onAuthStateChanged
      // fires once on launch — if a session is present on that FIRST event it was
      // restored from a previous run, so we sign it out (see the isFirstFire guard
      // below). Pairs with firebase.ts inMemoryPersistence + the partialize/rehydrate
      // clears. Later fires (token refresh while the app is alive) keep the session.
      initAuthListener: () => {
        devLog("🔥 [Firebase] Auth listener registered");
        let fetchInProgress = false;
        // Prevents a second onAuthStateChanged fire (iOS cold-start double-fire)
        // from starting a duplicate background recovery loop.
        let recoveryActive = false;
        // The very first auth event after this listener registers (i.e. per cold
        // start). A user present on it is a persisted/restored session.
        let hasFired = false;
        const unsub = onAuthStateChanged(auth, (fbUser) => {
          void (async () => {
            const isFirstFire = !hasFired;
            hasFired = true;
            if (!fbUser) {
              devLog("🔥 [Firebase] Auth → signed out");
              // During post-registration (verify-email step), reload() can transiently
              // fire a null auth event. Ignore it — the user hasn't intentionally
              // signed out. signOut() explicitly clears postRegistrationFlow first.
              if (_get().postRegistrationFlow) return;
              // Firebase can emit a transient null event mid-sign-in (e.g. when
              // re-authenticating on iOS). If signIn() is in progress AND hasn't
              // set an error yet, ignore it — signIn() will complete the flow.
              // If an error HAS been set, signIn() is calling auth().signOut()
              // because the role check failed; we fall through to preserve that error.
              if (_get()._signingIn && !_get().error) return;
              // Preserve error if signIn() or signInWithGoogle() set one before
              // triggering signOut — by this point _signingIn has already been
              // cleared (see above), so gating on it here would always discard
              // the error. Just carry forward whatever is currently set.
              const preservedError = _get().error;
              set({ ...SIGNED_OUT, hasResolved: true, error: preservedError, _signingIn: false });
              return;
            }
            devLog(`🔥 [Firebase] Auth → signed in (uid: ${fbUser.uid})`);
            // signIn() and register() manage their own fetchSession calls — skip here.
            if (_get()._signingIn || _get().postRegistrationFlow) {
              devLog("🔥 [Firebase] Sign-in/registration in progress — deferring session fetch");
              set({ hasResolved: true });
              return;
            }
            // A session present on the FIRST auth event = a persisted login from a
            // previous app run (cold start / force-close). Discard it so the user
            // must log in again. The resulting null event applies SIGNED_OUT → /login.
            if (isFirstFire) {
              devLog("🔥 [Firebase] Discarding restored session on cold start — re-login required");
              await firebaseSignOut(auth).catch(() => {});
              return;
            }
            // Skip if a fetch or recovery loop is already running — handles the iOS
            // double-fire where both fires would otherwise start independent loops.
            if (fetchInProgress || recoveryActive) return;
            fetchInProgress = true;
            try {
              // Retry once after a short delay — handles transient backend blips
              // (e.g. Render free-tier cold start that hasn't finished yet).
              let session = await fetchSession();
              if (!session) {
                await new Promise<void>((res) => setTimeout(res, 3000));
                session = await fetchSession();
              }
              if (session) {
                devLog(`🔥 [Firebase] Session resolved — role: ${session.user.role}`);
                set({ ...applySessionPatch(session, _get().activeBranchId), hasResolved: true });
              } else {
                // Backend/GraphQL call failed (cold start, timeout, network blip) — this
                // does NOT mean the user is signed out, Firebase already confirmed the
                // session above. If AsyncStorage rehydration already restored a cached
                // user for this same uid, keep it (and let the recovery loop below
                // refresh branches/role in the background) instead of bouncing to
                // /login on a transient backend hiccup.
                const cachedUser = _get().user;
                const usingCachedUser = !!cachedUser && cachedUser.uid === fbUser.uid;
                if (usingCachedUser) {
                  devWarn("🔥 [Firebase] Backend session fetch failed — keeping cached user, refreshing in background");
                  set({ hasResolved: true });
                } else {
                  devWarn("🔥 [Firebase] Auth OK but backend session failed — showing login");
                  set({ ...SIGNED_OUT, hasResolved: true });
                }
                // Backend was unreachable — retry silently every 10s (up to 6×) so
                // the user is auto-signed in (or refreshed) once the server comes
                // back, no tap needed. `refreshed` only flips once fetchSession()
                // actually succeeds — a merely-cached user (still stale) must keep
                // retrying, unlike the old check which stopped as soon as any user
                // was present, even the stale cached one.
                let refreshed = false;
                recoveryActive = true;
                let attempts = 0;
                const recover = setInterval(async () => {
                  if (!auth.currentUser || refreshed || attempts >= 6) {
                    clearInterval(recover);
                    recoveryActive = false;
                    return;
                  }
                  // If Firebase can't refresh the token (no route to Google's servers),
                  // every BE request will fail too — stop retrying until connectivity returns.
                  try {
                    await auth.currentUser.getIdToken(false);
                  } catch (e: unknown) {
                    if (errField(e, "code") === "auth/network-request-failed") {
                      clearInterval(recover);
                      recoveryActive = false;
                      return;
                    }
                  }
                  attempts++;
                  const recovered = await fetchSession();
                  if (recovered) {
                    refreshed = true;
                    clearInterval(recover);
                    recoveryActive = false;
                    set({ ...applySessionPatch(recovered, _get().activeBranchId), hasResolved: true });
                  }
                }, 10_000);
              }
            } finally {
              fetchInProgress = false;
            }
          })();
        });
        return unsub;
      },
    }),
    {
      name: "lalaba-merchant-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Session (user + branch) is intentionally NOT persisted: a force-close /
        // cold start clears it so the app requires a fresh login. Backgrounding
        // keeps the user signed in because the JS runtime (and this store) stay
        // in memory. Pairs with Firebase's inMemoryPersistence (see firebase.ts).
        businessSetupDeferred: state.businessSetupDeferred,
        // Biometric credential fields are intentionally NOT persisted here:
        // they are secrets and live in expo-secure-store (see secureKV +
        // hydrateBiometricCredentials below), not plain AsyncStorage.
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Sessions are memory-only (see partialize + Firebase inMemoryPersistence).
        // Never restore a persisted user, and defensively clear any stale session
        // blob written before session-persistence was removed — so a force-close /
        // cold start always starts logged out (→ /login), while backgrounding
        // (no rehydration) keeps the in-memory session. Biometric fields are
        // hydrated separately from SecureStore (hydrateBiometricCredentials)
        // so Face ID re-login is still offered.
        state.user = null;
        state.merchantId = null;
        state.orgId = null;
        state.role = null;
        state.branchId = null;
        state.branchIds = [];
        state.activeBranchId = null;
        state.activeBranchName = null;
        state.activeBranchRole = null;
        state.branchMemberships = [];
        state.deviceBranchId = null;
        state.resolvedPermissions = null;
      },
    }
  )
);

// Kick off the SecureStore hydration/migration once at module load — after the
// store exists. Fire-and-forget: failures leave biometric login un-offered.
void hydrateBiometricCredentials();
