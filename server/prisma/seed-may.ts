import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Resetting for May 2026...');

  // 1. Reset bill_generated flag on all delivery logs
  await prisma.deliveryLog.updateMany({
    data: { billGenerated: false },
  });
  console.log('  ✓ bill_generated reset to false');

  // 2. Reset house balances: previous=0, current=0 (clean slate)
  const houses = await prisma.house.findMany({ orderBy: { id: 'asc' } });
  for (const house of houses) {
    await prisma.houseBalance.upsert({
      where: { houseId: house.id },
      update: { previousBalance: 0, currentBalance: 0, updatedAt: new Date() },
      create: { houseId: house.id, previousBalance: 0, currentBalance: 0 },
    });
  }
  console.log('  ✓ House balances reset (previous=0, current=0)');

  // 3. Aggregate delivery items per house for May bill & update balances
  const configs = await prisma.houseConfig.findMany({
    include: { house: true },
    orderBy: { houseId: 'asc' },
  });

  for (const cfg of configs) {
    const house = cfg.house;
    const logs = await prisma.deliveryLog.findMany({
      where: { houseId: house.id, billGenerated: false },
      orderBy: { deliveredAt: 'asc' },
    });

    if (logs.length === 0) continue;

    // Aggregate items across all logs
    const itemMap = new Map<string, { name: string; qty: number; rate: number; amount: number }>();
    for (const log of logs) {
      const items = log.items as Array<{ milkType?: string; name?: string; qty?: number; rate?: number; amount?: number }>;
      for (const item of items) {
        const name = item.milkType ?? item.name ?? 'milk';
        const key = `${name}:${item.rate}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.qty += item.qty ?? 0;
          existing.amount += item.amount ?? 0;
        } else {
          itemMap.set(key, {
            name,
            qty: item.qty ?? 0,
            rate: item.rate ?? 0,
            amount: item.amount ?? 0,
          });
        }
      }
    }

    const billItems = Array.from(itemMap.values());
    const totalAmount = billItems.reduce((sum, i) => sum + i.amount, 0);

    // Update balance: current = sum of all delivery amounts
    await prisma.houseBalance.update({
      where: { houseId: house.id },
      data: { currentBalance: totalAmount },
    });

    // Create bill
    const bill = await prisma.bill.create({
      data: {
        month: 5,
        year: 2026,
        fromDate: new Date('2026-05-01'),
        toDate: new Date('2026-05-31'),
        totalAmount,
        items: billItems,
        previousBalance: 0,
        outstandingAmount: totalAmount,
        houseId: house.id,
        isClosed: false,
      },
    });

    // Mark delivery logs as billed
    await prisma.deliveryLog.updateMany({
      where: { houseId: house.id, billGenerated: false },
      data: { billGenerated: true },
    });

    console.log(`  ✓ Bill #${bill.id} for ${house.houseNo}: ₹${totalAmount} (${billItems.length} items)`);
  }

  console.log('\n✅ May 2026 data ready!');
  console.log(`   Houses: ${houses.length}`);
  console.log(`   Delivery logs: ${await prisma.deliveryLog.count()}`);
  console.log(`   Bills: ${await prisma.bill.count()}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
