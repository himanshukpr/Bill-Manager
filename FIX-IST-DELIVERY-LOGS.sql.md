# Fix Delivery Log Timestamps & Bill toDate

## Problem 1: IST-Shifted Delivery Logs
335 delivery logs had `delivered_at` stored with IST-to-UTC offset. `toISOString()` converted local midnight (IST) to UTC -5:30, resulting in `2026-06-30T18:30:00Z` instead of `2026-07-01T00:00:00Z`.

## Problem 2: Bill toDate (Last Day Missing)
589 bills had `toDate` stored as midnight of the **last day** (e.g., `2026-05-31T00:00:00Z`) instead of the **next day** (e.g., `2026-06-01T00:00:00Z`). The regen script used `lt: toDate` which missed all logs on the last day of the month.

## Impact
- Bills generated with fewer logs than expected (e.g., 47L instead of 49L)
- Monthly Product Summary showed incorrect pending quantities
- Last day's logs marked as `billGenerated: true` but items not in bill

## Fix SQL

```sql
-- Step 1: Preview affected logs
-- Logs where delivered_at falls at UTC 18:30 (IST midnight = UTC+5:30)
SELECT id, dairy_id, house_id, delivered_at,
       delivered_at + INTERVAL 5 HOUR 30 MINUTE AS fixed_delivered_at
FROM delivery_log
WHERE HOUR(delivered_at) = 18
  AND MINUTE(delivered_at) = 30
  AND SECOND(delivered_at) = 0
ORDER BY delivered_at;

-- Step 2: Count affected logs
SELECT COUNT(*) AS affected_count
FROM delivery_log
WHERE HOUR(delivered_at) = 18
  AND MINUTE(delivered_at) = 30
  AND SECOND(delivered_at) = 0;

-- Step 3: Apply the fix
-- Shift all IST-midnight logs to correct UTC midnight
UPDATE delivery_log
SET delivered_at = delivered_at + INTERVAL 5 HOUR 30 MINUTE
WHERE HOUR(delivered_at) = 18
  AND MINUTE(delivered_at) = 30
  AND SECOND(delivered_at) = 0;

-- Step 4: Verify — should return 0 rows
SELECT COUNT(*) AS remaining_ist_shifted
FROM delivery_log
WHERE HOUR(delivered_at) = 18
  AND MINUTE(delivered_at) = 30
  AND SECOND(delivered_at) = 0;

-- Step 5: Verify house 834 G (dairy 5) — should show 28 July logs totaling 49L
SELECT id, delivered_at, items
FROM delivery_log
WHERE house_id = (SELECT id FROM house WHERE house_no = '834 G' AND dairy_id = 5)
  AND delivered_at >= '2026-07-01 00:00:00'
  AND delivered_at < '2026-08-01 00:00:00'
ORDER BY delivered_at ASC;
```

## After Running SQL — Fix Bill toDate + Regenerate Items

After fixing timestamps, you must also fix `toDate` and regenerate bill items.

### Step 1: Fix bill toDate (SQL)

```sql
-- Fix bills where toDate is midnight of last day instead of next day
-- For May bills: 2026-05-31 → 2026-06-01
-- For June bills: 2026-06-30 → 2026-07-01
-- For July bills: 2026-07-31 → 2026-08-01

-- Preview affected bills
SELECT id, house_id, month, year, to_date,
  CASE
    WHEN DAY(to_date) = DAY(LAST_DAY(to_date)) AND HOUR(to_date) = 0
    THEN DATE_ADD(to_date, INTERVAL 1 DAY)
    ELSE to_date
  END AS fixed_to_date
FROM bill
WHERE DAY(to_date) = DAY(LAST_DAY(to_date))
  AND HOUR(to_date) = 0
  AND MINUTE(to_date) = 0;

-- Apply fix
UPDATE bill
SET to_date = DATE_ADD(to_date, INTERVAL 1 DAY)
WHERE DAY(to_date) = DAY(LAST_DAY(to_date))
  AND HOUR(to_date) = 0
  AND MINUTE(to_date) = 0;

-- Verify — should return 0
SELECT COUNT(*) AS bad_toDate_remaining
FROM bill
WHERE DAY(to_date) = DAY(LAST_DAY(to_date))
  AND HOUR(to_date) = 0
  AND MINUTE(to_date) = 0;
```

### Step 2: Regenerate Bill Items (Node.js Script)

Create `fix-toDate-regen.ts` in the `server/` folder and run with `npx tsx -r dotenv/config fix-toDate-regen.ts`:

