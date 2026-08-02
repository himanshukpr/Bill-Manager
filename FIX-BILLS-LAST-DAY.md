# Fix: Bills Not Including Last Day of Month

## Root Cause

Bills have `toDate` stored as midnight of the **last day** (e.g., `2026-05-31T00:00:00Z`) instead of **next day** (e.g., `2026-06-01T00:00:00Z`). When querying logs with `lt: toDate`, logs on the last day are excluded because they fall after `2026-05-31T00:00:00Z`.

Additionally, 335 delivery logs had `delivered_at` stored with IST-to-UTC offset (`UTC 18:30` instead of `UTC 00:00`), causing them to fall outside bill date ranges.

## Steps

### Step 1: Fix IST-shifted delivery logs

```sql
UPDATE delivery_log
SET delivered_at = delivered_at + INTERVAL 5 HOUR 30 MINUTE
WHERE HOUR(delivered_at) = 18
  AND MINUTE(delivered_at) = 30
  AND SECOND(delivered_at) = 0;
```

### Step 2: Fix bill toDate (last day → next day)

```sql
UPDATE bill
SET to_date = DATE_ADD(to_date, INTERVAL 1 DAY)
WHERE DAY(to_date) = DAY(LAST_DAY(to_date))
  AND HOUR(to_date) = 0
  AND MINUTE(to_date) = 0;
```

### Step 3: Regenerate bill items

Run this Node.js script from the `server/` folder:

```bash
npx tsx -r dotenv/config fix-bills.ts
```

Create `server/fix-bills.ts`:

```typescript
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

(async () => {
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
      for (const item of rawItems as Array<Record<string, unknown>>) {
        const name = (item.milkType as string) || (item.product as string) || (item.name as string) || 'Unknown';
        const qty = Number(item.qty);
        const rate = Number(item.rate);
        const amount = Number(item.amount ?? qty * rate);
        if (qty <= 0 || rate <= 0) continue;
        const key = `${name}:${rate}`;
        const existing = itemMap.get(key);
        if (existing) { existing.qty += qty; existing.amount += amount; }
        else { itemMap.set(key, { name, qty, rate, amount }); }
      }
    }

    const items = Array.from(itemMap.values());
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);
    const oldTotal = Number(bill.totalAmount);
    const oldItems = JSON.parse(JSON.stringify(bill.items || []));

    if (JSON.stringify(items) !== JSON.stringify(oldItems) || Math.abs(totalAmount - oldTotal) > 0.01) {
      await prisma.bill.update({ where: { id: bill.id }, data: { items: items as any, totalAmount } });
      console.log(`Bill#${bill.id} m=${bill.month} y=${bill.year}: ₹${oldTotal} → ₹${totalAmount}`);
      regenerated++;
    }
  }

  console.log(`\nDone: ${regenerated} bills updated, ${bills.length - regenerated} unchanged`);
  await prisma.$disconnect();
})();
```

### Step 4: Verify

```sql
-- Check no bills have toDate at last day midnight
SELECT COUNT(*) AS bad_toDate FROM bill
WHERE DAY(to_date) = DAY(LAST_DAY(to_date))
  AND HOUR(to_date) = 0 AND MINUTE(to_date) = 0;

-- Check no logs at UTC 18:30
SELECT COUNT(*) AS ist_shifted FROM delivery_log
WHERE HOUR(delivered_at) = 18 AND MINUTE(delivered_at) = 30;
```

Both should return 0.
