// src/services/graphql/onlineOrders.ts
// Partner-side operations on the shared online-orders domain (the same
// `online_orders` collection the Customer app writes into via createOnlineOrder).
//
// Used by two role stacks:
//   • Washer/Merchant (provider): incoming orders → accept → assign pickup →
//     mark laundry ready → assign return.
//   • Courier (delivery staff): assigned legs → start route → arrive →
//     record pickup (weigh + payment) → record delivery.
//
// The BE enforces the status state machine (assertValidTransition) and courier
// identity (assertAssignedCourier) — the FE only requests transitions.

import { graphqlRequest } from "../../config/graphql";

// ─── Types (mirror schema.gql; hand-written like the rest of src/services) ────

export type OnlineOrderStatus = string; // full enum lives server-side; FE treats as string

/** A WGS84 coordinate pair, matching the BE `MapLocation` type. */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface GqlLegAssignment {
  assignedStaffUid: string | null;
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationAt: string | null;
  locationAccuracy: number | null;
  locationSpeed: number | null;
  locationHeading: number | null;
  locationSequence: number | null;
}

export interface CourierLocationFix {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  recordedAt: string; // ISO
  sequence: number;   // monotonic per device
}

export interface GqlOnlineOrder {
  _id: string;
  /**
   * The reference the CUSTOMER sees, e.g. "LB-000001". Null on orders created
   * before numbering existed — orderRef falls back for those.
   */
  orderNumber: string | null;
  status: OnlineOrderStatus;
  version: number;
  createdAt: string | null;
  // CustomerSnapshot resolves through a BE redaction gate (RISK-P0-009):
  // maskedPhone/address/mapLocation are NULL for a courier before their leg
  // starts and again after it completes — only uid/displayName/areaLabel are
  // always present. Full data resolves for the provider owner, non-courier
  // staff, and the assigned courier while their leg is live.
  customer: {
    uid: string;
    displayName: string;
    // Generalized "Barangay, City" — always populated; the only location any
    // reader outside the live-leg window gets.
    areaLabel: string | null;
    maskedPhone: string | null;
    address: {
      unit: string | null;
      streetAddress: string;
      barangayName: string;
      cityMunicipalityName: string;
      provinceName: string;
    } | null;
    mapLocation: LatLng | null;
  };
  provider: {
    providerUid: string;
    providerName: string;
    providerType: string;
    branchId: string;
    // Snapshotted at booking — whether this shop was offering Pay Later then.
    // Drives whether the courier sees the option at all.
    allowsPayAtHandover: boolean | null;
  };
  fulfillment: {
    pickupMode: string;
    returnMode: string;
    deliverySubMode: string | null;
    pickupSubMode: string | null;
    /** The DAY the customer booked. Never a time — see the BE contract. */
    scheduledPickup: { date: string; label: string } | null;
  };
  pricing: {
    estimatedTotalCentavos: number;
    estimatedWeightKg: number | null;
    actualWeightKg: number | null;
    customerTotalCentavos: number | null;
    /** Service total after weigh-in, before platform and fulfillment fees. */
    actualServiceTotalCentavos: number | null;
    /** The GROSS fee the rule produced. A promotion never reduces this — it is
     *  recorded separately, so a report can always say what the fee was and who
     *  ended up paying it. */
    platformFeePercent: number | null;
    platformFeeCentavos: number | null;
    /** What a partner incentive forgave, and which one. */
    platformFeeDiscountCentavos: number | null;
    platformFeePromoCode: string | null;
    /** The part of the fee that came from a quality penalty. Never waived. */
    platformFeeSurchargeCentavos: number | null;
  };
  paymentSummary: {
    method: string | null;
    amountCollectedCentavos: number | null;
    // Cash tender (GAP-H-017): what the customer handed over and the change
    // due, both computed server-side from RecordCollectionInput.tenderedCentavos.
    tenderedCentavos: number | null;
    changeCentavos: number | null;
    collectedAt: string | null;
    lastCollectedAt: string | null;
  };
  // What the customer still owes RIGHT NOW, server-derived. The whole total on
  // an order that deferred at pickup, just the shortfall on one left short by
  // an approved surcharge, 0 once settled. Never recompute this locally — the
  // courier collects against it.
  amountDueCentavos: number;
  // The customer's dialable number — non-null ONLY for the courier currently
  // working a leg (BE: activeCourierLeg). Null before "Start navigation", after
  // the leg completes, and for every other reader; customer.maskedPhone is all
  // anyone else gets.
  contactPhone: string | null;
  // Deferred settlement is supported again (§14): AT_FINAL_HANDOVER means the
  // customer pays the whole amount when the laundry comes back. The legacy
  // on_delivery string is resolver-mapped server-side and never reaches here.
  paymentTiming: "ON_PICKUP" | "AT_FINAL_HANDOVER";
  paymentStatus: "UNPAID" | "BALANCE_DUE" | "PAID";
  activeQualityHold: {
    serviceLineIndex: number;
    reason: string;
    blocksOrder: boolean;
    additionalChargeCentavos: number | null;
    customerResponse: string;
    raisedAt: string;
    resolvedAt: string | null;
  } | null;
  serviceLines: {
    serviceRefId: string;
    serviceName: string;
    pricingType: string; // PER_KILO | PER_KILO_WITH_BASE | PER_PIECE | PER_LOAD
    estimatedPieceCount: number | null;
    estimatedLineTotalCentavos: number;
    actualLineTotalCentavos: number | null;
  }[];
  instructions: {
    pickupInstructions: string | null;
    laundryCareInstructions: string | null;
    returnInstructions: string | null;
    customerGeneralNotes: string | null;
  };
  pickupAssignment: GqlLegAssignment | null;
  returnAssignment: GqlLegAssignment | null;
}

