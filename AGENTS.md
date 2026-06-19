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
