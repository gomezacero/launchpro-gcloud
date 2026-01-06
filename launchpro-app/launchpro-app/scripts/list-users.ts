import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const managers = await prisma.manager.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\n--- Managers in Database ---');
  managers.forEach((manager) => {
    console.log(`Name: ${manager.name}`);
    console.log(`Email: ${manager.email}`);
    console.log(`Role: ${manager.role}`);
    console.log(`ID: ${manager.id}`);
    console.log('---');
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