```typescript
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
  // Step 1: Fix toDate for bills where it's last day midnight instead of next day
  const allBills = await prisma.bill.findMany({
    select: { id: true, houseId: true, month: true, year: true, fromDate: true, toDate: true }
  });
  let toDateFixed = 0;
  for (const b of allBills) {
    if (!b.toDate) continue;
    const to = new Date(b.toDate);
    const lastDayOfMonth = new Date(Date.UTC(b.year, b.month, 0)).getUTCDate();
    if (to.getUTCDate() === lastDayOfMonth && to.getUTCHours() === 0 && to.getUTCMinutes() === 0) {
      const nextDay = new Date(Date.UTC(b.year, b.month - 1, lastDayOfMonth + 1));
      await prisma.bill.update({ where: { id: b.id }, data: { toDate: nextDay } });
      toDateFixed++;
    }
  }
  console.log(`Fixed ${toDateFixed} bills with wrong toDate`);

  // Step 2: Regenerate all bill items using corrected toDate
  const bills = await prisma.bill.findMany({ orderBy: [{ year: 'asc' }, { month: 'asc' }] });
  let regenerated = 0;
  for (const bill of bills) {
    if (!bill.fromDate || !bill.toDate) continue;
    const rangeLogs = await prisma.deliveryLog.findMany({
      where: { houseId: bill.houseId, deliveredAt: { gte: bill.fromDate, lt: bill.toDate } }
    });
    const itemMap = new Map<string, { name: string; qty: number; rate: number; amount: number }>();
    for (const log of rangeLogs) {
      if (!log.items) continue;
      const rawItems = Array.isArray(log.items) ? log.items : JSON.parse(JSON.stringify(log.items));
      const items = rawItems as Array<Record<string, unknown>>;
      for (const item of items) {
        const milkType = (item.milkType as string) || (item.product as string) || (item.name as string) || 'Unknown';
        const qty = Number(item.qty); const rate = Number(item.rate);
        const amount = Number(item.amount ?? qty * rate);
        if (qty <= 0 || rate <= 0) continue;
        const key = `${milkType}:${rate}`;
        const existing = itemMap.get(key);
        if (existing) { existing.qty += qty; existing.amount += amount; }
        else { itemMap.set(key, { name: milkType, qty, rate, amount }); }
      }
    }
    const items = Array.from(itemMap.values());
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const oldItems = JSON.parse(JSON.stringify(bill.items || []));
    const oldTotal = Number(bill.totalAmount);
    if (JSON.stringify(items) !== JSON.stringify(oldItems) || Math.abs(totalAmount - oldTotal) > 0.01) {
      await prisma.bill.update({ where: { id: bill.id }, data: { items: items as any, totalAmount } });
      console.log(`Bill#${bill.id} house=${bill.houseId} m=${bill.month}: ₹${oldTotal} → ₹${totalAmount}`);
      regenerated++;
    }
  }
  console.log(`\nRegenerated: ${regenerated}, Unchanged: ${bills.length - regenerated}`);
  await prisma.$disconnect();
})();
```

## Verification

```sql
-- Count logs by delivered_at hour distribution (should show 0 at hour 18)
SELECT HOUR(delivered_at) AS utc_hour, COUNT(*) AS count
FROM delivery_log
GROUP BY HOUR(delivered_at)
ORDER BY utc_hour;

-- Verify no more IST-shifted logs exist
SELECT COUNT(*) AS ist_shifted_remaining
FROM delivery_log
WHERE delivered_at = DATE_ADD(DATE(delivered_at), INTERVAL 18 HOUR + INTERVAL 30 MINUTE);
```

## Code Fixes (Already Applied)

### Client: `buildDeliveredAtForDate` — IST offset fix
The `buildDeliveredAtForDate` function was fixed to produce `YYYY-MM-DDT00:00:00.000Z` instead of using `toISOString()` which converts local time to UTC with -5:30 offset.

**Files fixed:**
- `client/app/dashboard/supplier/delivery/page.tsx` — `buildDeliveredAtForDate`
- `client/app/dashboard/admin/direct-entry/page.tsx` — `buildDeliveredAtForDate`
- `client/app/dashboard/supplier/direct-entry/page.tsx` — `buildDeliveredAtForDate`
- `client/app/dashboard/admin/houses/page.tsx` — `deliveryDate.toISOString()` → `buildDeliveredAtForDate`
- `client/app/dashboard/admin/recipts/page.tsx` — `deliveryDate.toISOString()` → `buildDeliveredAtForDate`
- `client/app/dashboard/supplier/houses-all/page.tsx` — `deliveryDate.toISOString()` → `buildDeliveredAtForDate`

### Server: `generate()` — mark-as-billed uses wrong date range
The `generate()` method in `bills.service.ts` marked logs as `billGenerated: true` using `periodStart` but fetched items using `adjustedStart`. If `adjustedStart` was pushed forward by `getAdjustedPeriodStart`, logs between `periodStart` and `adjustedStart` were marked as billed but NOT included in the bill items.

**Fix:** Changed mark-as-billed query from `gte: periodStart` to `gte: adjustedStart` to match the items query.
