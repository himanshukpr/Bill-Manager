const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
  const admin = await prisma.user.findFirst({ where: { dairyId: 5, role: 'admin' } });
  if (!admin) { console.log('no admin for dairy 5'); return; }
  const token = jwt.sign(
    { sub: admin.uuid, username: admin.username, email: admin.email, role: admin.role, isVerified: admin.isVerified, permissions: admin.permissions ?? {}, dairyId: admin.dairyId },
    process.env.JWT_SECRET,
  );
  console.log(token);

  const house = await prisma.house.findFirst({ where: { houseNo: '834 G', dairyId: 5 } });
  console.log('houseId:', house.id);

  const res = await fetch(`http://localhost:5000/delivery-logs?houseId=${house.id}&dairyId=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('STATUS:', res.status);
  const data = await res.json();
  console.log('API RETURNED LOGS:', Array.isArray(data) ? data.length : JSON.stringify(data).slice(0, 300));
  if (Array.isArray(data)) {
    for (const l of data) {
      console.log(`id=${l.id} date=${l.deliveredAt} shift=${l.shift} total=${l.totalAmount}`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
