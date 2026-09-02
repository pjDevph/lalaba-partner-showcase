# Lalaba Merchant App — Developer Guide

## Table of Contents

1. [Setup After Cloning](#1-setup-after-cloning)
2. [Architecture Overview](#2-architecture-overview)
3. [Route Structure](#3-route-structure)
4. [State Management](#4-state-management)
5. [GraphQL API Contract](#5-graphql-api-contract)
6. [Backend Expectations](#6-backend-expectations)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Domain Data Schemas](#8-domain-data-schemas)

---

## 1. Setup After Cloning

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 10+ |
| Expo CLI | via `npx` (no global install needed) |
| Android Studio / Xcode | For device/emulator builds |
| Java 17 | Android builds |

### Step 1 — Install dependencies

```bash
npm install
```

### Step 2 — Create environment file

Copy and populate `.env` in the project root:

```env
# Backend URL — leave blank to use auto-detected LAN IP (dev mode only)
EXPO_PUBLIC_API_BASE_URL=

# Firebase (DEV project)
EXPO_PUBLIC_FIREBASE_API_KEY_DEV=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN_DEV=
EXPO_PUBLIC_FIREBASE_PROJECT_ID_DEV=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET_DEV=
EXPO_PUBLIC_FIREBASE_SENDER_ID_DEV=
EXPO_PUBLIC_FIREBASE_APP_ID_DEV=
```

All keys use the `EXPO_PUBLIC_` prefix so they are exposed at runtime in the JS bundle.

### Step 3 — Backend URL resolution

The app auto-resolves the GraphQL endpoint at startup via Metro's `hostUri`. You only need to set `EXPO_PUBLIC_API_BASE_URL` if:

- You're testing on a **physical Android device** (set it to your LAN IP: `http://192.168.x.x:3000`)
- You're connecting to **staging or production**

| Environment | Default URL |
|-------------|-------------|
| Development (Android emulator) | `http://10.0.2.2:3000` |
| Development (iOS simulator) | `http://localhost:3000` |
| Development (physical device) | Must set `EXPO_PUBLIC_API_BASE_URL` |
| Staging | `https://api-stg.lalaba.ph/v1` |
| Production | `https://api.lalaba.ph/v1` |

Switch environments by setting `EXPO_PUBLIC_ENV`:

```bash
EXPO_PUBLIC_ENV=staging npm start
```

### Step 4 — First-time native build (REQUIRED on fresh clone)

You must build the native Android layer once before `npm start` works:

```bash
npx expo run:android   # Compiles C++ + Java, installs APK, starts Metro
```

This takes ~15-20 min the first time. After that, `npm start` is enough for JS-only changes.

> **Critical:** Never set `newArchEnabled=false` in `android/gradle.properties`.
> This app requires React Native New Architecture (RN 0.83 + Expo SDK 55).
> Setting it to `false` compiles the C++ bridge without bridgeless support, causing
> a black screen crash: `ReferenceError: Property 'MessageQueue' doesn't exist`.

### Step 5 — Day-to-day development

```bash
npm start          # Opens Expo Dev menu (Tunnel/LAN/Local)
npm run android    # Run directly on Android emulator
npm run ios        # Run directly on iOS simulator
```

The `start.js` wrapper passes env vars through to `expo start`.

### Step 5 — Verify backend connectivity

On first launch (dev mode), the app calls `pingBackend()` which hits the `roles` query. Watch the console for:

```
✅ [FE] GraphQL endpoint configured: http://10.0.2.2:3000/graphql
🟢 [GQL] Roles → ok (Xms)
```

A `🔴` response means the backend is unreachable or misconfigured.

### Path Alias

The TypeScript path alias `@/*` resolves to `./src/*`:

```typescript
import { graphqlRequest } from '@/config/graphql';
import { authStore } from '@/stores/authStore';
```

### Type Checking & Lint

```bash
npm run type-check   # tsc --noEmit (strict mode)
npm run lint         # ESLint on src/ and app/
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Expo Router                         │
│          File-based routing — app/ directory            │
├─────────────┬──────────────┬───────────────────────────┤
│  (tabs)/    │   (staff)/   │       (washer)/            │
│  Merchant   │    Staff     │        Washer              │
│  Tab stack  │  Tab stack   │       Tab stack            │
├─────────────┴──────────────┴───────────────────────────┤
│                  Zustand Stores (~16)                   │
│  authStore · merchantStore · queueStore · posOrderStore │
│  inventoryStore · washerStore · washerBookingStore ...  │
├─────────────────────────────────────────────────────────┤
│             GraphQL Client (src/config/graphql.ts)      │
│    Bearer token auth · Device token header (staff)      │
│    ApiError class · Console dev logging                 │
├──────────────┬──────────────────────────────────────────┤
│   Firebase   │          NestJS GraphQL API              │
│   Auth only  │     {apiBaseUrl}/graphql endpoint        │
│  (ID tokens) │       MongoDB as data store              │
└──────────────┴──────────────────────────────────────────┘
```

### Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React Native 0.83 + Expo ~55 |
| Routing | Expo Router (file-based) |
| State | Zustand 4 (selective AsyncStorage persistence) |
| Styling | NativeWind 4 (TailwindCSS for RN) |
| Auth | Firebase (email/password + Google Sign-In) |
| API | Fetch-based GraphQL client (no Apollo/Urql) |
| Real-time | Firestore `onSnapshot` (queue) + 15s polling (washer bookings) |
| Offline | AsyncStorage rehydration on cold start |
| QR | `react-native-qrcode-svg` |
| Export | `xlsx` (Excel export) |

### Role-based Navigation

On sign-in the root layout (`app/_layout.tsx`) inspects `authStore.role` and routes to one of three separate navigation stacks:

| Role | Entry Point | Description |
|------|-------------|-------------|
| `MERCHANT` | `/(tabs)/dashboard` | Merchant owner with full access |
| `STAFF` | `/(staff)/pos` or `/(tabs)/dashboard` | Employee; cashier or manager level |
| `WASHER` | `/(washer)/dashboard` | Independent service provider |

First-time merchants with no branches are redirected to `/onboarding`. Staff devices awaiting approval go to `/device-pending`.

---

## 3. Route Structure

### Auth Routes

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `app/login.tsx` | Email/password sign-in |
| `/register` | `app/register.tsx` | New user signup |
| `/onboarding` | `app/onboarding.tsx` | First-time merchant branch setup |
| `/device-pending` | `app/device-pending.tsx` | Staff device awaiting merchant approval |

### Merchant Routes `app/(tabs)/`

| Tab | Route | Purpose |
|-----|-------|---------|
| Dashboard | `/dashboard` | Daily metrics summary |
| POS | `/pos` | Order creation terminal |
| Settings hub | `/settings` | Navigation to all management screens |

Screens accessible from Settings:

| Route | Purpose |
|-------|---------|
| `/services` | Laundry service catalogue CRUD |
| `/inventory` | Product inventory management |
| `/sales` | Sales history & export |
| `/tasks` | Task list management |
| `/costing` | Pricing & cost analysis |

### Staff Routes `app/(staff)/`

| Route | Purpose |
|-------|---------|
| `/pos` | Cashier terminal |
| `/activity` | Activity log |
| `/inventory` | View/manage inventory |
| `/tasks` | Assigned tasks |
| `/profile` | Staff profile, end shift |

### Washer Routes `app/(washer)/`

| Route | Purpose |
|-------|---------|
| `/dashboard` | Today's bookings & metrics |
| `/bookings` | Booking list & history |
| `/earnings` | Earnings summary & withdrawals |
| `/profile` | Profile, services, availability toggle |
| `/store` | Online store customisation |
| `/certification` | Certification details |

---

## 4. State Management

All stores use **Zustand**. Stores that need cold-start persistence use Zustand's `persist` middleware backed by `AsyncStorage`.

### Store Inventory

| Store | File | Persisted | AsyncStorage key |
|-------|------|-----------|-----------------|
| `authStore` | `stores/authStore.ts` | Selective | `lalaba-merchant-auth` |
| `merchantStore` | `stores/merchantStore.ts` | Selective | `lalaba-merchant-profile` |
| `washerStore` | `stores/washerStore.ts` | Selective | `lalaba-washer` |
| `displayStore` | `stores/displayStore.ts` | Full | — |
| `staffStore` | `stores/staffStore.ts` | No | — |
| `activeStaffStore` | `stores/activeStaffStore.ts` | No | — |
| `orderDetailStore` | `stores/orderDetailStore.ts` | No | — |
| `posOrderStore` | `stores/posOrderStore.ts` | No | — |
| `queueStore` | `stores/queueStore.ts` | No | — |
| `analyticsStore` | `stores/analyticsStore.ts` | No | — |
| `inventoryStore` | `stores/inventoryStore.ts` | No | — |
| `washerBookingStore` | `stores/washerBookingStore.ts` | No | — |
| `washerEarningsStore` | `stores/washerEarningsStore.ts` | No | — |
| `staffTasksStore` | `stores/staffTasksStore.ts` | No | — |
| `uiStore` | `stores/uiStore.ts` | No | — |
| `notificationStore` | `stores/notificationStore.ts` | No | — |
| `tourStore` | `stores/tourStore.ts` | No | — |

### Auth Bootstrap Sequence

```
App launch
  └─ useAuthBootstrap()
       ├─ initAuthListener()       ← Firebase onAuthStateChanged
       ├─ AsyncStorage rehydrate   ← Zustand persist middleware
       └─ fetchSession()           ← me query + branchMemberships
            ├─ MERCHANT: loadMerchant(merchantId)
            └─ STAFF: fetch branchIds + register device
```

---

## 5. GraphQL API Contract

### Endpoint

```
POST {apiBaseUrl}/graphql
Content-Type: application/json
Authorization: Bearer <firebaseIdToken>
x-device-token: <deviceToken>     ← STAFF only
```

### Request / Response Shape

```json
// Request
{ "query": "query { me { _id email } }", "variables": {} }

// Success
{ "data": { "me": { "_id": "...", "email": "..." } } }

// Error
{ "errors": [{ "message": "Unauthorized", "extensions": { "code": "UNAUTHENTICATED" } }] }
```

### Services → GraphQL Operations Map

#### Auth & Users (`services/graphql/auth.ts`)

| Function | Operation | Input | Output |
|----------|-----------|-------|--------|
| `fetchRoles()` | `query roles` | — | `GqlRole[]` |
| `resolveRoleId(name)` | `query roles` | role name | ObjectId |
| `fetchMe()` | `query me` | — | `GqlUser \| null` |
| `registerUser(input)` | `mutation registerUser` | firstName, lastName, phoneNumber, role | `GqlUser` |
| `gqlUpdateUser(input)` | `mutation updateUser` | firstName?, lastName?, phoneNumber? | `GqlUser` |

#### Branches (`services/graphql/branches.ts`)

| Function | Operation | Notes |
|----------|-----------|-------|
| `fetchMyBranches(includeArchived?)` | `query myBranches` | Returns merchant's branches |
| `gqlCreateBranch(name, address, phone)` | `mutation createBranch` | Auto-sets 08:00–20:00 hours |
| `gqlUpdateBranch(id, patch)` | `mutation updateBranch` | name, phone, operatingHours |
| `gqlArchiveBranch(id)` | `mutation archiveBranch` | Soft delete |
| `gqlRestoreBranch(id)` | `mutation restoreBranch` | Unarchive |

#### Orders (`services/graphql/orders.ts`)

| Function | Operation | Notes |
|----------|-----------|-------|
| `gqlMyOrders(filter?)` | `query myOrders` | branchId, status, days, limit, offset |
| `gqlCreateOrder(input)` | `mutation createOrder` | POS order creation |
| `gqlAdvanceOrderStatus(id)` | `mutation advanceOrderStatus` | Moves to next status in flow |
| `gqlCancelOrder(id, reason, note?)` | `mutation cancelOrder` | — |
| `gqlClaimOrder(id, claimCode)` | `mutation claimOrder` | Terminal status |

**Status mapping (BE → FE):**

| Backend value | FE `POSStatus` |
|---------------|---------------|
| `"pending"` | `"CREATED"` |
| `"in_progress"` | `"PROCESSING"` |
| `"ready"` | `"READY_FOR_PICKUP"` |
| `"claimed"` | `"CLAIMED"` |

#### Inventory (`services/graphql/inventory.ts`)

| Function | Operation | Notes |
|----------|-----------|-------|
| `gqlMyInventory(filter?)` | `query myInventory` | branchId, isArchived, limit |
| `gqlCreateProduct(input)` | `mutation createProduct` | name, unit, stockQty, reorderLevel, cost |
| `gqlUpdateProduct(id, patch)` | `mutation updateProduct` | — |
| `gqlRestockProduct(id, qty, note?)` | `mutation restockProduct` | Adds to stock |
| `gqlAdjustStock(id, delta, reason?)` | `mutation adjustStock` | Signed delta |
| `gqlArchiveProduct(id)` | `mutation archiveProduct` | Soft delete |
| `gqlRestoreProduct(id)` | `mutation restoreProduct` | — |

#### Laundry Services (`services/graphql/laundryServices.ts`)

| Function | Operation |
|----------|-----------|
| `gqlMyServices(filter?)` | `query myServices` |
| `gqlCreateService(input)` | `mutation createService` |
| `gqlUpdateService(id, patch)` | `mutation updateService` |
| `gqlArchiveService(id)` | `mutation archiveService` |
| `gqlRestoreService(id)` | `mutation restoreService` |

#### Staff (`services/graphql/staff.ts`)

| Function | Operation |
|----------|-----------|
| `fetchMyStaff(branchId?)` | `query myStaff` |
| `gqlCreateStaff(input)` | `mutation createStaff` |
| `gqlUpdateStaff(id, patch)` | `mutation updateStaff` |
| `gqlArchiveStaff(id)` | `mutation archiveStaff` |
| `gqlGenerateStaffResetLink(id)` | `mutation generateStaffResetLink` |

#### Devices (`services/graphql/devices.ts`)

| Function | Operation |
|----------|-----------|
| `gqlMyDevices()` | `query myDevices` |
| `gqlRegisterDevice(name, os)` | `mutation registerDevice` |
| `gqlDeactivateDevice(id)` | `mutation deactivateDevice` |
| `gqlReactivateDevice(id)` | `mutation reactivateDevice` |

Device registration uses a stable UUID stored in AsyncStorage (FCM token not yet configured; UUID used as placeholder).

#### Tasks (`services/graphql/tasks.ts`)

| Function | Operation |
|----------|-----------|
| `gqlMyTasks(filter?)` | `query myTasks` |
| `gqlCreateTask(input)` | `mutation createTask` |
| `gqlUpdateTask(id, patch)` | `mutation updateTask` |
| `gqlCompleteTask(id, completedBy, note?, photoUri?)` | `mutation completeTask` |
| `gqlDeleteTask(id)` | `mutation deleteTask` |

#### Activity Logs (`services/graphql/activityLogs.ts`)

| Function | Operation |
|----------|-----------|
| `gqlMyActivityLogs(filter?)` | `query myActivityLogs` |
| `gqlLogActivity(input)` | `mutation logActivity` |

#### Washer (`services/graphql/washer.ts`)

| Function | Operation |
|----------|-----------|
| `fetchWasherProfile()` | `query washerProfile` |
| `gqlToggleWasherAvailability()` | `mutation toggleWasherAvailability` |
| `gqlUpdateWasherProfile(fields)` | `mutation updateWasherProfile` |
| `fetchWasherStats()` | `query washerStats` |
| `fetchTodayBookings()` | `query myTodayBookings` |
| `fetchBookingHistory(limit?)` | `query myBookingHistory` |
| `gqlUpdateBookingStatus(id, status, reason?)` | `mutation updateBookingStatus` |
| `fetchWasherEarnings()` | `query washerEarnings` |
| `gqlRequestWithdrawal(earningIds, ref)` | `mutation requestWithdrawal` |

---

## 6. Backend Expectations

### Required GraphQL Schema Domains

The FE expects the NestJS GraphQL backend to expose the following types and resolvers:

#### Users & Roles

```graphql
type Role {
  _id: ID!
  roleId: String!
  roleName: String!    # "MERCHANT" | "STAFF" | "WASHER" | "ADMIN"
}

type User {
  _id: ID!
  email: String!
  firstName: String!
  lastName: String!
  phoneNumber: String!
  role: Role!
  branchIds: [String]  # Staff: list of branch IDs they belong to
  merchantId: String   # Merchant: their own merchant document ID
  isActive: Boolean!
  isArchived: Boolean
}

type Query {
  me: User
  roles: [Role!]!
}

type Mutation {
  registerUser(input: RegisterUserInput!): User!
  updateUser(input: UpdateUserInput!): User!
}
```

#### Branches

```graphql
type OperatingHoursSlot {
  open: String!    # "08:00"
  close: String!   # "20:00"
}

type DaySchedule {
  isOpen: Boolean!
  slots: [OperatingHoursSlot!]!
}

type OperatingHours {
  monday: DaySchedule!
  tuesday: DaySchedule!
  wednesday: DaySchedule!
  thursday: DaySchedule!
  friday: DaySchedule!
  saturday: DaySchedule!
  sunday: DaySchedule!
}

type StructuredAddress {
  street: String
  barangay: String
  city: String
  province: String
  region: String
}

type BranchMapLocation {
  latitude: Float!
  longitude: Float!
}

type Branch {
  _id: ID!
  uid: String!          # owner user ID
  name: String!
  address: StructuredAddress
  phone: String
  isActive: Boolean!
  isOnline: Boolean!
  operatingHours: OperatingHours
  branchMapLocation: BranchMapLocation
  gcashQrUrl: String
  gcashNumber: String
  receiptHeader: String
  receiptFooter: String
  claimCodePrefix: String
  slotDurationMinutes: Int
  maxConcurrentOrders: Int
  merchantType: String  # "LAUNDROMAT" | "HOME_WASHER" | "DRY_CLEANING" | "SELF_SERVICE"
  createdAt: String
  updatedAt: String
}

type Query {
  myBranches(includeArchived: Boolean): [Branch!]!
}

type Mutation {
  createBranch(input: CreateBranchInput!): Branch!
  updateBranch(id: ID!, input: UpdateBranchInput!): Branch!
  archiveBranch(id: ID!): Branch!
  restoreBranch(id: ID!): Branch!
}
```

#### Orders (POS)

```graphql
type OrderItem {
  serviceId: ID!
  serviceName: String!
  weightKg: Float!
  unitPrice: Float!
  lineTotal: Float!
}

type Order {
  _id: ID!
  merchantId: String!
  branchId: String!
  staffId: String!
  orderSource: String!     # "POS"
  status: String!          # "pending" | "in_progress" | "ready" | "claimed"
  walkinCustomer: WalkinCustomer
  items: [OrderItem!]!
  subtotal: Float!
  discountAmount: Float!
  discountCode: String
  totalAmount: Float!
  paymentMethod: String!   # "CASH" | "GCASH"
  amountReceived: Float!
  changeGiven: Float!
  claimCode: String!
  notes: String
  estimatedReadyAt: String
  createdAt: String!
  claimedAt: String
}

type Query {
  myOrders(filter: OrderFilterInput): [Order!]!
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
  advanceOrderStatus(id: ID!): Order!
  cancelOrder(id: ID!, reason: String!, note: String): Order!
  claimOrder(id: ID!, claimCode: String!): Order!
}
```

#### Inventory

```graphql
type Product {
  _id: ID!
  uid: String!          # merchant user ID
  branchId: String!
  name: String!
  unit: String!         # "kg" | "L" | "pcs" | "g" | "ml" | "bottle" | "sachet"
  category: String
  stockQuantity: Float!
  reorderLevel: Float!
  costPerUnit: Float!
  isActive: Boolean!
  isArchived: Boolean!
  archivedAt: String
  createdAt: String
  updatedAt: String
}

type Query {
  myInventory(filter: InventoryFilterInput): [Product!]!
}

type Mutation {
  createProduct(input: CreateProductInput!): Product!
  updateProduct(id: ID!, input: UpdateProductInput!): Product!
  restockProduct(id: ID!, quantity: Float!, note: String): Product!
  adjustStock(id: ID!, delta: Float!, reason: String): Product!
  archiveProduct(id: ID!): Boolean!
  restoreProduct(id: ID!): Boolean!
}
```

#### Laundry Services

```graphql
type Service {
  _id: ID!
  uid: String!
  branchId: [String]
  name: String!
  price: Float!
  unit: String!
  category: String
  isFeatured: Boolean!
  isActive: Boolean!
  isArchived: Boolean!
  createdAt: String
  updatedAt: String
}

type Query {
  myServices(filter: ServiceFilterInput): [Service!]!
  service(id: ID!): Service
}

type Mutation {
  createService(input: CreateServiceInput!): Service!
  updateService(id: ID!, input: UpdateServiceInput!): Service!
  archiveService(id: ID!): Boolean!
  restoreService(id: ID!): Boolean!
  deleteService(id: ID!): Boolean!
}
```

#### Staff

```graphql
type StaffMember {
  _id: ID!
  firstName: String!
  lastName: String!
  email: String!
  phoneNumber: String
  branchIds: [String!]!
  isActive: Boolean!
  isArchived: Boolean!
  createdAt: String
}

type Query {
  myStaff(branchId: String): [StaffMember!]!
}

type Mutation {
  createStaff(input: CreateStaffInput!): StaffMember!
  updateStaff(id: ID!, input: UpdateStaffInput!): StaffMember!
  archiveStaff(id: ID!): Boolean!
  restoreStaff(id: ID!): Boolean!
  generateStaffResetLink(id: ID!): String!
}
```

#### Devices

```graphql
type RegisteredDevice {
  _id: ID!
  userId: String!
  deviceId: String!      # stable UUID stored on device
  name: String!
  os: String!            # "android" | "ios"
  fcmToken: String
  isActive: Boolean!
  createdAt: String
}

type Query {
  myDevices: [RegisteredDevice!]!
}

type Mutation {
  registerDevice(name: String!, os: String!, fcmToken: String): RegisteredDevice!
  deactivateDevice(id: ID!): Boolean!
  reactivateDevice(id: ID!): Boolean!
  deleteDevice(id: ID!): Boolean!
}
```

#### Tasks

```graphql
type Task {
  _id: ID!
  uid: String!
  branchId: String
  title: String!
  description: String
  assignedToId: String
  assignedToName: String
  priority: String!       # "low" | "medium" | "high"
  category: String
  dueDate: String
  isCompleted: Boolean!
  completedBy: String
  completedAt: String
  noteText: String
  photoUri: String
  isVisibleToStaff: Boolean!
  createdAt: String
  updatedAt: String
}

type Query {
  myTasks(filter: TaskFilterInput): [Task!]!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
  updateTask(id: ID!, input: UpdateTaskInput!): Task!
  completeTask(id: ID!, completedBy: String!, noteText: String, photoUri: String): Task!
  deleteTask(id: ID!): Boolean!
}
```

#### Activity Logs

```graphql
type ActivityLog {
  _id: ID!
  actorId: String!
  actorName: String!
  action: String!
  entityType: String!
  entityId: String
  entityName: String
  metadata: JSON
  createdAt: String!
}

type Query {
  myActivityLogs(limit: Int, offset: Int): [ActivityLog!]!
}

type Mutation {
  logActivity(input: LogActivityInput!): Boolean!
}
```

#### Washer (optional domain)

```graphql
type WasherProfile {
  washerId: ID!
  userId: String!
  displayName: String!
  phone: String!
  photoUrl: String
  machineType: String!    # "FRONT_LOAD" | "TOP_LOAD"
  machineCapacityKg: Int!
  barangay: String!
  city: String!
  serviceRadiusKm: Float!
  pricePerKg: Float!
  platformFeePercent: Float!
  services: [WasherService!]!
  status: String!         # "PENDING_CERT" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED"
  isAvailable: Boolean!
  slotsUsedToday: Int!
  createdAt: String
  updatedAt: String
}

type WasherBooking {
  bookingId: ID!
  washerId: String!
  customerId: String!
  customerName: String!
  customerPhone: String!
  bookingDate: String!
  slotNumber: Int!        # 1 | 2 | 3
  items: [WasherBookingItem!]!
  totalWeightKg: Float!
  totalAmount: Float!
  platformFee: Float!
  washerPayout: Float!
  status: String!         # "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  pickupAddress: String!
  deliveryAddress: String!
  confirmedAt: String
  startedAt: String
  completedAt: String
  cancelledAt: String
  createdAt: String
}

type WasherEarning {
  earningId: ID!
  washerId: String!
  bookingId: String!
  amount: Float!
  status: String!     # "PENDING" | "RELEASED" | "WITHDRAWN"
  createdAt: String
}

type WasherDashboardStats {
  totalBookings: Int!
  completedToday: Int!
  pendingToday: Int!
  totalEarnings: Float!
}

type Query {
  washerProfile: WasherProfile
  washerStats: WasherDashboardStats
  myTodayBookings: [WasherBooking!]!
  myBookingHistory(limit: Int): [WasherBooking!]!
  washerEarnings: WasherEarningsResponse!
}

type Mutation {
  toggleWasherAvailability: WasherProfile!
  updateWasherProfile(input: UpdateWasherProfileInput!): WasherProfile!
  updateBookingStatus(bookingId: ID!, status: String!, reason: String): WasherBooking!
  requestWithdrawal(earningIds: [ID!]!, withdrawalRef: String!): Boolean!
}
```

---

## 7. Authentication & Authorization

### Firebase Authentication

Firebase is used **only for identity tokens**. Business data lives in MongoDB via the NestJS backend.

**Sign-in flow:**
1. FE calls Firebase `signInWithEmailAndPassword`
2. Firebase returns an `IdToken` (JWT, valid ~1 hour, auto-refreshed by SDK)
3. FE attaches token to every GraphQL request: `Authorization: Bearer <idToken>`
4. Backend verifies token with Firebase Admin SDK → extracts `uid` → maps to MongoDB user

### Staff Device Token

Staff members require an additional device-level approval:

```
Staff signs in
  └─ FE calls gqlRegisterDevice(name, os)
       └─ Backend creates device with isActive: false
            └─ Merchant approves device in dashboard
                 └─ Backend sets isActive: true
                      └─ FE includes x-device-token: <deviceId> in all requests
```

The `deviceId` is a stable UUID generated once and stored in AsyncStorage via `src/utils/deviceId.ts`. It is NOT an FCM push token (FCM not yet configured; UUID used as placeholder).

### RBAC on the Backend

The backend guards resolvers by role. The `me` query returns the user's `role.roleName`:

| Role | Access |
|------|--------|
| `MERCHANT` | All branch/order/staff/service/inventory operations for their `merchantId` |
| `STAFF` | POS creation, order status advances, inventory read, tasks (filtered by `isVisibleToStaff`) |
| `WASHER` | Washer profile, bookings, earnings |
| `ADMIN` | System-wide access |

---

## 8. Domain Data Schemas

### POS Order Flow

```
CREATED → PROCESSING → READY_FOR_PICKUP → CLAIMED
                ↓
            CANCELLED  (any stage before CLAIMED)
```

### POSOrder (FE type — `src/types/pos.types.ts`)

```typescript
interface POSOrder {
  id: string;
  merchantId: string;
  branchId: string;
  staffId: string;
  orderSource: "POS";
  status: "CREATED" | "PROCESSING" | "READY_FOR_PICKUP" | "CLAIMED";
  walkinCustomer?: {
    name?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  items: Array<{
    serviceId: string;
    serviceName: string;
    weightKg: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  discountCode?: string;
  totalAmount: number;
  paymentMethod: "CASH" | "GCASH";
  amountReceived: number;
  changeGiven: number;
  claimCode: string;
  notes?: string;
  estimatedReadyAt?: string;
  createdAt: { seconds: number; nanoseconds: number };
  claimedAt?: { seconds: number; nanoseconds: number };
}
```

### Branch (FE type)

```typescript
interface Branch {
  id: string;
  uid: string;
  name: string;
  address: string;          // flattened from structured BE address
  phone: string;
  isActive: boolean;
  isOnline: boolean;
  branchMapLocation?: { latitude: number; longitude: number };
  operatingHours?: OperatingHours;
  gcashQrUrl?: string | null;
  gcashNumber?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  claimCodePrefix?: string;
  slotDurationMinutes?: number;
  maxConcurrentOrders?: number;
  merchantType?: "LAUNDROMAT" | "HOME_WASHER" | "DRY_CLEANING" | "SELF_SERVICE";
}
```

### Product (FE type)

```typescript
interface Product {
  _id: string;
  uid: string;
  branchId: string;
  name: string;
  unit: "kg" | "L" | "pcs" | "g" | "ml" | "bottle" | "sachet";
  category?: string;
  stockQuantity: number;
  reorderLevel: number;
  costPerUnit: number;
  isActive: boolean;
  isArchived: boolean;
}
```

### GqlUser (FE type)

```typescript
interface GqlUser {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: { _id: string; roleId: string; roleName: string };
  branchIds: string[] | null;
  merchantId: string | null;
  isActive: boolean;
  isArchived: boolean | null;
}
```

### Task (FE type)

```typescript
interface GqlTask {
  _id: string;
  uid: string;
  branchId?: string;
  title: string;
  description?: string;
  assignedToId?: string;
  assignedToName?: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  isCompleted: boolean;
  completedBy?: string;
  completedAt?: string;
  noteText?: string;
  photoUri?: string;
  isVisibleToStaff: boolean;
}
```

---

*Last updated: 2026-06-18*
