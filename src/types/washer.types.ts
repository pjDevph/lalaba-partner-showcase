// src/types/washer.types.ts
// Washer domain types — mirrors the Firestore collections in the Partner ERD.
// All IDs are Firestore document IDs (string).

// ─── Enums ────────────────────────────────────────────────────────────────────

export type WasherStatus = "PENDING_CERT" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";


export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export type EarningStatus = "PENDING" | "RELEASED" | "WITHDRAWN";

export type WasherMachineType = "FRONT_LOAD" | "TOP_LOAD";

export type WasherCapacity = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export type WasherServiceType =
  | "WASH_ONLY"
  | "WASH_DRY"
  | "WASH_DRY_FOLD"
  | "EXPRESS"
  | "CUSTOM";

// ─── Washer Service ───────────────────────────────────────────────────────────

export interface WasherService {
  serviceId: string;          // client-generated UUID
  label: string;              // "Wash & Dry", "Express", etc.
  description: string | null;
  serviceType: WasherServiceType;
  pricePerKg: number | null;  // null when flat-rate
  flatPrice: number | null;   // null when per-kg
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string | null;   // ISO string (stored in Firestore)
  updatedAt: string | null;
}

// ─── Washer Profile ───────────────────────────────────────────────────────────

export interface WasherProfile {
  washerId: string;
  userId: string;
  // Anchor Branch id created at registration — the key into the shared
  // online-orders domain (incomingOnlineOrders(branchId)).
  branchId: string | null;
  displayName: string;
  phone: string;
  photoUrl: string | null;
  bio: string | null;

  /** When she is open — the same shape merchant branches use.
   *  Load-bearing: the booking engine generates her bookable slots from these,
   *  and discovery renders "Open until 8:00 PM" from them. Edited on the
   *  Booking availability screen.
   *
   *  Optional because it is genuinely absent until she sets it — the booking
   *  engine falls back to the platform default week in that case. */
  operatingHours?:
    | import("../screens/settings/hoursMapping").BeOperatingHours
    | null;

  // Machine info
  machineType: WasherMachineType;
  machineCapacityKg: WasherCapacity;
  machineBrand: string | null;

  // Location
  barangay: string;
  city: string;
  serviceRadiusKm: number;

  // Phase 2 structured location, carried in with the KYC/certification screens.
  // Optional because the Phase 1 shape above (barangay/city) is what most of
  // this app still reads, and every existing construction site — including the
  // store tests — predates these fields. `mapProfile` populates all three from
  // the wire payload, so anything that needs a full PSGC address (the washer
  // profile editor, verification) can rely on them at runtime.
  address?: WasherAddress | null;
  mapLocation?: WasherMapLocation | null;
  offeredServiceTemplateIds?: string[];

  // Pricing (legacy single-rate — kept for backward compat)
  pricePerKg: number;
  platformFeePercent: number;  // 10 — platform-controlled

  // Multi-service list (Phase 1A: stored as array on profile doc)
  services: WasherService[];

  // Online store customisation
  /** The shop name customers see — a laundromat's `branchName` equivalent, and
   *  NOT `displayName`, which is her own name (seeded at registration, shown to
   *  Admin in KYC review, not editable here).
   *
   *  REQUIRED: the Online Store screen will not save without one, the BE rejects
   *  a blank or null value, and nothing falls back to `displayName` — a shop is
   *  never listed under a person's name. Typed nullable only because a washer
   *  who registered before the field existed can still be holding null until the
   *  backfill migration runs. */
  storeName: string | null;
  storeHeaderUrl: string | null;
  storeFeaturedPhotos: string[];
  storeDescription: string | null;
  /** The washer's store logo, shown to customers on her provider profile.
   *
   *  For a home washer this is the SAME image as `photoUrl`: she has no
   *  shopfront to photograph, so her verification selfie serves as both. The
   *  backend writes the two together when the selfie is submitted, and the
   *  store editor renders this read-only — there is no logo upload for washers.
   *  (Merchant branches are unaffected and still upload real signage.) */
  logoUrl: string | null;

  // The raw BE names behind storeHeaderUrl / storeDescription. `mapProfile`
  // spreads the wire payload before aliasing, so both spellings are present on
  // a live object; declaring them keeps that honest for anything constructing
  // or reading a profile directly.
  coverPhotoUrl?: string | null;
  description?: string | null;

  // Status
  status: WasherStatus;
  /** KYC/verification state — queried by WASHER_PROFILE_FIELDS and read by the
   *  verification screens. Optional: it postdates the Phase 1 fixtures. */
  verificationStatus?: string | null;
  isAvailable: boolean;        // Washer-controlled toggle
  slotsUsedToday: number;      // backend-computed, refreshed daily
  // Per-washer daily booking cap, set by admin and enforced by the BE. Optional
  // in the schema — fall back to the platform default when absent.
  maxOrdersPerDay?: number | null;

  // Timestamps
  createdAt: Date | null;
  updatedAt: Date | null;
}


// ─── Booking ──────────────────────────────────────────────────────────────────

export interface WasherBookingItem {
  serviceLabel: string;        // e.g. "Wash & Dry", "Fold Only"
  weightKg: number;
  subtotal: number;
}

export interface WasherBooking {
  bookingId: string;
  washerId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;

