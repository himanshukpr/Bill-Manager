import { PrismaClient, Role, Shift, House, HouseBalance } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL not set in environment');
  process.exit(1);
}

const adapter = new PrismaMariaDb(databaseUrl);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

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

  const hashedPassword = await bcrypt.hash('password123', 10);

  // ─── Users ───────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: Role.admin,
      isVerified: true,
    },
  });

  const raj = await prisma.user.create({
    data: {
      username: 'rajesh',
      email: 'rajesh@example.com',
      password: hashedPassword,
      role: Role.supplier,
      isVerified: true,
    },
  });

  const amit = await prisma.user.create({
    data: {
      username: 'amit',
      email: 'amit@example.com',
      password: hashedPassword,
      role: Role.supplier,
      isVerified: true,
    },
  });

  const suresh = await prisma.user.create({
    data: {
      username: 'suresh',
      email: 'suresh@example.com',
      password: hashedPassword,
      role: Role.supplier,
      isVerified: true,
    },
  });

  // Unverified supplier (pending approval)
  await prisma.user.create({
    data: {
      username: 'pending_user',
      email: 'pending@example.com',
      password: hashedPassword,
      role: Role.supplier,
      isVerified: false,
    },
  });

  console.log('  ✓ Users created');

  // ─── Houses ──────────────────────────────────────────
  const housesData = [
    { houseNo: 'A-101', area: 'Sector A', phoneNo: '9876543210', rate1Type: 'Cow Milk', rate1: 55, rate2Type: 'Buffalo Milk', rate2: 70, location: '28.6129,77.2295', description: 'Corner house near park' },
    { houseNo: 'A-102', area: 'Sector A', phoneNo: '9876543211', rate1Type: 'Cow Milk', rate1: 55, rate2Type: null, rate2: null, location: '28.6130,77.2296', description: null },
    { houseNo: 'A-103', area: 'Sector A', phoneNo: '9876543212', rate1Type: 'Buffalo Milk', rate1: 70, rate2Type: 'Curd', rate2: 40, location: '28.6131,77.2297', description: 'Near temple' },
    { houseNo: 'B-201', area: 'Sector B', phoneNo: '9876543213', rate1Type: 'Cow Milk', rate1: 55, rate2Type: null, rate2: null, location: '28.6140,77.2300', description: null },
    { houseNo: 'B-202', area: 'Sector B', phoneNo: '9876543214', alternativePhone: '9876543215', rate1Type: 'Cow Milk', rate1: 60, rate2Type: 'Buttermilk', rate2: 30, location: '28.6141,77.2301', description: 'Two-storey building' },
    { houseNo: 'B-203', area: 'Sector B', phoneNo: '9876543216', rate1Type: 'Buffalo Milk', rate1: 70, rate2Type: null, rate2: null, location: '28.6142,77.2302', description: 'Red gate' },
    { houseNo: 'C-301', area: 'Sector C', phoneNo: '9876543217', rate1Type: 'Cow Milk', rate1: 55, rate2Type: 'Curd', rate2: 40, location: '28.6150,77.2310', description: null },
    { houseNo: 'C-302', area: 'Sector C', phoneNo: '9876543218', rate1Type: 'Cow Milk', rate1: 55, rate2Type: 'Buffalo Milk', rate2: 70, location: '28.6151,77.2311', description: 'Opposite school' },
    { houseNo: 'C-303', area: 'Sector C', phoneNo: '9876543219', rate1Type: 'Cow Milk', rate1: 55, rate2Type: null, rate2: null, location: '28.6152,77.2312', description: null },
    { houseNo: 'D-401', area: 'Sector D', phoneNo: '9876543220', rate1Type: 'Buffalo Milk', rate1: 70, rate2Type: 'Buttermilk', rate2: 30, location: '28.6160,77.2320', description: 'Near water tank' },
    { houseNo: 'D-402', area: 'Sector D', phoneNo: '9876543221', rate1Type: 'Cow Milk', rate1: 55, rate2Type: null, rate2: null, location: '28.6161,77.2321', description: null },
    { houseNo: 'E-501', area: 'Sector E', phoneNo: '9876543222', rate1Type: 'Cow Milk', rate1: 55, rate2Type: 'Curd', rate2: 40, location: '28.6170,77.2330', description: 'Last house on street' },
  ];

  const houses: House[] = [];
  for (const h of housesData) {
    const house = await prisma.house.create({ data: h });
    houses.push(house);
  }
  console.log('  ✓ Houses created');

  // ─── Product Rates ───────────────────────────────────
  const productRates = [
    { name: 'Cow Milk', unit: 'L', rate: 55 },
    { name: 'Buffalo Milk', unit: 'L', rate: 70 },
    { name: 'Curd', unit: 'Kg', rate: 40 },
    { name: 'Buttermilk', unit: 'L', rate: 30 },
    { name: 'Paneer', unit: 'Kg', rate: 200 },
    { name: 'Ghee', unit: 'L', rate: 500 },
  ];

  for (const pr of productRates) {
    await prisma.productRate.create({ data: pr });
  }
  console.log('  ✓ Product rates created');

  // ─── House Configs ───────────────────────────────────
  // Each house gets exactly one config (houseId is unique).
  // Rajesh (morning): Sector A & B (houses 0-4)
  // Amit (morning): Sector C (houses 5-7)
  // Suresh (evening): Sector D (houses 8-9)
  // Amit (shop): Sector E (houses 10-11)
  const configData = [
    { house: houses[0], shift: Shift.morning, supplier: raj, position: 0, alerts: { enabled: true, time: '06:00' } },
    { house: houses[1], shift: Shift.morning, supplier: raj, position: 1, alerts: { enabled: true, time: '06:00' } },
    { house: houses[2], shift: Shift.morning, supplier: raj, position: 2, alerts: { enabled: true, time: '06:00' } },
    { house: houses[3], shift: Shift.morning, supplier: raj, position: 3, alerts: { enabled: true, time: '06:00' } },
    { house: houses[4], shift: Shift.morning, supplier: raj, position: 4, alerts: { enabled: true, time: '06:00' } },
    { house: houses[5], shift: Shift.morning, supplier: amit, position: 5, alerts: { enabled: true, time: '06:00' } },
    { house: houses[6], shift: Shift.morning, supplier: amit, position: 6, alerts: { enabled: true, time: '06:00' } },
    { house: houses[7], shift: Shift.morning, supplier: amit, position: 7, alerts: { enabled: true, time: '06:00' } },
    { house: houses[8], shift: Shift.evening, supplier: suresh, position: 0, alerts: { enabled: false } },
    { house: houses[9], shift: Shift.evening, supplier: suresh, position: 1, alerts: { enabled: false } },
    { house: houses[10], shift: Shift.shop, supplier: amit, position: 0, alerts: null },
    { house: houses[11], shift: Shift.shop, supplier: amit, position: 1, alerts: null },
  ];

  for (const c of configData) {
    await prisma.houseConfig.create({
      data: {
        houseId: c.house.id,
        shift: c.shift,
        supplierId: c.supplier.uuid,
        position: c.position,
        ...(c.alerts ? { dailyAlerts: JSON.stringify(c.alerts) } : {}),
      },
    });
  }
  console.log('  ✓ House configs created');

  // ─── House Balances (with previous balance) ──────────
  const balanceData = [
    { houseId: houses[0].id, previousBalance: 1200, currentBalance: 1850 },
    { houseId: houses[1].id, previousBalance: 0, currentBalance: 550 },
    { houseId: houses[2].id, previousBalance: 750, currentBalance: 1320 },
    { houseId: houses[3].id, previousBalance: 340, currentBalance: 890 },
    { houseId: houses[4].id, previousBalance: 2100, currentBalance: 2560 },
    { houseId: houses[5].id, previousBalance: 0, currentBalance: 420 },
    { houseId: houses[6].id, previousBalance: 560, currentBalance: 1110 },
    { houseId: houses[7].id, previousBalance: 1800, currentBalance: 2350 },
    { houseId: houses[8].id, previousBalance: 0, currentBalance: 670 },
    { houseId: houses[9].id, previousBalance: 920, currentBalance: 1480 },
    { houseId: houses[10].id, previousBalance: 450, currentBalance: 790 },
    { houseId: houses[11].id, previousBalance: 1500, currentBalance: 2030 },
  ];

  const balances: HouseBalance[] = [];
  for (const b of balanceData) {
    const balance = await prisma.houseBalance.create({ data: b });
    balances.push(balance);
  }
  console.log('  ✓ House balances created');

  // ─── Payment History (receipts) ──────────────────────
  const payments = [
    { balanceRef: balances[0].id, amount: 500, discount: 0, note: 'Partial payment for March bill', createdAt: new Date('2026-03-10') },
    { balanceRef: balances[0].id, amount: 700, discount: 50, note: 'Full payment + discount', createdAt: new Date('2026-04-05') },
    { balanceRef: balances[2].id, amount: 750, discount: 0, note: 'Previous balance cleared', createdAt: new Date('2026-03-15') },
    { balanceRef: balances[4].id, amount: 1000, discount: 100, note: 'March bill payment with loyalty discount', createdAt: new Date('2026-03-28') },
    { balanceRef: balances[4].id, amount: 1100, discount: 0, note: 'April advance payment', createdAt: new Date('2026-04-01') },
    { balanceRef: balances[7].id, amount: 800, discount: 0, note: 'Part payment', createdAt: new Date('2026-03-20') },
    { balanceRef: balances[9].id, amount: 500, discount: 50, note: 'Discount on timely payment', createdAt: new Date('2026-04-02') },
    { balanceRef: balances[11].id, amount: 1500, discount: 0, note: 'Full settlement', createdAt: new Date('2026-03-25') },
    { balanceRef: balances[3].id, amount: 340, discount: 0, note: 'Previous balance paid', createdAt: new Date('2026-04-01') },
    { balanceRef: balances[6].id, amount: 300, discount: 0, note: 'Part payment', createdAt: new Date('2026-04-08') },
  ];

  for (const p of payments) {
    await prisma.paymentHistory.create({ data: p });
  }
  console.log('  ✓ Payment history created');

  // ─── Delivery Logs (last 30 days) ────────────────────
  // Build lookup from house ID to config info
  const houseConfigMap = new Map<number, { shift: Shift; supplierId: string }>();
  for (const c of configData) {
    houseConfigMap.set(c.house.id, { shift: c.shift, supplierId: c.supplier.uuid });
  }

  const now = new Date();

  for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(6, 0, 0, 0);

    for (const house of houses) {
      const cfg = houseConfigMap.get(house.id);
      if (!cfg) continue;

      // Main shift delivery
      const qty1 = 1 + Math.floor(Math.random() * 3);
      const milkType = house.rate1Type || 'Cow Milk';
      const rate = Number(house.rate1 || 55);
      const amount1 = qty1 * rate;

      const items: any[] = [{ milkType, qty: qty1, rate, amount: amount1 }];
      let totalAmount = amount1;

      if (house.rate2Type && Math.random() > 0.5) {
        const qty2 = Math.floor(Math.random() * 2) + 1;
        const rate2 = Number(house.rate2 || 40);
        const amount2 = qty2 * rate2;
        items.push({ milkType: house.rate2Type, qty: qty2, rate: rate2, amount: amount2 });
        totalAmount += amount2;
      }

      const opening = 10 + Math.floor(Math.random() * 50);

      // Determine delivery time based on shift
      const deliveryDate = new Date(date);
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
          billGenerated: dayOffset > 25,
        },
      });
    }
  }
  console.log('  ✓ Delivery logs created (30 days)');

  // ─── Bills (last 2 months) ───────────────────────────
  const billMonths = [
    { month: 3, year: 2026, fromDate: new Date('2026-03-01'), toDate: new Date('2026-03-31') },
    { month: 4, year: 2026, fromDate: new Date('2026-04-01'), toDate: new Date('2026-04-30') },
  ];

  for (const bm of billMonths) {
    for (let i = 0; i < houses.length; i++) {
      const house = houses[i];
      const bal = balances[i];

      const cowQty = 30 + Math.floor(Math.random() * 60);
      const cowRate = Number(house.rate1 || 55);
      const cowAmount = cowQty * cowRate;

      const items: any[] = [
        { name: house.rate1Type || 'Cow Milk', quantity: cowQty, rate: cowRate, amount: cowAmount },
      ];

      let totalAmount = cowAmount;

      if (house.rate2Type) {
        const qty2 = 5 + Math.floor(Math.random() * 20);
        const rate2 = Number(house.rate2 || 40);
        const amount2 = qty2 * rate2;
        items.push({ name: house.rate2Type, quantity: qty2, rate: rate2, amount: amount2 });
        totalAmount += amount2;
      }

      const prevBal = bm.month === 3 ? bal.previousBalance : bal.currentBalance;

      const bill = await prisma.bill.create({
        data: {
          month: bm.month,
          year: bm.year,
          fromDate: bm.fromDate,
          toDate: bm.toDate,
          totalAmount,
          items,
          previousBalance: prevBal,
          outstandingAmount: totalAmount + Number(prevBal),
          houseId: house.id,
          isClosed: false,
          note: null,
        },
      });

      // Add notes to some bills
      if (i % 3 === 0) {
        await prisma.billNote.create({
          data: {
            billId: bill.id,
            houseNo: house.houseNo,
            note: { message: `Bill includes ${items.length} products` },
          },
        });
      }
    }
  }
  console.log('  ✓ Bills created (March & April)');

  // ─── Delivery Plans ──────────────────────────────────
  const deliveryPlans = [
    { supplier_id: raj.uuid, product_name: 'Cow Milk', quantity_per_go: 50, number_of_goes: 2, total_quantity: 100 },
    { supplier_id: raj.uuid, product_name: 'Buffalo Milk', quantity_per_go: 30, number_of_goes: 1, total_quantity: 30 },
    { supplier_id: amit.uuid, product_name: 'Cow Milk', quantity_per_go: 40, number_of_goes: 2, total_quantity: 80 },
    { supplier_id: amit.uuid, product_name: 'Curd', quantity_per_go: 20, number_of_goes: 1, total_quantity: 20 },
    { supplier_id: suresh.uuid, product_name: 'Cow Milk', quantity_per_go: 60, number_of_goes: 1, total_quantity: 60 },
  ];

  for (const dp of deliveryPlans) {
    await prisma.deliveryPlan.create({ data: dp });
  }
  console.log('  ✓ Delivery plans created');

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📋 Credentials:');
  console.log('   Admin:    admin / password123');
  console.log('   Supplier: rajesh / password123');
  console.log('   Supplier: amit / password123');
  console.log('   Supplier: suresh / password123');
  console.log('   Pending:  pending_user / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
