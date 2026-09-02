// src/config/graphql.ts
// ─────────────────────────────────────────────────────────────────────────────
// GraphQL CLIENT  (real backend — NestJS/Apollo)
//
// A thin fetch-based GraphQL client for the four domains now wired to the live
// backend: auth (users), branches, staff, devices. Everything else still goes
// through apiFetch()/mockBackend (offline mock) until the backend gains those
// domains.
//
// Auth model (see BE src/auth/guards/gql-auth.guard.ts):
//   • Every authenticated request needs `Authorization: Bearer <firebaseIdToken>`.
//   • STAFF accounts ALSO need `x-device-token: <deviceToken>` for a device the
//     merchant has registered/approved. Merchant (owner) requests don't.
//
// The Firebase ID token is read live from the Firebase client SDK so it's always
// fresh (the SDK refreshes it transparently).
// ─────────────────────────────────────────────────────────────────────────────

import Constants from "expo-constants";
import { errField } from "../utils/userError";
import { auth } from "./firebase";
import { getDeviceId } from "../utils/deviceId";
import { Platform } from "react-native";
import { devLog } from "../utils/devLog";
import { getAppCheckToken } from "./appCheck";

// ─── Typed API error ──────────────────────────────────────────────────────────

// Structured, per-reason breakdown some mutations attach to a 400 response
// (e.g. requestAccountDeletion's wind-down checklist) — mirrors BE's
// `DeletionBlocker` shape (see LALABA_BE_DEV src/account-deletion/account-deletion.service.ts).
export interface ApiErrorBlocker {
  code: string;
  message: string;
  count: number;
  ids: string[];
}

