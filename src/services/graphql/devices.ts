// src/services/graphql/devices.ts
// GraphQL operations for the devices domain (live backend).

import { graphqlRequest } from "../../config/graphql";
import { getDeviceId } from "../../utils/deviceId";

export type DeviceStatus = "PENDING" | "APPROVED" | "BLOCKED";

// ─── BE shapes ────────────────────────────────────────────────────────────────
export interface DeviceLocation {
  latitude: number;
  longitude: number;
  label?: string | null;
}

interface GqlDevice {
  _id: string;
  uid: string;
  staffUid?: string | null;
  staffName?: string | null;
  branchId?: string | null;
  deviceName: string;
  operatingSystem: string;
  deviceModel?: string | null;
  fcmToken: string;
  status: DeviceStatus;
  isActive: boolean;
  isPending: boolean;
  createdAt?: string;
}

const DEVICE_FIELDS = `
  _id uid staffUid staffName branchId deviceName operatingSystem deviceModel fcmToken status isActive createdAt
`;

// ─── FE shapes ────────────────────────────────────────────────────────────────
export interface RegisteredDevice {
  id: string;
  staffUid: string | null;
  staffName: string | null;
  branchId: string | null;
  deviceName: string;
  operatingSystem: string;
  deviceModel: string | null;
  /** The stable UUID used as a device fingerprint (reused as fcmToken). */
  fcmToken: string;
  status: DeviceStatus;
  isActive: boolean;
  /** Staff registration request awaiting owner approval. */
  isPending: boolean;
  createdAt?: string;
}

export interface BranchOption {
  id: string;
  name: string;
}

function toDevice(d: GqlDevice): RegisteredDevice {
  return {
    id: d._id,
    staffUid: d.staffUid ?? null,
    staffName: d.staffName ?? null,
    branchId: d.branchId ?? null,
    deviceName: d.deviceName,
    operatingSystem: d.operatingSystem,
    deviceModel: d.deviceModel ?? null,
    fcmToken: d.fcmToken,
    status: d.status,
    isActive: d.isActive,
    isPending: d.isPending,
    createdAt: d.createdAt,
  };
}

// ─── Owner: all devices ─────────────────────────────────────────────────────
export async function gqlMyDevices(): Promise<RegisteredDevice[]> {
  const data = await graphqlRequest<{ myDevices: GqlDevice[] }>(
    `query MyDevices { myDevices { ${DEVICE_FIELDS} } }`,
    {}
  );
  return data.myDevices.map(toDevice);
}

// ─── Owner: devices for one branch (req #4 — filter by branch) ───────────────
export async function gqlDevicesByBranch(branchId: string): Promise<RegisteredDevice[]> {
  const data = await graphqlRequest<{ devicesByBranch: GqlDevice[] }>(
    `query DevicesByBranch($branchId: ID!) { devicesByBranch(branchId: $branchId) { ${DEVICE_FIELDS} } }`,
    { branchId }
  );
  return data.devicesByBranch.map(toDevice);
}

// ─── Staff: the current device's registration status (poll for approval) ─────
export async function gqlMyDevice(): Promise<RegisteredDevice | null> {
  const data = await graphqlRequest<{ myDevice: GqlDevice | null }>(
    `query MyDevice { myDevice { ${DEVICE_FIELDS} } }`,
    {}
  );
  return data.myDevice ? toDevice(data.myDevice) : null;
}

// ─── Staff: branch options for the registration dropdown ─────────────────────
export async function gqlMyBranchOptions(): Promise<BranchOption[]> {
  const data = await graphqlRequest<{ myBranchOptions: { _id: string; name: string }[] }>(
    `query MyBranchOptions { myBranchOptions { _id name } }`,
    {}
  );
  return data.myBranchOptions.map((b) => ({ id: b._id, name: b.name }));
}

// ─── Staff: who is the owner that will approve this device ───────────────────
export interface OwnerInfo {
  name: string;
}

