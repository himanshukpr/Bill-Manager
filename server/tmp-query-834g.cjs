const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
require('dotenv').config();
const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  const house = await prisma.house.findFirst({ where: { houseNo: '834 G', dairyId: 5 } });
  console.log('houseId:', house.id);

  // All logs for house, between June 29 and July 2 (UTC)
  const logs = await prisma.deliveryLog.findMany({
    where: { houseId: house.id, deliveredAt: { gte: new Date('2026-06-29T00:00:00Z'), lte: new Date('2026-07-02T23:59:59Z') } },
    orderBy: { deliveredAt: 'asc' },
  });

  console.log('\nLOGS NEAR JUNE 30 / JULY 1:');
  for (const l of logs) {
    const d = l.deliveredAt;
    const local = new Date(d.getTime());
    console.log(`id=${l.id} | UTC=${d.toISOString()} | LOCAL_IST=${local.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} | shift=${l.shift} | total=${Number(l.totalAmount).toFixed(2)}`);
  }

  // Count by UTC date and by local date
  const utcJuly = logs.filter(l => l.deliveredAt.getUTCMonth() === 6 && l.deliveredAt.getUTCDate() === 1);
  console.log('\nLOGS WITH UTC DATE = July 1:', utcJuly.length);
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
