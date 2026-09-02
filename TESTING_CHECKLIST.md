# LALABA Merchant App — Full Testing Checklist

> Last updated: 2026-06-27
> FE Jest: 788 tests passing across 30 suites
> BE Jest: 64 tests passing across 3 suites (tasks integration + pos-orders unit)
> Maestro 2.6.1: installed, 6 flow files written (p0_login, p0_pos_checkout, p0_order_claiming, p1_staff_login, p1_branch_selection, _helpers/login)
> Total test cases: 335 | 38 added from gap analysis (🆕) | Section 25 Washer Module added

---

## Priority Legend

| Badge | Level | Description |
|---|---|---|
| 🔴 P0 | Blocker | Login, Google OAuth, POS Checkout, Order Claiming, Queue |
| 🟠 P1 | Critical | Branch, Services, Staff, Devices, POS Void, Washer Module |
| 🟡 P2 | Important | Inventory, Costing, Tasks, Permissions, Cross-Cutting |
| 🟢 P3 | Nice to Have | Order History, Reports, Print Settings, Audit Logs |

---

## Legend

| Tag | Tool | When to run |
|---|---|---|
| `[Jest ✅]` | Jest — already covered | `npm test` |
| `[Jest 🆕]` | Jest — added this session | `npm test` |
| `[RTL]` | `@testing-library/react-native` — component render | `npm test` |
| `[Maestro]` | E2E on real device / emulator | `maestro test .maestro/` |
| `[BE-Jest]` | NestJS + `mongodb-memory-server` on backend | `npm test` in `LALABA_BE_DEV` |
| `[Manual]` | Requires human, physical device, or external service | Manual QA |

---

## Testing Workflow

```
Phase 1 — CI (run on every commit)
  1a. FE Jest  — npm test in LALABA_MERCHANT_APP_DEV (788 tests)
  1b. BE-Jest  — npm test in LALABA_BE_DEV (64 tests)

Phase 2 — E2E (Maestro, per release)
  2a. P0 flows — gate: no P0 failures before P1
  2b. P1 flows — gate: no P1 blockers before P2
  2c. P2 flows — gate: no P2 blockers before P3
  2d. P3 flows — document; non-blocker

Phase 3 — Manual (per release)
  3a. Google OAuth edge cases (real device + real Google account)
  3b. GCash QR, Bluetooth printer, 2G simulation (real hardware)
  3c. Multi-device concurrent scenarios (2 physical devices)
  3d. Device revocation & pending screen auto-poll
  3e. Washer: requestWithdrawal end-to-end (real payout account)

Phase 4 — Regression Gate
  ✅ All P0: Pass              — required to ship
  ✅ All P1: Pass or workaround — required to ship
  🔶 P2/P3 failures: log in bug tracker — ship with known issues
```

---

## Tools Overview

### Currently Set Up
- **Jest** (`npm test`) — logic, store calculations, data transforms, guards. Runs in Node.js, no device needed.
- **jest-expo** — Jest preset for React Native / Expo environment.
- **`@testing-library/react-native`** v13.3.3 — renders RN components, fires events, asserts output. No device needed. ✅
- **Maestro** v2.6.1 — E2E UI automation on real device/emulator. `maestro test .maestro/`. ✅ Installed
- **`@nestjs/testing` + `mongodb-memory-server`** — BE integration tests with real in-memory MongoDB. `npm test` in `LALABA_BE_DEV`. ✅

### To Add — Quality
- **GraphQL Inspector** — validates FE queries against BE `schema.gql` statically. Catches field mismatches before runtime.
- **SonarCloud** — code quality, security vulnerabilities, duplication, coverage gate. Free for GitHub repos.

### CI/CD
- **GitHub Actions** — runs type-check, lint, test, and schema validation on every PR automatically.

---

## Tools to Avoid

| Tool | Reason |
|---|---|
| Cypress / Playwright | Web browser only — LALABA is mobile |
| Selenium / WebDriver | Web browser only |
| `@testing-library/react` | DOM-based web version — use RN version instead |
| `@testing-library/jest-dom` | DOM matchers — use `@testing-library/jest-native` instead |
| Enzyme | Dead — incompatible with React 19 |
| Vitest | Designed for Vite — LALABA uses Metro bundler |
| `testEnvironment: "jsdom"` | Breaks jest-expo's RN environment |
| Webpack Bundle Analyzer | Wrong bundler — use `expo-bundle-visualizer` |
| Apollo `MockedProvider` | Requires Apollo Client — LALABA uses custom fetch |
| GraphQL Codegen (Apollo plugins) | Generates Apollo hooks — incompatible without full rewrite |
| Swagger / OpenAPI | REST only — BE is GraphQL |
| Redux / MobX | Conflicts with Zustand |
| Detox | Complex Expo setup — use Maestro instead |
| UI snapshot tests | Fragile, high maintenance, low signal |
| k6 / Artillery (now) | Premature — add MongoDB indexes first |
| Coverage % targets | Vanity metric — test meaningful logic, not lines |

