import { PrismaClient, Role, Shift } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL!;
const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database for May 2026...');

  // Clean existing data in reverse dependency order
  await prisma.deliveryPlan.deleteMany();
  await prisma.billNote.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.paymentHistory.deleteMany();
  await prisma.houseBalance.deleteMany();
  await prisma.deliveryLog.deleteMany();
  await prisma.houseConfig.deleteMany();
  await prisma.productRate.deleteMany();
  await prisma.house.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dairy.deleteMany();

  const hashedPassword = await bcrypt.hash('123123', 10);

  // ─── Dairy ────────────────────────────────────────────
  const dairy = await prisma.dairy.create({
    data: {
      name: 'GNK Dairy',
      email: 'gnk@example.com',
      password: hashedPassword,
      phone: '9876543210',
      address: 'Main Market, Ganaur',
      ownerName: 'G.N. Kamboj',
    },
  });
  console.log('  ✓ Dairy created');

  // ─── Users ───────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { username: 'admin', email: 'admin@example.com', password: hashedPassword, role: Role.admin, isVerified: true, dairyId: dairy.id },
  });

  const raj = await prisma.user.create({
    data: { username: 'rajesh', email: 'rajesh@example.com', password: hashedPassword, role: Role.supplier, isVerified: true, dairyId: dairy.id },
  });

  const amit = await prisma.user.create({
    data: { username: 'amit', email: 'amit@example.com', password: hashedPassword, role: Role.supplier, isVerified: true, dairyId: dairy.id },
  });

  const suresh = await prisma.user.create({
    data: { username: 'suresh', email: 'suresh@example.com', password: hashedPassword, role: Role.supplier, isVerified: true, dairyId: dairy.id },
  });

  await prisma.user.create({
    data: { username: 'pending_user', email: 'pending@example.com', password: hashedPassword, role: Role.supplier, isVerified: false, dairyId: dairy.id },
  });

  console.log('  ✓ Users created');

  // ─── Houses ──────────────────────────────────────────
  const housesData: any[] = [];
  
  // Generate 200 houses across different sectors and shifts
  // Rajesh: Morning (70 houses)
  // Amit: Morning (70 houses)
  // Suresh: Evening (60 houses)
  
  for (let i = 1; i <= 70; i++) {
    housesData.push({ 
      houseNo: `R-${String(i).padStart(3, '0')}`, 
      area: 'Rajesh Sector', 
      phoneNo: `987650${String(i).padStart(4, '0')}`, 
      rate1Type: 'Cow Milk', rate1: 55, 
      rate2Type: i % 3 === 0 ? 'Buffalo Milk' : i % 3 === 1 ? 'Curd' : null, 
      rate2: i % 3 === 0 ? 70 : i % 3 === 1 ? 40 : null,
      location: '28.6129,77.2295',
      description: `Rajesh house ${i}`,
      dairyId: dairy.id,
    });
  }
  
  for (let i = 1; i <= 70; i++) {
    housesData.push({ 
      houseNo: `A-${String(i).padStart(3, '0')}`, 
      area: 'Amit Sector', 
      phoneNo: `987660${String(i).padStart(4, '0')}`, 
      rate1Type: 'Cow Milk', rate1: 55, 
      rate2Type: i % 4 === 0 ? 'Buffalo Milk' : i % 4 === 1 ? 'Buttermilk' : null, 
      rate2: i % 4 === 0 ? 70 : i % 4 === 1 ? 30 : null,
      location: '28.6140,77.2300',
      description: `Amit house ${i}`,
      dairyId: dairy.id,
    });
  }
  
  for (let i = 1; i <= 60; i++) {
    housesData.push({ 
      houseNo: `S-${String(i).padStart(3, '0')}`, 
      area: 'Suresh Sector', 
      phoneNo: `987670${String(i).padStart(4, '0')}`, 
      rate1Type: 'Buffalo Milk', rate1: 70, 
      rate2Type: i % 5 === 0 ? 'Curd' : null, 
      rate2: i % 5 === 0 ? 40 : null,
      location: '28.6160,77.2320',
      description: `Suresh house ${i}`,
      dairyId: dairy.id,
    });
  }

  const houses: any[] = [];
  for (const h of housesData) {
    houses.push(await prisma.house.create({ data: h }));
  }
  console.log('  ✓ Houses created');

  // ─── Product Rates ───────────────────────────────────
  const productRatesData = [
    { name: 'Cow Milk', unit: 'L', rate: 55, sortOrder: 0, dairyId: dairy.id },
    { name: 'Buffalo Milk', unit: 'L', rate: 70, sortOrder: 1, dairyId: dairy.id },
    { name: 'Curd', unit: 'Kg', rate: 40, sortOrder: 2, dairyId: dairy.id },
    { name: 'Buttermilk', unit: 'L', rate: 30, sortOrder: 3, dairyId: dairy.id },
    { name: 'Paneer', unit: 'Kg', rate: 200, sortOrder: 4, dairyId: dairy.id },
    { name: 'Ghee', unit: 'L', rate: 500, sortOrder: 5, dairyId: dairy.id },
  ];

  for (const pr of productRatesData) {
    await prisma.productRate.create({ data: pr as any });
  }
  console.log('  ✓ Product rates created');

  // ─── House Configs ───────────────────────────────────
  const configData: any[] = [];
  
  // Rajesh: Morning (houses 0-69)
  for (let i = 0; i < 70; i++) {
    configData.push({ house: houses[i], shift: Shift.morning, supplier: raj, position: i });
  }
  
  // Amit: Morning (houses 70-139)
  for (let i = 70; i < 140; i++) {
    configData.push({ house: houses[i], shift: Shift.morning, supplier: amit, position: i - 70 });
  }
  
  // Suresh: Evening (houses 140-199)
  for (let i = 140; i < 200; i++) {
    configData.push({ house: houses[i], shift: Shift.evening, supplier: suresh, position: i - 140 });
  }

  for (const c of configData) {
    await prisma.houseConfig.create({
      data: { houseId: c.house.id, shift: c.shift, supplierId: c.supplier.uuid, position: c.position, dairyId: dairy.id },
    });
  }
  console.log('  ✓ House configs created');

  // ─── House Balances (both previous & current) ────────
  const balanceData: any[] = [];
  for (let i = 0; i < houses.length; i++) {
    balanceData.push({ 
      houseId: houses[i].id, 
      previousBalance: 100 + Math.floor(Math.random() * 2000), 
      currentBalance: 0,
      dairyId: dairy.id,
    });
  }

  for (const b of balanceData) {
    await prisma.houseBalance.create({ data: b });
  }
  console.log('  ✓ House balances created');

  const houseConfigMap = new Map<number, { shift: Shift; supplierId: string }>();
  for (const c of configData) {
    houseConfigMap.set(c.house.id, { shift: c.shift, supplierId: c.supplier.uuid });
  }

  // ─── Delivery Logs (May 1-31) ────────────────────────

  for (let day = 1; day <= 31; day++) {
    for (const house of houses) {
      const cfg = houseConfigMap.get(house.id);
      if (!cfg) continue;

      const qty1 = 1 + Math.floor(Math.random() * 3);
      const milkType = house.rate1Type || 'Cow Milk';
      const rate = Number(house.rate1 || 55);
      const amount1 = qty1 * rate;

      const items: any[] = [{ milkType, qty: qty1, rate, amount: amount1 }];
      let totalAmount = amount1;

      if (house.rate2Type && Math.random() > 0.4) {
        const qty2 = 1 + Math.floor(Math.random() * 2);
        const rate2 = Number(house.rate2 || 40);
        const amount2 = qty2 * rate2;
        items.push({ milkType: house.rate2Type, qty: qty2, rate: rate2, amount: amount2 });
        totalAmount += amount2;
      }

      const opening = 10 + Math.floor(Math.random() * 50);

      const deliveryDate = new Date(2026, 4, day); // May is month 4 (0-indexed)
      if (cfg.shift === Shift.morning) deliveryDate.setHours(6, 0, 0, 0);
      else if (cfg.shift === Shift.evening) deliveryDate.setHours(17, 0, 0, 0);
      else deliveryDate.setHours(10, 0, 0, 0);

      await prisma.deliveryLog.create({
        data: {
          houseId: house.id,
          supplierId: cfg.supplierId,
          shift: cfg.shift,
          items,
          totalAmount,
          openingBalance: opening,
          closingBalance: opening + totalAmount,
          deliveredAt: deliveryDate,
          billGenerated: false,
          isClosed: false,
          dairyId: dairy.id,
        },
      });
    }
  }
  console.log('  ✓ Delivery logs created (May 1-31)');

  // ─── Fix currentBalance to match actual delivery totals ──
  for (const house of houses) {
    const agg = await prisma.deliveryLog.aggregate({
      where: { houseId: house.id },
      _sum: { totalAmount: true },
    });
    const actualTotal = agg._sum.totalAmount ?? 0;
    await prisma.houseBalance.update({
      where: { houseId: house.id },
      data: { currentBalance: actualTotal },
    });
  }
  console.log('  ✓ House balances synced with delivery totals');

  // ─── Delivery Plans ──────────────────────────────────
  const deliveryPlans = [
    { supplier_id: raj.uuid, product_name: 'Cow Milk', quantity_per_go: 50, number_of_goes: 2, total_quantity: 100, dairyId: dairy.id },
    { supplier_id: raj.uuid, product_name: 'Buffalo Milk', quantity_per_go: 30, number_of_goes: 1, total_quantity: 30, dairyId: dairy.id },
    { supplier_id: amit.uuid, product_name: 'Cow Milk', quantity_per_go: 40, number_of_goes: 2, total_quantity: 80, dairyId: dairy.id },
    { supplier_id: amit.uuid, product_name: 'Curd', quantity_per_go: 20, number_of_goes: 1, total_quantity: 20, dairyId: dairy.id },
    { supplier_id: suresh.uuid, product_name: 'Cow Milk', quantity_per_go: 60, number_of_goes: 1, total_quantity: 60, dairyId: dairy.id },
  ];

  for (const dp of deliveryPlans) {
    await prisma.deliveryPlan.create({ data: dp as any });
  }
  console.log('  ✓ Delivery plans created');

  console.log('\n✅ May 2026 seeded successfully!');
  console.log(`   Dairies: ${await prisma.dairy.count()}`);
  console.log(`   Users: ${await prisma.user.count()}`);
  console.log(`   Houses: ${await prisma.house.count()}`);
  console.log(`   Product rates: ${await prisma.productRate.count()}`);
  console.log(`   House configs: ${await prisma.houseConfig.count()}`);
  console.log(`   House balances: ${await prisma.houseBalance.count()}`);
  console.log(`   Delivery logs: ${await prisma.deliveryLog.count()}`);
  console.log(`   Delivery plans: ${await prisma.deliveryPlan.count()}`);
  console.log(`   Bills: ${await prisma.bill.count()}`);
  console.log(`   Payments: ${await prisma.paymentHistory.count()}`);
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