// GraphQL serializes OrderStatus by enum KEY (e.g. "PENDING_PROVIDER_ACCEPTANCE");
// the FE state machine compares the lowercase enum VALUES. Normalize once here.
// Legacy payment enum values (removed from the schema, but a stale cache or an
// older BE could still emit them) are mapped to their canonical successors.
/**
 * The wire shape: identical to GqlOnlineOrder except the three fields this
 * mapper normalises, which arrive as raw SDL enum names (uppercase) rather than
 * the FE's own unions. Typing the boundary this way means adding a field to
 * GqlOnlineOrder automatically type-checks here instead of silently passing
 * through an `any` spread.
 */
type RawOnlineOrder = Omit<
  GqlOnlineOrder,
  "status" | "paymentTiming" | "paymentStatus"
> & {
  status?: string | null;
  paymentTiming?: string | null;
  paymentStatus?: string | null;
};

function mapOrder(raw: RawOnlineOrder): GqlOnlineOrder {
  // paymentTiming is passed through, NOT overwritten. It used to be pinned to
  // "ON_PICKUP" here because that was the only legal value; leaving that in
  // would silently swallow AT_FINAL_HANDOVER and show every deferred order as
  // paid at the door.
  const rawTiming = String(raw.paymentTiming ?? "ON_PICKUP").toUpperCase();
  const paymentTiming: GqlOnlineOrder["paymentTiming"] =
    rawTiming === "AT_FINAL_HANDOVER" ? "AT_FINAL_HANDOVER" : "ON_PICKUP";
  const rawPay = String(raw.paymentStatus ?? "UNPAID").toUpperCase();
  // TO_PAY_ON_DELIVERY was removed from the schema; a stale cache or an older
  // BE could still emit it, so it collapses to its canonical successor.
  const paymentStatus = (rawPay === "TO_PAY_ON_DELIVERY"
    ? "UNPAID"
    : rawPay) as GqlOnlineOrder["paymentStatus"];
  return {
    ...raw,
    status: String(raw.status ?? "").toLowerCase() as OnlineOrderStatus,
    paymentTiming,
    paymentStatus,
  };
}

