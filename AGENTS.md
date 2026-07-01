# Project Context

## Goal
Fix and maintain the Bill Manager app's billing, balance, payment, receipt display, bill PDF generation, and data seeding.

## Current State

### Branch/Working State
- All changes are in working directory (no active DB changes since last instruction)
- Both server and client TypeScript compile cleanly

## Key Changes Made

### 1. PDF Styling (bills/page.tsx) ... (unchanged)

### 2. BuildPrintableBillItems ... (unchanged)

[keep all existing sections 1-13 unchanged]

### 1. PDF Styling (bills/page.tsx)
- **Spacing reduced**: headerTextY (4.5→3.5), titleY (11.5→8.5), noteY (12), toY (14.5), tableTop (18) to tighten layout around DAIRY title
- **Bolder text**: Table data cells now use `bold: true`, header info changed from italic→bolditalic, previous balance line uses bolditalic
- **Note line added**: "Note: Bill has to be submitted by 15th of month" centered under DAIRY title
- **Removed full-width previous balance row** → replaced with a normal table row: PARTICULAR column shows "PREVIOUS BALANCE / ADVANCE" (right-aligned), AMT column shows value with "BAL"/"ADVANCE" label
- **PDF_TABLE_ROWS=4** to account for previous balance row in table
- **receiptsY = footerStartY** (removed +5.3 gap since separate full-width row was removed)
- All font sizes restored to original values

### 2. BuildPrintableBillItems — Precise categorization (bills/page.tsx)
- Added `billItemProduct()` function using precise matching: only exact "cow milk", "cow milk milk", "cow milk " prefix → "Cow Milk"; same for buffalo
- Replaced `name.includes('cow')` / `name.includes('buffalo')` with `billItemProduct()` — prevents "Cow Desi Ghee" from being miscategorized as "Cow Milk"

### 3. normalizeMilkType (houses/page.tsx)
- Previously was just `String(value ?? '').trim()` — returned raw milkType
- Now filters standalone "milk" / empty → returns ""
- Precisely matches "cow milk" / "buffalo milk" variants → "Cow Milk" / "Buffalo Milk"
- Strips trailing " Milk"/" milk" from non-milk products (e.g., "Curd Milk" → "Curd")
- Capitalizes first letter of fallthrough products

### 4. cleanItemName (houses/page.tsx & bills/page.tsx)
- Same precise matching logic as normalizeMilkType
- Applied in houses page: monthlyProductSummary, summaryTotals, Generated Bill section
- Applied in bills page: View Bill Dialog item name display

### 5. buildItemsFromDeliveryLogs (bills/page.tsx)
- Fixed name generation: doesn't append " Milk" when type already ends with "milk" — prevents "Cow milk Milk", "Buffalo milk Milk"

### 6. Server `buildBillDraft` (server/src/bills/bills.service.ts)
- Fixed name generation: strips trailing "milk" before adding "Milk" for types ending with "milk"
- For non-milk-end types, appends " Milk" (kept original behavior)

### 7. buildHouseDeliverySummary (houses/page.tsx)
- Filters out empty product names (when normalizeMilkType returns "") to prevent orphaned quantities in daily deliveries

### 8. Receipts Page — House selection auto-fills previousBalance (recipts/page.tsx)
- Changed `handleHouseSelect` to also fetch `balanceApi.get(houseId)` alongside `billsApi.pending(houseId)`
- Amount field now fills with `balance.previousBalance` instead of `lastBill.pendingAmount`

### 9. Receipts Page — Validation allows amount=0 with discount>0 (recipts/page.tsx)
- Changed `!formAmount` check to validate `amount + discount > 0` instead
- Pre-parses amount and discount once, reuses in downstream calls

### 10. Payment Edit/Delete buttons on receipts page (recipts/page.tsx)
- Added edit (pencil) and delete (trash) buttons in the payments table
- Edit dialog supports amount, discount, and note fields
- Delete confirmation with balance reversal description
- Added `handleEditPayment()` and `handleDeletePayment()` functions

### 11. Discount display in Received Payments table (houses/page.tsx)
- Dedicated Discount column (separate from Paid column)
- Inline discount display in main receipts page Amount cell
- Discount column in PDF export

### 12. Receipts Page — payment table and dialog (recipts/page.tsx)
- Payment view/edit/delete integrated

### 13. Payment Date (`paidAt`) field
- Added `paidAt DateTime @default(now()) @map("paid_at")` to `PaymentHistory` Prisma model (`server/prisma/schema.prisma`)
- Added optional `paidAt?: string` to `RecordPaymentDto` and `UpdatePaymentDto` (`server/src/house-balance/dto/payment.dto.ts`)
- Updated `house-balance.service.ts`: `recordPayment()` and `updatePayment()` pass `paidAt` to Prisma when provided
- Client Record Payment dialog: optional date picker (`formPaidAt` state), defaults to today
- Client Edit Payment dialog: date field prefilled from existing `paidAt`
- Display uses `paidAt || createdAt` in all payment tables and summary popups (recipts page, houses pages, supplier houses-all page)
- **Build pitfall**: After adding a field to `schema.prisma`, `npx prisma generate` must be run BEFORE `npx nest build` — otherwise the Prisma client doesn't recognize the new field and throws `Unknown argument` at runtime