export async function gqlMyOwner(): Promise<OwnerInfo | null> {
  const data = await graphqlRequest<{ myOwner: { name: string } | null }>(
    `query MyOwner { myOwner { name } }`,
    {}
  );
  return data.myOwner ? { name: data.myOwner.name } : null;
}

// ─── Staff: re-notify the owner about a pending device ───────────────────────
export async function gqlRemindDeviceApproval(): Promise<boolean> {
  const data = await graphqlRequest<{ remindDeviceApproval: boolean }>(
    `mutation RemindDeviceApproval { remindDeviceApproval }`,
    {}
  );
  return data.remindDeviceApproval;
}

// ─── registerDevice (staff → PENDING, owner → APPROVED) ──────────────────────
export async function gqlRegisterDevice(
  deviceName: string,
  operatingSystem: string,
  branchId: string,
  deviceModel?: string,
): Promise<RegisteredDevice> {
  const fcmToken = await getDeviceId();
  const data = await graphqlRequest<{ registerDevice: GqlDevice }>(
    `mutation RegisterDevice($input: CreateDeviceInput!) {
       registerDevice(input: $input) { ${DEVICE_FIELDS} }
     }`,
    { input: { deviceName, operatingSystem, branchId, deviceModel, fcmToken } }
  );
  return toDevice(data.registerDevice);
}

// ─── requestDeviceRegistration — REMOVED (F11) ───────────────────────────────
// gqlRequestDeviceRegistration() called the `requestDeviceRegistration` mutation,
// which does not exist in the backend SDL, and had no callers anywhere in the
// app. Staff device registration goes through gqlRegisterDevice() above; owner
// approval happens in src/screens/settings/DevicesScreen.tsx. Deleted rather
// than typed, so nobody wires it up and gets a runtime failure.

// ─── claimDevice (staff → mark THIS device as the single active session) ─────
// Called on every login. Tells the backend this device now holds the account's
// session; the staff's other devices are superseded and auto-sign-out on their
// next request. Pass the FCM push token (when available) so a later supersession
// can prune it. No-op server-side for owners. Best-effort — never blocks login.
export async function gqlClaimDevice(pushToken?: string): Promise<void> {
  try {
    await graphqlRequest<{ claimDevice: { _id: string } | null }>(
      `mutation ClaimDevice($pushToken: String) {
         claimDevice(pushToken: $pushToken) { _id activeSession }
       }`,
      { pushToken: pushToken ?? null }
    );
  } catch {
    // Swallow — a failed claim must never break the login flow.
  }
}

// ─── Owner approval actions ──────────────────────────────────────────────────
export async function gqlApproveDevice(id: string): Promise<void> {
  await graphqlRequest<{ approveDevice: { _id: string } }>(
    `mutation ApproveDevice($id: ID!) { approveDevice(id: $id) { _id } }`,
    { id }
  );
}

export async function gqlDisapproveDevice(id: string): Promise<void> {
  await graphqlRequest<{ disapproveDevice: boolean }>(
    `mutation DisapproveDevice($id: ID!) { disapproveDevice(id: $id) }`,
    { id }
  );
}

export async function gqlBlockDevice(id: string): Promise<void> {
  await graphqlRequest<{ blockDevice: { _id: string } }>(
    `mutation BlockDevice($id: ID!) { blockDevice(id: $id) { _id } }`,
    { id }
  );
}

export async function gqlUnblockDevice(id: string): Promise<void> {
  await graphqlRequest<{ unblockDevice: { _id: string } }>(
    `mutation UnblockDevice($id: ID!) { unblockDevice(id: $id) { _id } }`,
    { id }
  );
}

// ─── deleteDevice (remove) ────────────────────────────────────────────────────
export async function gqlDeleteDevice(id: string): Promise<void> {
  await graphqlRequest<{ deleteDevice: boolean }>(
    `mutation DeleteDevice($id: ID!) { deleteDevice(id: $id) }`,
    { id }
  );
}
