const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.account.findMany({
    where: { accountType: 'META' },
    select: {
      id: true,
      name: true,
      metaAdAccountId: true,
      metaAccessToken: true
    }
  });

  console.log('META ACCOUNTS:');
  console.log('==============');
  accounts.forEach(a => {
    console.log('- ' + a.name);
    console.log('  ID: ' + a.id);
    console.log('  Ad Account ID: ' + (a.metaAdAccountId || 'NOT SET'));
    console.log('  Access Token: ' + (a.metaAccessToken ? 'SET (' + a.metaAccessToken.substring(0,20) + '...)' : 'NOT SET'));
    console.log('');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
