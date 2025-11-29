require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

// Local database (from .env)
const localPrisma = new PrismaClient();

// Supabase database
const supabasePrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres.ojhflsfnlwnpysvwtvnw:Legolas9OD7A9SX!@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
    }
  }
});

async function main() {
  console.log('Fetching accounts from local database...');

  const accounts = await localPrisma.account.findMany({
    where: { isActive: true },
    orderBy: { accountType: 'asc' }
  });

  console.log(`Found ${accounts.length} accounts to migrate`);

  let successCount = 0;
  let errorCount = 0;

  for (const acc of accounts) {
    try {
      // Check if account already exists in Supabase
      const existing = await supabasePrisma.account.findUnique({
        where: { id: acc.id }
      });

      if (existing) {
        console.log(`⏭️  Account "${acc.name}" already exists, skipping`);
        continue;
      }

      // Create account in Supabase
      await supabasePrisma.account.create({
        data: {
          id: acc.id,
          name: acc.name,
          accountType: acc.accountType,
          tonicConsumerKey: acc.tonicConsumerKey,
          tonicConsumerSecret: acc.tonicConsumerSecret,
          tonicJwtToken: acc.tonicJwtToken,
          tonicTokenExpiry: acc.tonicTokenExpiry,
          tonicSupportsRSOC: acc.tonicSupportsRSOC,
          tonicSupportsDisplay: acc.tonicSupportsDisplay,
          tonicRSOCDomains: acc.tonicRSOCDomains,
          tonicCapabilitiesLastChecked: acc.tonicCapabilitiesLastChecked,
          metaAdAccountId: acc.metaAdAccountId,
          metaPortfolio: acc.metaPortfolio,
          metaPageId: acc.metaPageId,
          metaAccessToken: acc.metaAccessToken,
          metaPixelId: acc.metaPixelId,
          tiktokAdvertiserId: acc.tiktokAdvertiserId,
          tiktokAccessToken: acc.tiktokAccessToken,
          tiktokPixelId: acc.tiktokPixelId,
          linkedTonicAccountId: acc.linkedTonicAccountId,
          isActive: true
        }
      });

      console.log(`✅ Migrated: ${acc.name} (${acc.accountType})`);
      successCount++;
    } catch (err) {
      console.error(`❌ Error migrating ${acc.name}: ${err.message}`);
      errorCount++;
    }
  }

  console.log('\n--- Migration Summary ---');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    await localPrisma.$disconnect();
    await supabasePrisma.$disconnect();
  });
