import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating initial invitation codes...');

  const codes = [
    { code: 'LAUNCHPRO-2024' },
    { code: 'MANAGER-INVITE-001' },
    { code: 'MANAGER-INVITE-002' },
    { code: 'MANAGER-INVITE-003' },
  ];

  for (const codeData of codes) {
    const existing = await prisma.invitationCode.findUnique({
      where: { code: codeData.code },
    });

    if (existing) {
      console.log(`Code ${codeData.code} already exists (used: ${existing.used})`);
      continue;
    }

    await prisma.invitationCode.create({
      data: codeData,
    });
    console.log(`Created invitation code: ${codeData.code}`);
  }

  console.log('\nDone! Available codes:');
  const allCodes = await prisma.invitationCode.findMany({
    where: { used: false },
    select: { code: true },
  });
  allCodes.forEach((c) => console.log(`  - ${c.code}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