## Reverted Changes
None.

## Known Issues
- Server still appends " Milk" to non-milk product types in `buildBillDraft`. Client-side `cleanItemName` handles this for display, but new bill items will still have names like "Curd Milk", "Paneer Milk" in the database.
- `billItemProduct` in `buildItemsFromDeliveryLogs` (server-side) may need similar precise matching if reused elsewhere.

## Next Steps
- Test stale-while-revalidate caching for delivery logs
- Verify PDF page numbers render correctly

## Key Changes Made (Recent)

### 18. Stale-while-revalidate caching for delivery logs (`delivery-storage.ts`)
- `pullDeliveryLogs` now implements 3-path caching:
  1. **IDB has data + fresh (<30s)**: returns IDB instantly, no server call
  2. **IDB has data + stale (>30s)**: returns IDB instantly, server fetch runs in background
  3. **IDB empty**: blocking server fetch, then returns fresh data
- `invalidateSyncCache()` called after every mutation (create/update/delete) and after queue sync operations
- `lastSyncAt` is an in-memory `Map<string, key>` keyed by `{houseId}:{shift}:{fromDate}:{toDate}`

### 19. Page numbers in PDF exports (`houses/page.tsx`)
- Added "Page X of Y" footer to individual house summary PDF
- Added "Page X of Y" footer to all-houses summary PDF

### 20. All Houses Summary sort order (`houses/page.tsx`)
- Modified `handleExportAllHousesSummaryPdf` to sort houses as: Shop → Evening → Morning
- Morning houses sorted by supplier (alphabetically by username), then by house number
- Evening houses sorted by supplier, then by house number

