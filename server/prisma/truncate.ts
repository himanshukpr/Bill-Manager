import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Truncating all tables except users...');

  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  await prisma.deliveryPlan.deleteMany();
  await prisma.billNote.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.paymentHistory.deleteMany();
  await prisma.houseBalance.deleteMany();
  await prisma.deliveryLog.deleteMany();
  await prisma.houseConfig.deleteMany();
  await prisma.productRate.deleteMany();
  await prisma.house.deleteMany();
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');

  console.log('  ✓ All tables truncated (users preserved)');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