---

## 1. Account Creation & Registration 🟠 P1 — Critical

### Happy Path
- [ ] Register with valid email + strong password `[Maestro]`
- [ ] Display name saves correctly `[Maestro]`
- [ ] Role selection works (Merchant) `[RTL]`
- [ ] Account created → redirected to onboarding `[Maestro]`
- [ ] Firebase Auth token issued and stored `[Manual]`

### Edge Cases
- [x] Duplicate email → clear error message shown (not crash) `[RTL ✅]`
- [x] Weak password (< 6 chars) → validation error before submit `[RTL ✅]`
- [x] No display name → field validation fires `[RTL ✅]`
- [ ] Network offline during registration → graceful error `[Maestro]`
- [ ] Submit button tapped twice rapidly → no double-account created `[Maestro]`
- [ ] Email with trailing/leading spaces → trimmed or rejected cleanly `[RTL]`
- [x] Very long display name (100+ chars) → UI doesn't overflow `[RTL ✅]`

---

## 2. Google OAuth — Register & Sign In 🔴 P0 — Blocker

### Happy Path
- [ ] Register with Google → account created, display name pre-filled `[Manual]`
- [ ] Sign in with Google on existing Google-registered account `[Manual]`
- [ ] Google sign-in → redirected to correct role stack `[Maestro]`
- [ ] Google auth token persists after app background/foreground `[Manual]`
- [ ] Auto-login on app restart after Google sign-in `[Maestro]`
- [ ] Re-sign-in after session expiry → re-auth prompt shown correctly `[Manual]`

### Edge Cases
- [ ] Google email matches existing email/password account → merge, conflict, or clear error `[Manual]`
- [ ] User cancels Google sign-in mid-flow → no stuck spinner, no partial account `[Maestro]`
- [ ] Google profile has no display name → fallback shown, not crash `[RTL]`
- [ ] Network drops during Google OAuth redirect → graceful recovery `[Manual]`
- [ ] Sign in on different device → device pending or works directly `[Manual]`
- [ ] Google auth token expires mid-session → re-auth prompt, not silent failure `[Maestro]`
- [ ] Sign out after Google login → Google session also cleared `[Manual]`

---

## 3. Login / Sign In 🔴 P0 — Blocker

### Happy Path
- [ ] Login with correct email + password `[Maestro]`
- [ ] Redirected to correct role stack (Merchant → `/(tabs)/`, Staff → `/(staff)/`) `[Maestro]`
- [ ] Auth token persists after app background/foreground `[Manual]`
- [ ] Auto-login on app restart (token rehydrated from AsyncStorage) `[Maestro]`

### Edge Cases
- [x] Wrong password → error message, not crash `[RTL ✅]`
- [x] Non-existent email → error message `[RTL ✅]`
- [x] Network offline → error, not infinite spinner `[RTL ✅]`
- [ ] Session expired → re-prompted to login, not silent failure `[Maestro]`
- [x] Back button from login while loading → no stuck spinner `[RTL ✅]`
- [ ] Very fast login then background app → session still valid on return `[Maestro]`

---

## 4. Onboarding — Merchant & First Branch Setup 🟠 P1 — Critical

### Happy Path
- [ ] Business name, type, address all save correctly `[Maestro]`
- [ ] First branch created → merchant routed to main tabs `[Maestro]`
- [ ] Merchant type label (LAUNDROMAT) appears correctly everywhere `[RTL]`

