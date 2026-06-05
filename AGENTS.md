# Project Context

## Goal
Fix and maintain the Bill Manager app's billing, balance, payment, receipt display, bill PDF generation, and data seeding.

## Current State

### Branch/Working State
- All changes are in working directory (no active DB changes since last instruction)
- Both server and client TypeScript compile cleanly

## Key Changes Made

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

## Reverted Changes
None.

## Known Issues
- Server still appends " Milk" to non-milk product types in `buildBillDraft`. Client-side `cleanItemName` handles this for display, but new bill items will still have names like "Curd Milk", "Paneer Milk" in the database.
- `billItemProduct` in `buildItemsFromDeliveryLogs` (server-side) may need similar precise matching if reused elsewhere.

## Next Steps
- Test PDF output for item categorization and formatting
- Verify houses summary product names
- Verify receipt page house selection and amount auto-fill