  // Schedule
  bookingDate: string;         // ISO date string: "2026-04-29"
  slotNumber: 1 | 2 | 3;      // backend-assigned

  // Service
  items: WasherBookingItem[];
  totalWeightKg: number;
  totalAmount: number;
  platformFee: number;
  washerPayout: number;

  // Status
  status: BookingStatus;
  pickupAddress: string;
  deliveryAddress: string;

  // Timestamps
  confirmedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date | null;
}

// ─── Earnings ─────────────────────────────────────────────────────────────────

export interface WasherEarning {
  earningId: string;
  washerId: string;
  bookingId: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: EarningStatus;
  holdUntil: Date | null;      // PENDING until 24h after booking completion
  releasedAt: Date | null;
  withdrawnAt: Date | null;
  withdrawalRef: string | null;
  createdAt: Date | null;
}

// ─── Review ───────────────────────────────────────────────────────────────────

export interface WasherReview {
  reviewId: string;
  washerId: string;
  customerId: string;
  bookingId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createdAt: Date | null;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

// Mirrors the BE `WasherStats` type exactly. Operational counts only: the money
// aggregates that used to live here (totalEarningsThisMonth / pendingEarnings /
// completedBookingsAllTime) were dropped from the schema with GAP-P0-011 when
// the legacy washer_earnings collection went away. Asking for them made the
// WHOLE washerStats query fail validation, which is why every tile read zero.
export interface WasherDashboardStats {
  slotsUsedToday: number;      // counted against the daily cap
  activeOrders: number;
  completedOrders: number;
  completedOrdersToday: number;
  totalKg: number;
  totalLoads: number;
  avgRating: number | null;
  totalReviews: number;
}

// ─── Phase 2 structured address / catalog / certification ─────────────────────
// Brought in with the KYC + certification screens (waves 2B-2/2C/2D). These
// mirror the BE Phase 2 contract: WasherAddressInput's exact key set, the
// platform-controlled service-template catalog, and the certification record.

export type CertStatus = "ISSUED" | "VALID" | "EXPIRED" | "REVOKED";

/** WasherAddressInput — 5 required PSGC levels + 2 optional. */
export interface WasherAddress {
  streetAddress: string;
  barangayName: string;
  cityMunicipalityName: string;
  provinceName: string;
  regionName: string;
  unit?: string | null;
  zipCode?: string | null;
}

export interface WasherMapLocation {
  latitude: number;
  longitude: number;
}

/** Platform-controlled service catalog a washer opts into by id. */
/** Who decides what this washer charges for a platform service. */
export type WasherPricingControl = "PLATFORM_FIXED" | "WASHER_SET";

/** How a washer may charge for a service. */
export type WasherPricingModel =
  | "PER_KG"
  | "PER_LOAD"
  | "BASE_EXCESS"
  | "PER_ITEM";

/** What a PER_ITEM service counts. Lalaba's list, not free text. */
export type WasherServiceUnit = "PIECE" | "PAIR" | "SET" | "PANEL";

export interface WasherServiceTemplate {
  _id: string;
  name: string;
  description: string | null;
  pricingControl: WasherPricingControl;
  allowedPricingModels: WasherPricingModel[];
  /** Safety limits on the washer's headline amount. Null = no limit. */
  minPriceCentavos: number | null;
  maxPriceCentavos: number | null;
  /**
   * How Lalaba's own numbers are charged under PLATFORM_FIXED. Nullable
   * because templates written before the field existed don't carry one — read
   * it as BASE_EXCESS, which is what they were.
   */
  platformPricingModel: WasherPricingModel | null;
  // Under PLATFORM_FIXED these are the price. Under WASHER_SET they are the
  // fallback until the washer sets her own.
  basePriceCentavos: number;
  baseWeightKg: number;
  excessRatePerKgCentavos: number;
  platformLoadCapacityKg: number | null;
  platformUnit: WasherServiceUnit | null;
  platformMinBillableKg: number | null;
  isActive: boolean;
}

/** This washer's own pricing for one platform service. */
export interface WasherServiceOffering {
  _id: string;
  branchId: string;
  serviceTemplateId: string;
  pricingModel: WasherPricingModel;
  /** Per kg, per load, or the base price — depends on pricingModel. */
  priceCentavos: number;
  loadCapacityKg: number | null;
  baseWeightKg: number | null;
  excessRatePerKgCentavos: number | null;
  minBillableKg: number | null;
  /** PER_ITEM only. */
  unit: WasherServiceUnit | null;
  minQuantity: number | null;
  maxQuantity: number | null;
}

export interface SetWasherServiceOfferingInput {
  serviceTemplateId: string;
  pricingModel: WasherPricingModel;
  priceCentavos: number;
  loadCapacityKg?: number | null;
  baseWeightKg?: number | null;
  excessRatePerKgCentavos?: number | null;
  minBillableKg?: number | null;
  unit?: WasherServiceUnit | null;
  minQuantity?: number | null;
  maxQuantity?: number | null;
}

export interface WasherCertification {
  certId: string;
  washerId: string;
  issuedBy: string;            // Admin userId
  issuedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  revocationReason: string | null;
  certNumber: string;
  status: CertStatus;
  notes: string | null;
}
