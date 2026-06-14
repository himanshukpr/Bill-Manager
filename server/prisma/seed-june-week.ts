import { PrismaClient, Shift } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

// Deterministic "random" based on house+day so each house has consistent patterns
function seededRandom(houseId: number, day: number, seed: number): number {
  const x = Math.sin(houseId * 127 + day * 311 + seed * 691) * 10000;
  return x - Math.floor(x);
}

async function main() {
  console.log('Seeding June 7-12 2026 delivery logs (skipping today June 13)...');

  // Delete any existing June 7-13 logs first
  const deleted = await prisma.deliveryLog.deleteMany({
    where: {
      deliveredAt: {
        gte: new Date(2026, 5, 7, 0, 0, 0),
        lte: new Date(2026, 5, 13, 23, 59, 59),
      }
    }
  });
  if (deleted.count > 0) console.log(`  ✓ Cleaned ${deleted.count} existing June 7-12 logs`);

  const rajesh = await prisma.user.findFirst({ where: { username: 'rajesh' } });
  const amit = await prisma.user.findFirst({ where: { username: 'amit' } });
  const suresh = await prisma.user.findFirst({ where: { username: 'suresh' } });
  if (!rajesh || !amit || !suresh) throw new Error('Suppliers not found');

  const configs = await prisma.houseConfig.findMany();
  const configMap = new Map<number, { shift: Shift; supplierId: string }>();
  for (const c of configs) {
    if (c.supplierId) {
      configMap.set(c.houseId, { shift: c.shift, supplierId: c.supplierId });
    }
  }

  const houses = await prisma.house.findMany();
  const houseMap = new Map<number, any>();
  for (const h of houses) houseMap.set(h.id, h);

  // 20 houses per supplier
  const rajeshHouseIds = configs
    .filter((c) => c.shift === Shift.morning && c.supplierId === rajesh.uuid)
    .slice(0, 20).map((c) => c.houseId);
  const amitHouseIds = configs
    .filter((c) => c.shift === Shift.morning && c.supplierId === amit.uuid)
    .slice(0, 20).map((c) => c.houseId);
  const sureshHouseIds = configs
    .filter((c) => c.shift === Shift.evening && c.supplierId === suresh.uuid)
    .slice(0, 20).map((c) => c.houseId);

  const allHouseIds = [...rajeshHouseIds, ...amitHouseIds, ...sureshHouseIds];
  let count = 0;

  for (let dayOffset = 0; dayOffset < 6; dayOffset++) {
    const day = 7 + dayOffset; // June 7-12
    const date = new Date(2026, 5, day, 0, 0, 0);

    for (const houseId of allHouseIds) {
      const house = houseMap.get(houseId);
      const cfg = configMap.get(houseId);
      if (!house || !cfg) continue;

      const primaryProduct = house.rate1Type || 'Cow Milk';
      const primaryRate = Number(house.rate1 || 55);
      const secondaryProduct = house.rate2Type;
      const secondaryRate = secondaryProduct ? Number(house.rate2 || 40) : 0;

      const r1 = seededRandom(houseId, dayOffset, 1);
      const r2 = seededRandom(houseId, dayOffset, 2);
      const r3 = seededRandom(houseId, dayOffset, 3);

      // Primary product: 1-3L, weighted towards 2
      let qty1: number;
      if (r1 < 0.25) qty1 = 1;
      else if (r1 < 0.8) qty1 = 2;
      else qty1 = 3;

      const amount1 = qty1 * primaryRate;
      const items: any[] = [{ milkType: primaryProduct, qty: qty1, rate: primaryRate, amount: amount1 }];
      let totalAmount = amount1;

      // Secondary product: ~50% of days
      if (secondaryProduct && r2 > 0.5) {
        let qty2: number;
        if (r3 < 0.6) qty2 = 1;
        else qty2 = 2;

        const amount2 = qty2 * secondaryRate;
        items.push({ milkType: secondaryProduct, qty: qty2, rate: secondaryRate, amount: amount2 });
        totalAmount += amount2;
      }

      const deliveryDate = new Date(date);
      if (cfg.shift === Shift.morning) deliveryDate.setHours(6, 0, 0, 0);
      else if (cfg.shift === Shift.evening) deliveryDate.setHours(17, 0, 0, 0);
      else deliveryDate.setHours(10, 0, 0, 0);

      const opening = 10 + Math.floor(seededRandom(houseId, dayOffset, 4) * 50);

      await prisma.deliveryLog.create({
        data: {
          houseId,
          supplierId: cfg.supplierId,
          shift: cfg.shift,
          items,
          totalAmount,
          openingBalance: opening,
          closingBalance: opening + totalAmount,
          deliveredAt: deliveryDate,
          billGenerated: false,
          isClosed: false,
        },
      });
      count++;
    }
  }

  console.log(`  ✓ Created ${count} delivery logs for June 7-12`);
  console.log(`\n✅ Done! Total delivery logs: ${await prisma.deliveryLog.count()}`);
}

main()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