### 21. Partial-month billing — adjust period instead of blocking (`bills.service.ts`, `bills/page.tsx`, `api.ts`)
- **Problem**: `getExistingBillForPeriod` blocked bill creation if ANY existing bill overlapped the requested date range (e.g., bill for June 1–10 blocked creating June 1–30)
- **Fix**: New `getAdjustedPeriodStart(houseId, periodStart, periodEnd)` finds the latest overlapping bill's `toDate` and pushes `periodStart` to the next day
- `buildBillDraft` now uses `adjustedStart` instead of the raw `periodStart`, so bills only cover unbilled logs
- `preview` endpoint returns `adjustedFromDate`, `adjustedToDate`, and `skippedToDate` (the previous bill's end date) instead of `isDurationAlreadyCreated`
- Client `BillPreview` type updated with `adjustedFromDate?`, `adjustedToDate?`, `skippedToDate?`
- Client preview panel shows amber info banner: "A bill already exists up to {skippedToDate}. This bill will cover {adjustedFromDate} to {adjustedToDate}."
- `handleGenerate` no longer blocks on `isDurationAlreadyCreated` — only blocks on `isAlreadyClosed` or zero logs

### 22. Delivery Summary fixes across all summary pages (`houses/page.tsx`, `recipts/page.tsx`, `supplier/houses-all/page.tsx`)
- Monthly Product Summary now computes all month logs first, then subtracts bill item quantities/amounts to show pending-only quantities
- Added `summaryTotals.pendingTotal` so Monthly Product Summary Total/Grand Total rows no longer include bill totals again
- Green delivery row highlighting and delete validation use `isDeliveryBlockedByBill(dateKey)` instead of stale client-side `billGenerated`
- Receipts page Monthly Product Summary is no longer hidden when a bill exists
- Supplier houses-all `buildMonthlyProductSummary` no longer internally filters `billGenerated`
- PDF exports updated to use pending totals consistently

### 23. Database reset to May-only data (`seed-may-v2.ts`)
- Database was reset with `npx prisma migrate reset --force`
- `seed-may-v2.ts` now seeds May 1–31, 2026 only (no April/June logs)
- Current seeded state: 5 users, 200 houses, 6 product rates, 200 house configs, 200 balances, 6,200 delivery logs, 5 delivery plans, 0 bills, 0 payments
- Added `suppliers` to dependency array

### 24. Multi-Dairy (Multi-Tenant) Architecture — Full Refactor

#### Overview
- **New `Dairy` model** in Prisma schema (`server/prisma/schema.prisma`) — each Dairy is a tenant with its own isolated data
- **Every entity scoped by `dairyId`**: User, House, ProductRate, HouseConfig, HouseBalance, PaymentHistory, Bill, BillNote, DeliveryLog, DeliveryPlan
- **Usernames are unique per dairy** (`@@unique([dairyId, username])`) — same username can exist in different dairies
- **House numbers are unique per dairy** (`@@unique([dairyId, houseNo])`)
- **Product rate names are unique per dairy** (`@@unique([dairyId, name])`)
- **Email is globally unique** (across all dairies)

#### Auth Flow
- **`GET /dairies`** — Public endpoint listing all registered dairies (for dairy selection on login page)
- **`POST /auth/dairy/register`** — Public endpoint to register a new dairy with an admin user account
  - Body: `{ dairyName, email, phone?, address?, username, password, ownerName? }`
  - Creates Dairy record + admin User, returns JWT with `dairyId`
- **`POST /auth/login`** — Now accepts optional `dairyId` in body
  - When `dairyId` provided, login is scoped to that dairy (`findFirst` with username + dairyId)
  - JWT payload now includes `dairyId`
- **`POST /auth/register`** — Creates user within a dairy (requires `dairyId` in body)

#### Server Files Created/Modified

**New files:**
- `server/src/dairies/dairies.module.ts` — `DairiesModule`
- `server/src/dairies/dairies.controller.ts` — CRUD for dairies (`GET /dairies`, `GET /dairies/:id`, `POST /dairies`, etc.)
- `server/src/dairies/dairies.service.ts` — Dairy CRUD logic
- `server/src/dairies/dto/dairy.dto.ts` — CreateDairyDto, UpdateDairyDto
- `server/src/common/decorators/current-user.decorator.ts` — `@CurrentUser()` parameter decorator

**Modified files (all server modules):**
- `server/prisma/schema.prisma` — Dairy model + dairyId on all entities
- `server/src/auth/auth.module.ts` — Imports DairiesModule + PrismaModule
- `server/src/auth/auth.service.ts` — Dairy registration, dairy-scoped login, JWT with dairyId
- `server/src/auth/auth.controller.ts` — New `/auth/dairy/register` endpoint
- `server/src/auth/dto/auth.dto.ts` — New `DairyRegisterDto`, updated `LoginDto` with `dairyId`
- `server/src/auth/strategies/local.strategy.ts` — `passReqToCallback: true`, reads `dairyId` from body
- `server/src/auth/strategies/jwt.strategy.ts` — Added `dairyId` to `JwtPayload` + validated return
- `server/src/app.module.ts` — Added `DairiesModule` to imports
- ALL controllers — Added `@CurrentUser('dairyId') dairyId` parameter, pass to services
- ALL services — Added `dairyId` parameter to all methods, added `where: { dairyId }` filters
- `server/src/users/users.service.ts` — Added `findByUsernameInDairy()`, updated `findAll()` to accept `dairyId`

#### Client Files Modified/Created

**New files:**
- `client/components/auth/dairy-login-form.tsx` — Login form with dairy selector dropdown + username/password
- `client/components/auth/dairy-register-form.tsx` — Dairy registration form (dairy details + admin credentials)
- `client/app/dairy/register/page.tsx` — Server component wrapping `DairyRegisterForm`

**Modified files:**
- `client/lib/auth.ts` — `SessionAuth` now includes `dairyId`, new functions: `apiListDairies()`, `apiDairyRegister()`, updated `apiLogin()`/`apiRegister()` with `dairyId` param
- `client/app/page.tsx` — Changed from `LoginForm` to `DairyLoginForm` (dairy selection + login)
- `client/middleware.ts` — Added `/dairy/register` to `AUTH_PAGES` (redirect authenticated users away)

#### New Login Flow
1. **`/`** → Shows dairy selector dropdown (fetched from `GET /dairies`) + username/password fields
   - "Register New Dairy" link at bottom
2. **`/dairy/register`** → Registration form: dairy name, email, phone, address, admin username, password
   - Creates dairy + admin user, auto-logs-in
3. After login → Redirected to dashboard (`/dashboard/admin` or `/dashboard/supplier` or `/dashboard/member`)
4. All API calls automatically carry `dairyId` in JWT → server scopes all queries

#### Testing
- Server + Client both compile with zero TypeScript errors
- Database seeded with 1 dairy (GNK Dairy), 200 houses, 5 users, 6200 delivery logs
- Verified: data isolation between dairies (dairy 2 sees 0 houses)
- Verified: login works with dairyId, JWT carries dairyId
- Verified: dairy registration creates new tenant

### 25. Supplier houses-all page — Admin feature parity (`supplier/houses-all/page.tsx`)
- **Pre Bal column**: Added separate Pre Bal header + data cell in houses table; Balance now shows `previousBalance + currentBalance` sum
- **Infinite scroll**: Added `visibleCount`/`visibleFiltered`/`hasMoreVisibleHouses` with IntersectionObserver; loads 25 houses at a time; scroll-to-end sentinel row
- **All Summary PDF Export**: Added `handleExportAllHousesSummaryPdf` (same multi-page PDF as admin: index page with house/page grid, per-house payments + product summary + daily deliveries, Shop→Evening→Morning sort); triggered by "All Summary" button + month/year selector dialog
- **Date-range filter in summary dialog**: From/To date inputs above Daily Deliveries table; `filteredSummaryLogs` computed via `summaryFromDate/ToDate`
- **Received Payments panel in summary dialog**: Shows Date/Paid/Discount/Note table above Monthly Product Summary when payments exist; uses `paymentSummaryRows` computed from `summaryBalance.payments`
- **Pre Bal fill on summary open**: `openSummary` now fetches `balanceApi.get(house.id)` alongside logs/bills/rates; sets `summaryBalance` state
- **Permission gates preserved**: All supplier privilege gates (`canEditHouses`, `canEditItems`, `canViewAllHouses`) remain unchanged
