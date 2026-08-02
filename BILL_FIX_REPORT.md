# Bill Fix Report — Dairy 5 (GN Dairy BRS Nagar)

**Date:** 2026-08-02
**Scope:** All 176 July 2026 bills regenerated with fixed code

---

## Root Causes Found

### 1. Timezone Mismatch in Date Parsing

**Problem:**
- Client stored `deliveredAt` as `new Date().toISOString()` (UTC)
- Server queried with `new Date(y, mo, d, 23, 59, 59, 999)` (local time)
- In IST (+5:30), local 23:59:59 = UTC 18:29:59 — logs created after this time were excluded

**Fix:**
- Created `server/src/common/utils/date.util.ts` with `parseDateAsUTC()`, `utcDayStart()`, `utcDayEnd()`
- All date parsing now uses UTC consistently across `bills.service.ts`, `delivery-logs.service.ts`, `house-balance.service.ts`

### 2. `toDate` Stored as Midnight of Last Day

**Problem:**
- `toDateStorage` was set to `2026-07-31T00:00:00Z` (midnight of July 31)
- Any code using `lte: bill.toDate` missed **all logs from the last day**
- 181 July 31 logs existed but were not included in bills

**Fix:**
- `toDateStorage` now stores **start of next day** (`2026-08-01T00:00:00Z`)
- Queries use half-open interval: `gte: fromDate, lte: toDate` correctly includes all logs through the last day

### 3. `getAdjustedPeriodStart` Always Called

**Problem:**
- When user explicitly provided both `fromDate` and `toDate`, the function still ran
- It detected overlap with existing bill → pushed `adjustedStart` to Aug 1 → zero July logs found
- Bills were generated with no items

**Fix:**
- Added `needsPeriodAdjustment` flag — only calls `getAdjustedPeriodStart` when dates are auto-detected (no `fromDate` provided)

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/common/utils/date.util.ts` | **New** — UTC date utilities |
| `server/src/bills/bills.service.ts` | Half-open `toDate`; conditional `getAdjustedPeriodStart`; `remove` uses `bill.fromDate`/`bill.toDate` |
| `server/src/delivery-logs/delivery-logs.service.ts` | `parseDateAsUTC()` for `deliveredAt` |
| `server/src/house-balance/house-balance.service.ts` | `closePeriod` half-open interval; `parseDateAsUTC()` for `paidAt` |

---

## Data Fix — 176 Bills Regenerated

### Process
1. For each house: reversed balance updates (decrement previousBalance, increment currentBalance)
2. Reset `billGenerated = false` on all delivery logs in the period
3. Deleted old bills
4. Re-generated bills with fixed code (all unbilled logs now included)

### Results

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| Bills processed | 176 | 176 (all fixed) |
| July 31 logs billed | 0 | 181 (all included) |
| `toDate` format | `2026-07-31T00:00:00Z` | `2026-08-01T00:00:00Z` |
| Errors | — | 0 |

### Sample Verification

**House 237 C** (previously reported missing items):
- Old bill: Mix milk x51, Paneer x3.65, Other x145, Bread x675
- New bill: Mix milk x58.5, Paneer x4.05, Other x145, Bread x675
- **2 July 31 logs now included** (were missing before)

**House 5 No Police col.:**
- 22 logs → 2 items (Mix milk x40, Paneer x0.95)
- toDate: `2026-08-01T00:00:00Z` ✓

**House 248 G:**
- 48 logs → 5 items (Cow Milk x53, Mix milk x2, etc.)

---

## Verification Commands

To re-verify after future changes:

```bash
# Check toDate format of bills
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
prisma.bill.findMany({ where: { dairyId: 5, month: 7, year: 2026 }, take: 3 })
  .then(bills => bills.forEach(b => console.log(b.id, b.toDate?.toISOString())));
prisma.\$disconnect();
"

# Check July 31 log billing status
npx ts-node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
prisma.deliveryLog.findMany({ where: { dairyId: 5, deliveredAt: { gte: new Date('2026-07-31'), lt: new Date('2026-08-01') } } })
  .then(logs => { console.log('Total:', logs.length, 'Billed:', logs.filter(l => l.billGenerated).length); });
prisma.\$disconnect();
"
```

---

## Future Bills — Will They Work?

**Yes.** The fixes ensure:

1. `toDate` is always start of next day → `lte: toDate` includes all logs through last day
2. All date parsing is UTC-consistent → no timezone ambiguity
3. `getAdjustedPeriodStart` only adjusts when dates are auto-detected
4. `remove` method uses `bill.fromDate`/`bill.toDate` directly (not `month`-based)
5. `closePeriod` uses same half-open interval pattern