export class ApiError extends Error {
  constructor(
    public readonly status:  number,
    public readonly code:    string,
    message: string,
    public readonly blockers?: ApiErrorBlocker[]
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Endpoint resolution ────────────────────────────────────────────────────
// Supports both Android emulator and physical device without manual .env switching:
//
//   EXPO_PUBLIC_API_BASE_URL        — emulator (e.g. http://10.0.2.2:3001/)
//   EXPO_PUBLIC_DEVICE_API_BASE_URL — physical device LAN IP (e.g. http://192.168.x.x:3001/)
//
// Emulator is detected via Android's build fingerprint (always contains "generic"
// on AOSP emulators; production devices never do).
//
// EXPO_PUBLIC_ONLINE (on/off) is the master switch:
//   on  — talk to the hosted Render backend (EXPO_PUBLIC_ONLINE_GRAPHQL_URL)
//   off — talk to the local NestJS backend (LALABA_BE_DEV), which itself talks
//         to the local Dockerized MongoDB
let graphqlEndpoint: string | null = null;

function isAndroidEmulator(): boolean {
  if (Platform.OS !== "android") return false;
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  const fp = String(c.Fingerprint ?? "");
  const model = String(c.Model ?? "");
  return fp.includes("generic") || fp.includes("emulator") || model.toLowerCase().includes("sdk");
}

function isOnlineMode(): boolean {
  return (process.env.EXPO_PUBLIC_ONLINE ?? "off").trim().toLowerCase() === "on";
}

function resolveEndpoint(): string {
  if (graphqlEndpoint) return graphqlEndpoint;

  if (isOnlineMode()) {
    const onlineUrl = process.env.EXPO_PUBLIC_ONLINE_GRAPHQL_URL;
    if (!onlineUrl) {
      throw new Error(
        "EXPO_PUBLIC_ONLINE=on but EXPO_PUBLIC_ONLINE_GRAPHQL_URL is not set in .env."
      );
    }
    graphqlEndpoint = onlineUrl.replace(/\/+$/, "");
    if (isDev) console.log(`✅ [FE] GraphQL endpoint (ONLINE): ${graphqlEndpoint}`);
    return graphqlEndpoint!;
  }

  const emulatorBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  const deviceBase   = process.env.EXPO_PUBLIC_DEVICE_API_BASE_URL;
  const configBase   = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;

  const onEmulator = isAndroidEmulator();
  const base = (onEmulator ? emulatorBase : (deviceBase || emulatorBase)) || configBase;

  if (!base) {
    throw new Error(
      "apiBaseUrl missing — set EXPO_PUBLIC_API_BASE_URL (emulator) and/or EXPO_PUBLIC_DEVICE_API_BASE_URL (physical device) in .env."
    );
  }
  let trimmedBase = base;
  while (trimmedBase.endsWith("/")) trimmedBase = trimmedBase.slice(0, -1);
  graphqlEndpoint = `${trimmedBase}/graphql`;
  if (isDev) console.log(`✅ [FE] GraphQL endpoint (LOCAL, ${onEmulator ? "emulator" : "device"}): ${graphqlEndpoint}`);
  return graphqlEndpoint;
}

// ─── Device token (staff only) ────────────────────────────────────────────────
// The device token is the stable device UUID (same value sent as fcmToken during
// device registration). The backend checks x-device-token === device.fcmToken.
export async function getDeviceToken(): Promise<string | null> {
  try {
    return await getDeviceId();
  } catch {
    return null;
  }
}

// ─── Device/branch revocation trap ────────────────────────────────────────────
// When the owner blocks/removes a staff device mid-session, every guarded
// request starts failing with these BE guard messages. A handler registered by
// app/_layout.tsx routes the staff session to /device-pending the moment one
// appears — this module stays store/router-agnostic (a direct import of
// authStore or expo-router here would create a require cycle).
//
// Same idea for BRANCH access: if the owner removes a staff member's branch
// assignment mid-session, the BE's branch-scoping guard (assertBranchScope)
// starts rejecting every request for that branch with a FORBIDDEN error
// instead of UNAUTHENTICATED — different error shape, same "this session is no
// longer valid, force a fresh sign-in" outcome.
const DEVICE_REVOKED_RE = /registered device|not registered or has been deactivated/i;
const BRANCH_ACCESS_LOST_RE = /not assigned to this branch|registered to a different branch/i;

export type SessionRevokedReason = "device" | "branch-access";

// While app/device-pending.tsx is mounted, the staff member is deliberately
// working through the request/approval flow — OTHER always-mounted
// providers (analytics, products, services, ...) keep firing their own
// ambient fetches regardless of route, and those legitimately fail with this
// same "device not approved" message while a request is pending. Without this
// guard the revocation trap would sign the user back out to /login before
// their request even lands, and the owner would never see it.
//
// This is set directly by the screen's own mount/unmount lifecycle rather
// than inferred from the router's pathname — usePathname() only updates on
// the NEXT render after router.replace(), so an ambient fetch that fails in
// that window would slip past a pathname-based check.
let deviceRequestFlowActive = false;
export function setDeviceRequestFlowActive(active: boolean): void {
  deviceRequestFlowActive = active;
}
export function isDeviceRequestFlowActive(): boolean {
  return deviceRequestFlowActive;
}

function maybeSignalDeviceRevoked(err: ApiError): void {
  if (deviceRequestFlowActive) return;
  if (err.code === "UNAUTHENTICATED" && DEVICE_REVOKED_RE.test(err.message ?? "")) {
    onDeviceRevoked?.("device");
    return;
  }
  if (err.code === "FORBIDDEN" && BRANCH_ACCESS_LOST_RE.test(err.message ?? "")) {
    onDeviceRevoked?.("branch-access");
  }
}

// ─── Dev logger ─────────────────────────────────────────────────────────────
const isDev = typeof __DEV__ !== "undefined" && __DEV__;
let gqlConnected = false;

function logRequest(opName: string, startMs: number, ok: boolean, err?: ApiError): void {
  if (!isDev) return;
  const durationMs = Date.now() - startMs;
  devLog(`${ok ? "🟢" : "🔴"} [GQL] ${opName} → ${ok ? "ok" : "error"} (${durationMs}ms)`);
  if (!ok && err) console.warn(`   ↳ [GQL] ${opName} error — code: ${err.code} | msg: ${err.message}`);

  if (ok && !gqlConnected) {
    gqlConnected = true;
    devLog(`✅ [GQL] Connected → ${resolveEndpoint()}`);
  }
}

// ─── Startup health check ─────────────────────────────────────────────────────
// Pings the backend and returns true when reachable.
// Works in both dev and production — used to detect Render cold-start delays.
export async function pingBackend(): Promise<boolean> {
  if (isDev) console.log(`🔌 [Lalaba] Connecting to GraphQL → ${resolveEndpoint()}`);
  const t = Date.now();
  try {
    await graphqlRequest<{ __typename: string }>(
      `query Ping { __typename }`,
      {},
      { anonymous: true }
    );
    if (isDev) console.log(`✅ [Lalaba] Backend + GraphQL OK (${Date.now() - t}ms)`);
    return true;
  } catch (e: unknown) {
    if (isDev) console.warn(`❌ [Lalaba] Backend unreachable — ${errField(e, "message") ?? e}`);
    return false;
  }
}

// Retries pingBackend() until it succeeds or maxWaitMs elapses. A single
// pingBackend() call aborts after 15s (graphqlRequest's fixed request
// timeout), which is shorter than a Render free/starter cold start (~30-60s)
// — a lone ping reports "unreachable" mid-boot even though the server comes
// up seconds later. Each retry re-tries the connection rather than waiting
// idle, so this naturally polls roughly every 15s until the deadline.
export async function pingBackendUntilReady(maxWaitMs = 75_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    if (await pingBackend()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

// Pull a readable operation name out of a query string for logging.
function opNameOf(query: string): string {
  const m = /\b(query|mutation)\s+(\w+)/.exec(query);
  return m?.[2] ?? "anonymous";
}

// ─── Request options ──────────────────────────────────────────────────────────
interface GraphQLRequestOptions {
  /** Skip attaching the Authorization header (e.g. the public `roles` query before sign-in). */
  anonymous?: boolean;
  // `withDeviceToken` used to live here. It was opt-in per call site, which
  // meant every staff-reachable query had to remember it and any that forgot
  // failed with "Please log in from a registered device." — a message that
  // blames the device for what is a missing header. incomingOnlineOrders and
  // myStaff both forgot, so staff saw no online orders at all. The token is now
  // attached unconditionally; see below.
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: {
      code?: string;
      originalError?: {
        message?: string | string[];
        statusCode?: number;
        blockers?: ApiErrorBlocker[];
      };
      // Present only on MAINTENANCE_MODE — see GqlAuthGuard on the backend.
      type?: "SCHEDULED" | "EMERGENCY";
      endsAt?: string | null;
      supportEmail?: string | null;
      supportPhone?: string | null;
    };
  }>;
}

// ─── Core request ──────────────────────────────────────────────────────────────
// ─── Device-revoked auto-logout ──────────────────────────────────────────────
// When the backend rejects a request because this staff device was blocked or
// removed by the owner (reqs #9/#10), we sign the staff out. A handler is
// registered by the root layout to avoid an import cycle with authStore.
let onDeviceRevoked: ((msg: string) => void) | null = null;
export function setDeviceRevokedHandler(fn: (msg: string) => void): void {
  onDeviceRevoked = fn;
}
function maybeDeviceRevoked(msg: string): void {
  if (/not registered or has been deactivated|device is not registered|not registered from a registered device/i.test(msg)) {
    onDeviceRevoked?.(msg);
  }
}

// ─── Maintenance-mode hook ──────────────────────────────────────────────────
// Same registered-callback shape as the device-revoked handler above, and for
// the same reason: this module can't import the store directly without a
// cycle, so app/_layout.tsx registers a callback on mount instead.
type MaintenanceModeHandler = (info: {
  mode: "SCHEDULED" | "EMERGENCY";
  message: string | null;
  endsAt: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}) => void;
let onMaintenanceMode: MaintenanceModeHandler | null = null;
export function setMaintenanceModeHandler(fn: MaintenanceModeHandler | null): void {
  onMaintenanceMode = fn;
}

export async function graphqlRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  options: GraphQLRequestOptions = {}
): Promise<T> {
  const startMs = Date.now();
  const opName = opNameOf(query);

  if (isDev && !gqlConnected) {
    devLog(`📡 [FE] Attempting GraphQL request to ${graphqlEndpoint ?? resolveEndpoint()}`);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!options.anonymous) {
    let token: string | undefined;
    try {
      token = await auth.currentUser?.getIdToken();
    } catch (e: unknown) {
      if (errField(e, "code") === "auth/network-request-failed") {
        throw new ApiError(0, "network-error", "Network unavailable — could not authenticate.");
      }
      throw new ApiError(401, "auth/unauthenticated", "Could not verify session.");
    }
    if (!token) {
      throw new ApiError(401, "auth/unauthenticated", "Not signed in.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  // Always sent when we have one, rather than opt-in per query.
  //
  // The backend reads this header in exactly two places: the staff branch of
  // GqlAuthGuard, and the device register/status resolvers. Every other role
  // ignores it entirely, so sending it costs nothing and forgetting it breaks
  // a staff member in a way that reads like a device problem. The id is cached
  // in memory after the first AsyncStorage read.
  {
    const deviceToken = await getDeviceToken();
    if (deviceToken) headers["x-device-token"] = deviceToken;
  }

  // APPCHK-010 — attest this app to the custom backend.
  //
  // Sent on EVERY request, including anonymous ones: the operations that most
  // need attestation (requestBiometricChallenge, biometricLogin) have no
  // session by definition, so gating this on `!options.anonymous` would skip
  // exactly the abuse surface it exists to cover.
  //
  // Asked of the SDK per request rather than cached — App Check tokens expire
  // and the SDK rotates them in the background. A null is not fatal: the
  // backend is in monitoring mode until APP_CHECK_ENFORCED=on, and once it is
  // enforcing, its APP_CHECK_REQUIRED error is a better message than anything
  // this layer could invent.
  const appCheckToken = await getAppCheckToken();
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(resolveEndpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (e: unknown) {
    logRequest(opName, startMs, false);
    const isTimeout = errField(e, "name") === "AbortError";
    throw new ApiError(0, "network-error", isTimeout ? "Request timed out." : (errField(e, "message") ?? "Network request failed."));
  } finally {
    clearTimeout(timeoutId);
  }

  let json: GraphQLResponse<T>;
  try {
    json = (await res.json()) as GraphQLResponse<T>;
  } catch {
    logRequest(opName, startMs, false);
    throw new ApiError(res.status, "invalid-response", `Malformed response (HTTP ${res.status}).`);
  }

  // Non-GraphQL error response (e.g. NestJS 401/500 before reaching the resolver).
  // These return {statusCode, message} without a `data` field — treat as errors.
  if (!res.ok && !json.data && !json.errors?.length) {
    const msg = (json as any)?.message ?? `HTTP ${res.status}`;
    const code = res.status === 401 ? "UNAUTHENTICATED" : "request-failed";
    const apiErr = new ApiError(res.status, code, msg);
    maybeDeviceRevoked(msg);
    logRequest(opName, startMs, false, apiErr);
    maybeSignalDeviceRevoked(apiErr);
    throw apiErr;
  }

  if (json.errors?.length) {
    if (isDev) {
      console.warn(`[GQL] ${opName} — ${json.errors.length} error(s):`);
      json.errors.forEach((e, i) => console.warn(`  [${i + 1}] ${e.extensions?.code ?? 'graphql-error'}: ${e.message}`));
      console.warn(`  variables:`, JSON.stringify(variables, null, 2));
    }
    const first = json.errors[0];
    const originalMsg = first.extensions?.originalError?.message;
    const friendlyMsg = Array.isArray(originalMsg)
      ? originalMsg.join("; ")
      : (originalMsg ?? first.message);
    const blockers = first.extensions?.originalError?.blockers;
    const apiErr = new ApiError(
      res.status === 200 ? 400 : res.status,
      first.extensions?.code ?? "graphql-error",
      friendlyMsg,
      Array.isArray(blockers) ? blockers : undefined
    );
    if (first.extensions?.code === "MAINTENANCE_MODE" && first.extensions.type) {
      onMaintenanceMode?.({
        mode: first.extensions.type,
        message: friendlyMsg ?? null,
        endsAt: first.extensions.endsAt ?? null,
        supportEmail: first.extensions.supportEmail ?? null,
        supportPhone: first.extensions.supportPhone ?? null,
      });
    }
    maybeDeviceRevoked(friendlyMsg);
    logRequest(opName, startMs, false, apiErr);
    maybeSignalDeviceRevoked(apiErr);
    throw apiErr;
  }

  logRequest(opName, startMs, true);
  return json.data as T;
}