const ORDER_FIELDS = `
  _id orderNumber status version createdAt
  customer {
    uid displayName areaLabel maskedPhone
    address { unit streetAddress barangayName cityMunicipalityName provinceName }
    mapLocation { latitude longitude }
  }
  provider { providerUid providerName providerType branchId allowsPayAtHandover }
  fulfillment {
    pickupMode returnMode deliverySubMode pickupSubMode
    scheduledPickup { date label }
  }
  pricing {
    estimatedTotalCentavos estimatedWeightKg actualWeightKg customerTotalCentavos
    actualServiceTotalCentavos
    platformFeePercent platformFeeCentavos
    platformFeeDiscountCentavos platformFeePromoCode
    platformFeeSurchargeCentavos
  }
  activeQualityHold { serviceLineIndex reason blocksOrder additionalChargeCentavos customerResponse raisedAt resolvedAt }
  paymentSummary { method amountCollectedCentavos tenderedCentavos changeCentavos collectedAt lastCollectedAt }
  paymentTiming
  paymentStatus
  amountDueCentavos
  contactPhone
  serviceLines { serviceRefId serviceName pricingType estimatedPieceCount estimatedLineTotalCentavos actualLineTotalCentavos }
  instructions { pickupInstructions laundryCareInstructions returnInstructions customerGeneralNotes }
  pickupAssignment { assignedStaffUid assignedAt enRouteAt arrivedAt completedAt locationLat locationLng locationAt locationAccuracy locationSpeed locationHeading locationSequence }
  returnAssignment { assignedStaffUid assignedAt enRouteAt arrivedAt completedAt locationLat locationLng locationAt locationAccuracy locationSpeed locationHeading locationSequence }
`;

// ─── Provider (washer / merchant) ─────────────────────────────────────────────

export async function gqlIncomingOnlineOrders(branchId: string): Promise<GqlOnlineOrder[]> {
  const data = await graphqlRequest<{ incomingOnlineOrders: GqlOnlineOrder[] }>(
    `query IncomingOnlineOrders($branchId: ID!) {
       incomingOnlineOrders(branchId: $branchId) { ${ORDER_FIELDS} }
     }`,
    { branchId },
  );
  return data.incomingOnlineOrders.map(mapOrder);
}

// Single order by id — authorized for the customer OR the provider (used e.g.
// to show order context inside a chat thread).
export async function gqlOnlineOrder(id: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ onlineOrder: GqlOnlineOrder }>(
    `query OnlineOrder($id: ID!) { onlineOrder(id: $id) { ${ORDER_FIELDS} } }`,
    { id },
  );
  return mapOrder(data.onlineOrder);
}

export async function gqlAcceptOnlineOrder(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ acceptOnlineOrder: GqlOnlineOrder }>(
    `mutation AcceptOnlineOrder($orderId: ID!) {
       acceptOnlineOrder(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.acceptOnlineOrder);
}

export async function gqlAssignPickupStaff(orderId: string, staffUid: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ assignPickupStaff: GqlOnlineOrder }>(
    `mutation AssignPickupStaff($orderId: ID!, $staffUid: String!) {
       assignPickupStaff(orderId: $orderId, staffUid: $staffUid) { ${ORDER_FIELDS} }
     }`,
    { orderId, staffUid },
  );
  return mapOrder(data.assignPickupStaff);
}

export async function gqlMarkLaundryReady(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ markLaundryReady: GqlOnlineOrder }>(
    `mutation MarkLaundryReady($orderId: ID!) {
       markLaundryReady(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.markLaundryReady);
}

export async function gqlAssignReturnStaff(orderId: string, staffUid: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ assignReturnStaff: GqlOnlineOrder }>(
    `mutation AssignReturnStaff($orderId: ID!, $staffUid: String!) {
       assignReturnStaff(orderId: $orderId, staffUid: $staffUid) { ${ORDER_FIELDS} }
     }`,
    { orderId, staffUid },
  );
  return mapOrder(data.assignReturnStaff);
}

// Staff roster (used to pick a courier uid when assigning legs)
export interface GqlStaffLite {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
}

/** The backend's AssignableCourier — every row is already a courier, so there
 *  is no role to inspect and no client-side filtering left to get wrong. */