### Edge Cases
- [ ] Skip branch setup midway → app doesn't crash on return `[Maestro]`
- [ ] Branch name with special characters (e.g. José's Laundry #1) → saves correctly `[BE-Jest]`
- [ ] Very long business address → no UI overflow `[RTL]`
- [ ] Onboarding completed with no phone number → optional field handled `[RTL]`
- [ ] Network drops mid-onboarding → form data preserved, retry works `[Maestro]`

---

## 5. Branch Management 🟠 P1 — Critical

### Happy Path
- [ ] Add new branch with name, address, phone, GCash QR `[Maestro]`
- [ ] Edit existing branch → changes reflect immediately `[Maestro]`
- [ ] Archive branch → removed from active list, shows in archived `[Maestro]`
- [ ] Reactivate archived branch → returns to active list `[Maestro]`
- [ ] Multiple branches visible in branch picker screens `[RTL]`
- [ ] Single-branch owners skip branch picker (auto-select) `[RTL]`

### Edge Cases
- [ ] Add branch with duplicate name → allowed or warned `[BE-Jest]`
- [ ] Archive the only active branch → what happens to active POS session? `[Maestro]`
- [ ] GCash QR upload with large image file → compressed or rejected gracefully `[Manual]`
- [ ] Branch name with emojis → displays correctly in all list views `[RTL]`
- [ ] Edit branch while another device is using it → no data race `[Manual]`

---

## 6. Operating Hours 🟡 P2 — Important

### Happy Path
- [ ] Set open/close times per day of week `[Maestro]`
- [ ] Mark a day as closed `[RTL]`
- [ ] Changes save to backend `[Maestro]`
- [ ] Hours display correctly on branch overview `[RTL]`

### Edge Cases
- [ ] Set close time before open time → validation error `[RTL]`
- [ ] Set midnight-crossing hours (e.g. 10pm–2am) → handled correctly `[BE-Jest]`
- [ ] All 7 days marked closed → no crash `[RTL]`
- [ ] Rapid toggle of open/close → no save race condition `[Maestro]`
- [ ] Offline save attempt → error shown, data not silently lost `[RTL]`

---

## 7. Services Management 🟠 P1 — Critical

### Happy Path
- [ ] Add new service with name, price, duration `[Maestro]`
- [ ] Add product (Product type) with name, price `[Maestro]`
- [ ] Add add-on with name, price `[Maestro]`
- [ ] Edit existing service → changes appear in list `[Maestro]`
- [ ] Archive / restore service `[Maestro]`
- [ ] Services appear in POS terminal for ordering `[Maestro]`
- [ ] Editing service pre-populates inventory rows `[RTL]`
- [ ] pricingType enum mapping (per kg → PER_KILO) `[Jest ✅]`
- [ ] Category enum mapping (Wash → WASH_AND_FOLD) `[Jest ✅]`
- [ ] Enum round-trips (FE → BE wire → FE) `[Jest ✅]`
- [ ] Unknown enum value falls back to default `[Jest ✅]`
- [ ] defaultProducts sent on create and update `[Jest ✅]`

### Edge Cases
- [ ] Service with ₱0 price → allowed or warns user `[RTL]`
- [ ] Very long service name (80+ chars) → truncates cleanly `[RTL]`
- [ ] 50+ services → list scrolls correctly `[RTL]`
- [ ] Duplicate service name in same branch → allowed or warned `[BE-Jest]`
- [ ] Decimal price (e.g. ₱149.99) → stored and displayed correctly `[BE-Jest]`
- [ ] Archive service in active POS order → order not broken `[BE-Jest]`
- [ ] Filter by Status + Type simultaneously → correct results `[RTL]`

---

## 8. Inventory — Stock Items 🟡 P2 — Important

### Happy Path
- [ ] Add stock item (name, unit, quantity, reorder threshold) `[Maestro]`
- [ ] Restock → quantity increases, log shows Restock `[Maestro]`
- [ ] Adjust (positive and negative) → log shows Adjust `[Maestro]`
- [ ] Damage → quantity decreases, log shows Damage `[Maestro]`
- [ ] Return → quantity increases, log shows Return `[Maestro]`
- [ ] Edit item → changes save correctly `[Maestro]`
- [ ] Delete item → removed from list `[Maestro]`
- [ ] 50+ items → "Load more (X of Y)" appears and loads next page `[Jest 🆕]`
- [ ] Low stock badge below threshold `[Jest 🆕]`
- [ ] Product AT threshold triggers badge (uses <=, not <) `[Jest 🆕]`
- [ ] Product above threshold → no badge `[Jest 🆕]`
- [ ] Log product name correctly looked up from products list `[Jest 🆕]`
- [ ] Log stores all 5 transaction types `[Jest 🆕]`
- [ ] createdAt ISO string → seconds conversion `[Jest 🆕]`

### Edge Cases
- [ ] Add item with no unit → defaults gracefully 🆕 `[RTL]`
- [ ] Restock by 0 → nothing changes `[BE-Jest]`
- [ ] Adjust to negative quantity → blocked or warned `[BE-Jest]`
- [ ] Damage more than available quantity → blocked or warned `[BE-Jest]`
- [ ] threshold=0, quantity=0 → badge shows (0 <= 0) `[Jest 🆕]`
- [ ] threshold=0, quantity>0 → no badge `[Jest 🆕]`
- [ ] Very high quantity (999,999) → no display overflow `[RTL]`
- [ ] Delete item linked to service costing → handled gracefully `[BE-Jest]`
- [ ] Log type labels: Restock / Used / Return / Adjust / Damage (not raw enums) `[RTL]`
- [ ] Unknown product in log → shows "Unknown", no crash `[Jest 🆕]`
- [ ] Load more guard: all loaded → no re-fetch `[Jest 🆕]`
- [ ] Load more guard: already loading → no duplicate fetch `[Jest 🆕]`
- [ ] fetchLogs network failure → empty logs, no crash thrown `[Jest 🆕]`
- [ ] Restock fails → error set, isLoading cleared `[Jest 🆕]`
- [ ] Damage fails → error set, isLoading cleared `[Jest 🆕]`
- [ ] Adjust fails → error set, isLoading cleared `[Jest 🆕]`
- [ ] Create fails → error set, isLoading cleared, error thrown to caller `[Jest 🆕]`

---

## 9. Inventory — Sellable Products 🟡 P2 — Important

### Happy Path
- [ ] Add sellable product linked to stock item `[Maestro]`
- [ ] Product appears in POS product list `[RTL]`
- [ ] Sell product via POS → stock quantity decrements `[BE-Jest]`

### Edge Cases
- [ ] Add sellable product with no linked stock item → still works `[BE-Jest]`
- [ ] Stock item reaches 0 → orderable or blocked in POS `[BE-Jest]`
- [ ] Edit product price → reflects in POS immediately `[Maestro]`
- [ ] Delete product in open order → order not broken `[BE-Jest]`

---

## 10. Daily Costing 🟡 P2 — Important

### Happy Path
- [ ] Select branch → costing form loads `[Maestro]`
- [ ] Enter utility costs (electricity, water, gas) `[Maestro]`
- [ ] Enter overhead costs (rent, salaries) `[Maestro]`
- [ ] Enter per-item costs linked to services 🆕 `[Maestro]`
- [ ] Save costing entry → appears in history `[Maestro]`
- [ ] View previous day's costing `[Maestro]`

### Edge Cases
- [ ] Enter ₱0 for all fields → saves, appears as ₱0 `[BE-Jest]`
- [ ] Enter negative cost → blocked or warned `[RTL]`
- [ ] Very large cost value (₱9,999,999) → no number formatting overflow `[RTL]`
- [ ] Save costing twice for same date → overwrite or duplicate `[BE-Jest]`
- [ ] Offline save attempt → data not silently lost `[RTL]`
- [ ] Single-branch owner: picker skipped, loads immediately `[RTL]`

---

## 11. Tasks Management 🟡 P2 — Important

### Happy Path
- [ ] Create task with name, category, schedule `[Maestro]`
- [ ] Assign to everyone / owner / specific staff `[Maestro]`
- [ ] Task appears in staff task list `[Maestro]`
- [ ] Staff marks task complete `[Maestro]`
- [ ] Optional completion note added `[Maestro]`
- [ ] Optional photo proof attached `[Manual]`
- [ ] Completed tasks show in history `[Maestro]`
- [ ] Edit task → changes reflect `[Maestro]`
- [ ] Delete task → removed `[Maestro]`
- [ ] Reassign task from one staff to another → new assignee sees immediately `[Maestro]`
- [ ] Reassign task from one branch to another → correct visibility `[Maestro]`
- [ ] Reassign task from 'everyone' to specific person → scoped correctly `[Maestro]`

### Edge Cases
- [ ] Create task with no assignees → still creates `[BE-Jest]`
- [ ] One-time task completed → disappears from active list `[Maestro]`
- [ ] Daily task on day it was created → shows immediately 🆕 `[Maestro]`
- [ ] Assign task to archived staff → blocked or warned `[BE-Jest]`
- [ ] Reassign In Progress task → status resets or continues `[Maestro]`
- [ ] Photo proof upload fails → graceful error `[Manual]`
- [ ] Very long description → no UI overflow `[RTL]`
- [ ] Complete task while offline → queued or error shown `[Maestro]`

---

## 12. Staff Management 🟠 P1 — Critical

### Happy Path
- [ ] Add staff with email, name, role `[Maestro]`
- [ ] Staff receives invite / can log in 🆕 `[Maestro]`
- [ ] Staff appears with correct role badge `[RTL]`
- [ ] Archive / restore staff `[Maestro]`
- [ ] Change staff role → permissions update immediately `[Maestro]`

### Edge Cases
- [ ] Add staff with non-existent email → clear error `[RTL]`
- [ ] Add staff who already has a merchant account `[Manual]`
- [ ] Add duplicate staff email for same branch → blocked `[BE-Jest]`
- [ ] Archive yourself (owner) → blocked `[BE-Jest]`
- [ ] Add staff to branch they're already in → duplicate check `[BE-Jest]`
- [ ] Branch has 0 staff → empty state correct `[RTL]`
- [ ] Long staff name → truncated in sidebar subtitle `[RTL]`
- [ ] Archive staff with assigned tasks → tasks not orphaned `[BE-Jest]`

---

## 13. Staff App Experience 🟠 P1 — Critical

### Happy Path — Cashier
- [ ] Login as Cashier → lands on `/(staff)/`, not merchant tabs `[Maestro]`
- [ ] Cashier sees correct tabs only (POS + Order Queue) `[RTL]`
- [ ] Cashier can build and submit an order `[Maestro]`
- [ ] Cashier can advance order status in queue `[Maestro]`
- [ ] Cashier sees only their branch's data `[BE-Jest]`
- [ ] Cashier sees only tasks assigned to them `[BE-Jest]`
- [ ] Cashier can mark their tasks complete 🆕 `[Maestro]`

### Happy Path — Manager
- [ ] Login as Manager → correct tabs visible `[Maestro]`
- [ ] Manager can do everything Cashier can + additional sections `[Maestro]`
- [ ] Manager can access Reports, Staff, Inventory sections 🆕 `[RTL]`
- [ ] Manager with reports permission → can view Sales; Cashier without → cannot 🆕 `[RTL]`

### Permission Enforcement
- [ ] Cashier → Reports tab hidden or blocked `[RTL]`
- [ ] Cashier → Inventory hidden or blocked `[RTL]`
- [ ] Cashier → Staff Management hidden or blocked `[RTL]`
- [ ] Cashier applies discount (if not permitted) → blocked, not crash `[RTL]`
- [ ] All permissions removed → minimal UI, not crash `[RTL]`
- [ ] Permissions changed while in-app → takes effect correctly `[Maestro]`

### Device Approval Flow (Staff Side)
- [ ] New device → "device pending" screen shown `[Maestro]`
- [ ] Pending screen shows waiting message clearly 🆕 `[RTL]`
- [ ] Pending screen auto-polls when owner approves (no manual restart) `[Maestro]`
- [ ] Owner approves → staff enters app without re-login `[Maestro]`
- [ ] Owner rejects → clear rejection message shown `[RTL]`
- [ ] Owner revokes → staff shown error or logout screen `[Maestro]`

---

## 14. Device Registration & Approval 🟠 P1 — Critical

### Happy Path
- [ ] New device appears in pending list `[Maestro]`
- [ ] Owner approves → staff gains access immediately `[Maestro]`
- [ ] Owner rejects → staff sees rejection screen `[Maestro]`

### Edge Cases
- [ ] Same staff on 2 devices simultaneously → both appear separately `[Manual]`
- [ ] Approve then revoke → staff immediately logged out `[Maestro]`
- [ ] Pending screen refreshes automatically `[Manual]`
- [ ] 20+ pending devices → list scrolls `[RTL]`
- [ ] Device name/ID is very long → truncated in list 🆕 `[RTL]`
- [ ] Network drop while approving → approval not silently lost 🆕 `[Manual]`

---

## 15. Permissions (Role Capability Matrix) 🟡 P2 — Important

### Happy Path
- [ ] View default permissions per role `[RTL]`
- [ ] Toggle permission on/off, changes save `[Maestro]`
- [ ] Changes reflect for affected staff immediately 🆕 `[Maestro]`
- [ ] Manager has more permissions than Cashier by default `[RTL]`

### Edge Cases
- [ ] Remove all permissions from Manager → system stable `[RTL]`
- [ ] Give Cashier all Manager permissions → works in-app `[Maestro]`
- [ ] Change permissions mid-session → restricted on next action `[Maestro]`
- [ ] Reset to defaults → restores expected set `[BE-Jest]`

---

## 16. POS Terminal — Building an Order 🔴 P0 — Blocker

### Happy Path
- [ ] Select service/product/add-on → added to order `[Maestro]`
- [ ] Quantity increase/decrease works `[RTL]`
- [ ] Remove item from order `[Jest ✅]`
- [ ] Enter customer name and phone `[RTL]`
- [ ] Customer name and phone sent in BE payload `[Jest 🆕]`
- [ ] Cash payment → order submitted, claim code shown `[Maestro]`
- [x] GCash → branch GCash QR displayed, reference collected `[RTL ✅]`
- [ ] Maya → reference collected, order submitted `[Maestro]`
- [ ] QPH → correct flow, reference collected `[Maestro]`
- [ ] Card → reference collected, order submitted `[Maestro]`
- [ ] All payment methods lowercased correctly to BE `[Jest 🆕]`
- [ ] Cash → amountReceived sent as amountPaid `[Jest 🆕]`
- [ ] Non-cash → totalAmount sent as amountPaid (not amountReceived) `[Jest 🆕]`
- [ ] Apply flat (₱) discount → correct deduction `[Jest ✅]`
- [ ] Flat discount → 'flat' sent to BE `[Jest 🆕]`
- [ ] Apply percent (%) discount `[RTL]`
- [ ] Percent discount → 'percentage' sent to BE `[Jest 🆕]`
- [ ] PWD discount → flat deduction + 'flat' sent to BE `[Jest 🆕]`
- [ ] Senior discount → flat deduction + 'flat' sent to BE `[Jest 🆕]`
- [ ] Submit order → claim code displayed clearly 🆕 `[Maestro]`
- [ ] Estimated ready time → ISO string in BE payload `[Jest 🆕]`
- [ ] pricingType + defaultProducts forwarded on order items `[Jest ✅]`
- [ ] included: true set on all defaultProducts `[Jest ✅]`

### Edge Cases
- [ ] Add same service twice → weight merges, not duplicate line `[Jest ✅]`
- [ ] Order total = ₱0 → checkout still works `[BE-Jest]`
- [ ] Submit with no items → blocked `[Jest ✅]`
- [ ] Submit offline → order queued for later retry `[Jest ✅]`
- [ ] Submit rapidly twice → only one order created `[Jest ✅]`
- [ ] Very long customer name → no UI overflow `[RTL]`
- [ ] Very long customer phone → no UI overflow 🆕 `[RTL]`
- [ ] Blank name/phone → undefined in payload (not empty string) `[Jest 🆕]`
- [ ] Discount > order total → ₱0 minimum `[Jest ✅]`
- [ ] No discount → discountType and discountValue undefined in payload `[Jest 🆕]`
- [ ] Stacking two discount types → allowed or only one at a time? 🆕 `[RTL]`
- [x] GCash QR shows branch number (not blank) `[RTL ✅]`
- [ ] Non-cash reference left blank → blocked before submit `[RTL]`
- [ ] Split payment → gqlProcessPayment called once per method `[Jest 🆕]`
- [ ] Split cash change calculated correctly `[Jest 🆕]`
- [ ] No cash in split → changeGiven = 0 `[Jest 🆕]`
- [ ] Remove split method `[Jest 🆕]`
- [ ] Set split amount to 0 → removes that method `[Jest 🆕]`
- [ ] No estimated time → estimatedReadyAt undefined `[Jest 🆕]`
- [ ] Re-add service after removal → defaultProducts re-attached `[Jest ✅]`
- [ ] Product item: productId set, serviceId undefined `[Jest ✅]`
- [ ] isSubmitting=true during in-flight request (UI can disable button) `[Jest ✅]`

---

## 17. POS — Void & Cancel Order 🟠 P1 — Critical

### Happy Path
- [ ] Owner/Manager voids Pending order → status → VOID `[Maestro]`
- [ ] Owner/Manager voids In Progress order → status → VOID `[Maestro]`
- [ ] Voided order excluded from revenue totals `[BE-Jest]`
- [ ] Void reason recorded and visible in order detail / audit log `[Maestro]`

### Edge Cases
- [ ] Cashier tries to void (if not permitted) → blocked, not crash `[RTL]`
- [ ] Void a CLAIMED order → blocked `[BE-Jest]`
- [ ] Void a CANCELLED order → blocked or already-voided state `[BE-Jest]`
- [ ] Void while another device views same order → no conflict `[Manual]`
- [ ] Void a GCash order → refund reference noted 🆕 `[Manual]`
- [ ] Network offline during void → error shown, order not corrupted `[Maestro]`
- [ ] Claim code entered after void → clear 'order voided' error 🆕 `[BE-Jest]`

---

## 18. Order Queue 🔴 P0 — Blocker

### Happy Path
- [ ] New order appears in queue immediately `[Maestro]`
- [ ] Status advances: Pending → In Progress → Ready → Claimed `[Maestro]`
- [ ] Staff claims order using claim code `[Maestro]`
- [ ] Order moves out of queue when claimed 🆕 `[Maestro]`
- [ ] Multiple concurrent orders visible `[Maestro]`

### Edge Cases
- [ ] 20+ orders in queue → scrolls, no crash `[RTL]`
- [ ] Two staff advance same order simultaneously → no double-advance `[Manual]`
- [ ] Network drops mid-status update → order not corrupted `[Maestro]`
- [ ] Very long customer name → truncated in queue card `[RTL]`
- [ ] Queue auto-refreshes without manual pull-to-refresh `[Manual]`
- [ ] Wrong claim code → error, order not accidentally claimed `[RTL]`

---

## 19. Order Claiming 🔴 P0 — Blocker

### Happy Path
- [ ] Correct claim code → correct order shown `[Maestro]`
- [ ] Confirm claim → status moves to Claimed `[Maestro]`
- [ ] Claimed orders leave active queue `[Maestro]`

### Edge Cases
- [ ] Already-claimed code → error message `[BE-Jest]`
- [ ] Non-existent claim code → error, no crash `[RTL]`
- [ ] Claim code case-insensitive `[BE-Jest]`
- [ ] Claim voided order → clear error `[BE-Jest]`
- [ ] Network offline during claim → error shown `[Maestro]`

---

## 20. Order History & Reprint 🟢 P3 — Nice to Have

### Happy Path
- [ ] View and filter past orders by date range `[Maestro]`
- [ ] Tap past order → full detail shown `[Maestro]`
- [ ] Reprint receipt → prints correctly `[Manual]`

### Edge Cases
- [ ] No past orders → empty state shown `[RTL]`
- [ ] Past order by archived staff → still shows correctly `[BE-Jest]`
- [ ] Reprint with no printer → graceful error `[Manual]`
- [ ] Voided order clearly labelled, not counted in totals `[RTL]`
- [ ] Very large order history → no performance issue `[RTL]`

---

## 21. Sales / Reports 🟢 P3 — Nice to Have

### Happy Path
- [ ] View daily sales and date-range summary `[Maestro]`
- [ ] Revenue total matches sum of orders `[BE-Jest]`
- [ ] Breakdown by service type visible `[RTL]`
- [ ] Export report as CSV 🆕 `[Manual]`

### Edge Cases
- [ ] No sales for period → empty state, not crash `[RTL]`
- [ ] Very large number of orders in range → no performance issue `[RTL]`
- [ ] Date range: start > end → validation error `[RTL]`
- [ ] Date range spanning month/year boundaries → correct `[BE-Jest]`
- [ ] Missing costing data → no NaN displayed `[RTL]`
- [ ] Voided orders excluded from revenue `[BE-Jest]`

---

## 22. Print & Slip Settings 🟢 P3 — Nice to Have

### Happy Path
- [ ] Set business name, address, phone for slip `[Maestro]`
- [ ] Enable/disable receipt fields (header, footer) 🆕 `[Maestro]`
- [ ] Preview shows correct data including customer phone `[RTL]`
- [ ] Connect Bluetooth printer → receipt prints `[Manual]`
- [ ] Paper size setting changes preview `[RTL]`

### Edge Cases
- [ ] No Bluetooth printer → graceful message, not crash `[Manual]`
- [ ] Very long footer text → wraps, doesn't overflow `[RTL]`
- [ ] Business name blank → uses merchant profile name `[RTL]`
- [ ] Print while offline → clear error `[Manual]`
- [ ] Preview on tablet → windowed card shown (not full screen) 🆕 `[Manual]`

---

## 23. Activity & Audit Logs 🟢 P3 — Nice to Have

### Happy Path
- [ ] Log shows recent actions with timestamp and actor `[Maestro]`
- [ ] Filter by branch works `[RTL]`
- [ ] Older entries visible with scroll 🆕 `[Maestro]`

### Edge Cases
- [ ] 500+ log entries → virtualized, no slowdown `[RTL]`
- [ ] Action by deleted/archived staff → still shows their name `[BE-Jest]`
- [ ] Log entry with unusual characters in description → no crash 🆕 `[RTL]`
- [ ] Activity/tasks enum labels display correctly (not raw enum values) 🆕 `[RTL]`
- [ ] Empty log (new merchant) → empty state shown `[RTL]`

---

## 24. Cross-Cutting / General 🟡 P2 — Important

### Happy Path
- [ ] Sign out → session cleared, redirected to login `[Maestro]`
- [ ] Switch between all main tabs → no state bleed `[Maestro]`
- [ ] App backgrounded 10+ min → returns to correct screen `[Maestro]`
- [ ] Portrait ↔ landscape → layout adjusts `[Manual]`
- [ ] Settings tablet landscape: sidebar peek works → dismiss by backdrop tap 🆕 `[Manual]`

### Edge Cases
- [ ] Force-close mid-form → draft lost or preserved (expected behavior documented) `[Manual]`
- [ ] Two sessions on different devices → no silent data overwrite `[Manual]`
- [ ] Device runs low on memory → no crash `[Manual]`
- [ ] Very slow network (2G) → loading states shown, no timeout crash `[Maestro]`
- [ ] API returns 500 → user sees error, not raw error or blank screen `[RTL]`
- [ ] Auth token expires mid-session → re-login prompt, not silent failure `[Maestro]`
- [ ] App updated while logged in → session persists or clean logout `[Maestro]`

---

## 🆕 25. Washer Module 🟠 P1 — Critical

> Washer role has its own navigation stack (`/(washer)/`). All cases below apply to the washer-side app — not merchant POS order assignment.

### Happy Path
- [ ] Washer profile loads correctly (displayName, bio, machine info, pricing) `[Maestro]`
- [ ] Toggle washer availability ON/OFF → isAvailable updates `[Maestro]`
- [ ] Update washer profile (display name, phone, bio, machine, location, price) `[Maestro]`
- [ ] Washer stats load: slots used, earnings, avg rating, completed bookings `[Maestro]`
- [ ] Today's bookings list loads with correct fields `[Maestro]`
- [ ] Booking history loads with correct limit `[Maestro]`
- [ ] Update booking status: PENDING → CONFIRMED → IN_PROGRESS → COMPLETED `[Maestro]`
- [ ] Washer earnings summary loads (totalPending, totalReleased, totalWithdrawn) `[Maestro]`
- [ ] Request withdrawal → success response `[Maestro]`

### Edge Cases
- [ ] toggleWasherAvailability auto-creates profile if not initialized yet `[BE-Jest]`
- [ ] Washer with no bookings today → todayBookings returns empty list `[BE-Jest]`
- [ ] Booking history: limit param respected (default 20) `[BE-Jest]`
- [ ] Update booking status: invalid transition → handled gracefully `[BE-Jest]`
- [ ] Washer earnings: PENDING → RELEASED status transition reflected `[BE-Jest]`
- [ ] Request withdrawal amount > available balance → blocked or warned `[BE-Jest]`
- [ ] Washer profile with no store photos → no crash in UI `[RTL]`
- [ ] Platform fee percent displays correctly in profile and earnings `[RTL]`
- [ ] Network offline while toggling availability → error shown, state not corrupted `[Maestro]`

---

## Coverage Summary

| Tool | Items Covered | Status |
|---|---|---|
| **FE Jest** (all) | 788 tests / 30 suites | Done — `npm test` in LALABA_MERCHANT_APP_DEV |
| **RTL** (all) | Included in above | Done — runs with Jest |
| **BE-Jest** (tasks integration) | 24 tests | Done — `npm test` in LALABA_BE_DEV |
| **BE-Jest** (pos-orders unit) | 39 tests | Done — `npm test` in LALABA_BE_DEV |
| **BE-Jest** (app controller) | 1 test | Done |
| **Maestro flows** | 6 flows written | Ready — needs emulator + dev build |
| **Manual** | ~30 items | Ongoing QA |

---

## Priority Order for First QA Pass

| Priority | Area | Primary Tool |
|---|---|---|
| **P0 — Blocker** | Login, Google OAuth, POS Checkout, Order Queue, Order Claiming | `[Maestro]` |
| **P1 — Critical** | Branch, Services, Staff login + device approval, Permission enforcement, POS Void, Washer Module | `[Maestro]` + `[RTL]` |
| **P2 — Important** | Inventory, Costing, Tasks, Permissions matrix, Cross-Cutting | `[BE-Jest]` + `[RTL]` |
| **P3 — Nice to have** | Order history reprint, Reports, Audit logs, Print settings | `[Manual]` |

---

## Running the Tests

```bash
# Unit + logic tests — runs in seconds, no device needed
npm test

# Watch mode during development
npm run test:watch

# With coverage report
npm run test:coverage

# Schema contract validation (after GraphQL Inspector is added)
npm run validate:schema

# E2E flows — Maestro 2.6.1 installed, flows in .maestro/
# Requires: Android emulator running + `npx expo run:android` dev build installed
maestro test .maestro/p0_login.yaml
maestro test .maestro/p0_pos_checkout.yaml
maestro test .maestro/p0_order_claiming.yaml
```