interface RawAssignableCourier {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export async function gqlAssignableCouriers(branchId: string): Promise<GqlStaffLite[]> {
  // Was `myStaff`, filtered to role === "courier" here in the client. That
  // query lives on the owner-only StaffResolver, so a staff member got
  // UNAUTHENTICATED and the picker read "No couriers on your staff yet" — and
  // for owners it listed couriers the assign mutation then refused, because
  // nothing here checked selfie status or branch. The backend now answers the
  // real question, using the same predicate the assignment enforces.
  const data = await graphqlRequest<{ assignableCouriers: RawAssignableCourier[] }>(
    `query AssignableCouriers($branchId: ID!) {
       assignableCouriers(branchId: $branchId) { _id firstName lastName email }
     }`,
    { branchId },
  );
  return (data.assignableCouriers ?? []).map((c) => ({
    _id: c._id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email ?? "",
    roleId: "courier",
  }));
}

// ─── Courier (delivery staff) ─────────────────────────────────────────────────

export async function gqlMyAssignedOnlineOrders(): Promise<GqlOnlineOrder[]> {
  const data = await graphqlRequest<{ myAssignedOnlineOrders: GqlOnlineOrder[] }>(
    `query MyAssignedOnlineOrders { myAssignedOnlineOrders { ${ORDER_FIELDS} } }`,
  );
  return data.myAssignedOnlineOrders.map(mapOrder);
}

export async function gqlStartPickupRoute(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ startPickupRoute: GqlOnlineOrder }>(
    `mutation StartPickupRoute($orderId: ID!) {
       startPickupRoute(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.startPickupRoute);
}

export async function gqlArriveAtPickup(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ arriveAtPickup: GqlOnlineOrder }>(
    `mutation ArriveAtPickup($orderId: ID!) {
       arriveAtPickup(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.arriveAtPickup);
}

// One measured quantity per service line — kg for weight-priced lines, pieces
// for per-piece lines. Takes precedence over the order-level actualWeightKg.
export interface LineActualInput {
  serviceRefId: string;
  actualWeightKg?: number;
  actualPieceCount?: number;
}

// One shape for every collection point — courier pickup, counter drop-off,
// delivery settlement, self-pickup settlement.
//
// paymentMethod is omitted only when deferring (paymentTiming =
// AT_FINAL_HANDOVER); the server rejects supplying both. tenderedCentavos is
// optional CASH tender and must cover the amount OUTSTANDING (not the order
// total) — the server computes changeCentavos (GAP-H-017).
// Uploads one handover photo and returns its storage KEY. The key is then
// passed to recordPickupWeight/recordDelivery via proofObjectKeys — upload
// first, record second, because the record mutation runs in a DB transaction
// that must not be held open for the length of a mobile upload.
//
// Not uploadMedia: that writes to the public branding bucket and excludes
// couriers. These frames show a customer's doorway, so they go to private
// storage and are read back through short-lived signed URLs.
export async function gqlUploadHandoverProof(
  orderId: string,
  leg: "PICKUP" | "RETURN",
  base64: string,
  mimeType: string,
): Promise<string> {
  const data = await graphqlRequest<{ uploadHandoverProof: string }>(
    `mutation UploadHandoverProof($orderId: ID!, $leg: OrderLeg!, $base64: String!, $mimeType: String!) {
       uploadHandoverProof(orderId: $orderId, leg: $leg, base64: $base64, mimeType: $mimeType)
     }`,
    { orderId, leg, base64, mimeType },
  );
  return data.uploadHandoverProof;
}

export interface CollectionInput {
  actualWeightKg?: number;
  actualPieceCount?: number;
  lineActuals?: LineActualInput[];
  paymentMethod?: "CASH" | "EWALLET_OUTSIDE_APP";
  referenceId?: string;
  tenderedCentavos?: number;
  paymentTiming?: "ON_PICKUP" | "AT_FINAL_HANDOVER";
  /** Storage keys from gqlUploadHandoverProof, stamped onto this leg. */
  proofObjectKeys?: string[];
}

// Weigh/count each line at the customer's door and finalize pricing — no
// payment yet. Transitions pickup_arrived → pickup_weighed so the customer's
// tracking screen can show the confirmed weight/price BEFORE the courier
// collects any money (the split that replaced the old atomic recordPickup).
export interface RecordPickupWeightInput {
  actualWeightKg?: number;
  actualPieceCount?: number;
  lineActuals?: LineActualInput[];
  proofObjectKeys?: string[];
}

export async function gqlRecordPickupWeight(
  orderId: string,
  input: RecordPickupWeightInput,
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ recordPickupWeight: GqlOnlineOrder }>(
    `mutation RecordPickupWeight($orderId: ID!, $input: RecordPickupWeightInput!) {
       recordPickupWeight(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input },
  );
  return mapOrder(data.recordPickupWeight);
}

// Collect (or defer) payment once the weigh step above has finalized pricing.
// Only valid from pickup_weighed; auto-advances the order through
// picked_up_from_customer → laundry_in_progress on success.
export interface RecordPickupPaymentInput {
  paymentTiming?: "ON_PICKUP" | "AT_FINAL_HANDOVER";
  paymentMethod?: "CASH" | "EWALLET_OUTSIDE_APP";
  referenceId?: string;
  tenderedCentavos?: number;
}

export async function gqlRecordPickupPayment(
  orderId: string,
  input: RecordPickupPaymentInput,
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ recordPickupPayment: GqlOnlineOrder }>(
    `mutation RecordPickupPayment($orderId: ID!, $input: RecordPickupPaymentInput!) {
       recordPickupPayment(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input },
  );
  return mapOrder(data.recordPickupPayment);
}

export async function gqlStartReturnRoute(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ startReturnRoute: GqlOnlineOrder }>(
    `mutation StartReturnRoute($orderId: ID!) {
       startReturnRoute(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.startReturnRoute);
}

export async function gqlArriveAtReturn(orderId: string): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ arriveAtReturn: GqlOnlineOrder }>(
    `mutation ArriveAtReturn($orderId: ID!) {
       arriveAtReturn(orderId: $orderId) { ${ORDER_FIELDS} }
     }`,
    { orderId },
  );
  return mapOrder(data.arriveAtReturn);
}

// Live GPS ping while a leg is in progress. Sends a full fix (with sequence +
// recordedAt) so the server can validate/reject out-of-order or bad fixes.
// Fire-and-forget on an interval; returns the order id only.
export async function gqlUpdateCourierLocation(
  orderId: string,
  fix: CourierLocationFix,
): Promise<void> {
  await graphqlRequest(
    `mutation UpdateCourierLocation($orderId: ID!, $input: UpdateCourierLocationInput!) {
       updateCourierLocation(orderId: $orderId, input: $input) { _id }
     }`,
    { orderId, input: fix },
  );
}

// `input` is only needed when something is still to collect at handover (e.g.
// a legacy uncollected order). Omit it for an already-paid order.
export async function gqlRecordDelivery(
  orderId: string,
  input?: CollectionInput,
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ recordDelivery: GqlOnlineOrder }>(
    `mutation RecordDelivery($orderId: ID!, $input: RecordCollectionInput) {
       recordDelivery(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input: input ?? null },
  );
  return mapOrder(data.recordDelivery);
}

/**
 * Flags a problem with one service line mid-processing (§12).
 *
 * blocksOrder=true means the resolution changes price or scope, so the order
 * stops until the customer answers. blocksOrder=false is documentary — noted
 * with photos, order keeps moving, nobody is asked anything.
 *
 * A hold NEVER cancels an order; it always resolves back into processing, with
 * or without the extra work.
 */
export async function gqlRaiseQualityHold(
  orderId: string,
  input: {
    serviceLineIndex: number;
    reason: string;
    blocksOrder: boolean;
    category?: string;
    additionalChargeCentavos?: number;
    photoUrls?: string[];
  },
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ raiseQualityHold: GqlOnlineOrder }>(
    `mutation RaiseQualityHold($orderId: ID!, $input: RaiseQualityHoldInput!) {
       raiseQualityHold(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input },
  );
  return mapOrder(data.raiseQualityHold);
}

// Counter receipt for a CUSTOMER_DROPOFF order — the drop-off twin of
// recordPickup. Staff/washer weighs at the counter and either collects or, if
// the shop offers it, records that the customer is paying at handover.
export async function gqlReceiveOrderAtCounter(
  orderId: string,
  input: CollectionInput,
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ receiveOrderAtCounter: GqlOnlineOrder }>(
    `mutation ReceiveOrderAtCounter($orderId: ID!, $input: RecordCollectionInput!) {
       receiveOrderAtCounter(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input },
  );
  return mapOrder(data.receiveOrderAtCounter);
}

// Hand a CUSTOMER_SELF_PICKUP order back over the counter. `input` settles any
// outstanding balance first — the server refuses the handover without it.
export async function gqlVerifySelfPickup(
  orderId: string,
  input?: CollectionInput,
): Promise<GqlOnlineOrder> {
  const data = await graphqlRequest<{ verifySelfPickup: GqlOnlineOrder }>(
    `mutation VerifySelfPickup($orderId: ID!, $input: RecordCollectionInput) {
       verifySelfPickup(orderId: $orderId, input: $input) { ${ORDER_FIELDS} }
     }`,
    { orderId, input: input ?? null },
  );
  return mapOrder(data.verifySelfPickup);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

// Whole-peso display for online-order amounts — matches the customer app (no
// centavos), so the courier/merchant and the customer never see a ₱357.50 vs
// ₱358 mismatch on the same order.
export function pesos(centavos: number | null | undefined): string {
  if (centavos == null) return "—";
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

// Exact address line — null when the redaction gate withheld the address (a
// courier looking at an order no leg of which is assigned to them). Callers
// fall back to areaLabel.
export function customerExactAddressLine(o: GqlOnlineOrder): string | null {
  const a = o.customer.address;
  if (!a) return null;
  const line = [a.unit, a.streetAddress, a.barangayName, a.cityMunicipalityName]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

// Best display line for any reader: the exact address when visible, else the
// always-present generalized areaLabel ("Barangay, City").
export function customerAddressLine(o: GqlOnlineOrder): string {
  return customerExactAddressLine(o) ?? o.customer.areaLabel ?? "";
}

// The customer's drop pin, or null when it isn't usable. `mapLocation` is
// non-null in the SDL, but an unset pin serializes as 0,0 — which is a real
// coordinate in the Atlantic, so it would silently place a marker there and
// drag the map's fitted bounds halfway around the world. Callers fall back to
// the address text instead.
export function customerLatLng(o: GqlOnlineOrder): LatLng | null {
  const p = o.customer.mapLocation;
  if (!p) return null;
  const { latitude, longitude } = p;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

// Statuses in which a courier is physically working a leg. Mirrors the BE's
// activeCourierLeg (src/online-orders/courier-access.util.ts) — keep the two in
// step, since the server is the one that actually enforces it.
const LIVE_PICKUP = ["pickup_en_route", "pickup_arrived", "pickup_weighed"];
const LIVE_RETURN = ["return_en_route", "return_arrived"];

/**
 * The leg `uid` is actively riding on this order, or null.
 *
 * Gates the courier-side contact affordances (call + chat): open from
 * "Start navigation" until the leg is handed over, checked per leg against that
 * leg's own assignee so a different rider on the return gets their own window.
 */
export function courierLegLive(
  o: GqlOnlineOrder,
  uid: string,
): "PICKUP" | "RETURN" | null {
  if (!uid) return null;
  if (o.pickupAssignment?.assignedStaffUid === uid && LIVE_PICKUP.includes(o.status)) return "PICKUP";
  if (o.returnAssignment?.assignedStaffUid === uid && LIVE_RETURN.includes(o.status)) return "RETURN";
  return null;
}

// Mirrors the BE's CONCLUDED_ORDER_STATUSES (src/chat/chat.service.ts) — the
// set of statuses a PROVIDER-kind conversation is closed under, same rule the
// server already enforces on sendMessage/uploadChatImage. Kept here (not just
// server-side) so the provider chat thread's composer can lock itself instead
// of only finding out via a rejected send.
const CONCLUDED_ORDER_STATUSES = new Set([
  "delivered_to_customer",
  "customer_pickup_verified",
  "completed",
  "cancelled",
  "rejected_by_provider",
  "refunded",
  "disputed",
]);

export function isOrderConcluded(status: string): boolean {
  return CONCLUDED_ORDER_STATUSES.has(status);
}
